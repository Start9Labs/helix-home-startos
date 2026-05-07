import { i18n } from './i18n'
import { sdk } from './sdk'
import { configFile } from './fileModels/config'
import { dataDir } from './utils'

const SYNAPSE_FALLBACK = 'http://synapse.startos'
const GITEA_FALLBACK = 'http://gitea.startos'
const VLLM_FALLBACK_ENDPOINT = 'http://vllm.startos:8000/v1'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Helix Home...'))

  await configFile.merge(effects, {})
  const cfg = (await configFile.read((c) => c).const(effects)) ?? null

  // ----- resolve matrix homeserver -----
  let matrixHomeserver = ''
  if (cfg?.matrix.mode === 'external') {
    matrixHomeserver = cfg.matrix.homeserver
  } else {
    const sif = await sdk.serviceInterface
      .get(effects, { id: 'homeserver', packageId: 'synapse' })
      .const()
    matrixHomeserver =
      sif?.addressInfo?.nonLocal.format('urlstring')[0] ?? SYNAPSE_FALLBACK
  }

  // ----- resolve gitea host -----
  let giteaHost = ''
  if (cfg?.gitea.mode === 'external') {
    giteaHost = cfg.gitea.host
  } else {
    const sif = await sdk.serviceInterface
      .get(effects, { id: 'http', packageId: 'gitea' })
      .const()
    giteaHost =
      sif?.addressInfo?.nonLocal.format('urlstring')[0] ?? GITEA_FALLBACK
  }

  // ----- resolve vllm endpoint + (eventual) apiKey -----
  let vllmEndpoint = ''
  let vllmApiKey = ''
  let vllmDepStorePath = ''
  if (cfg?.vllm.mode === 'external') {
    vllmEndpoint = cfg.vllm.endpoint
    vllmApiKey = cfg.vllm.apiKey
  } else {
    vllmEndpoint = VLLM_FALLBACK_ENDPOINT
    // The agent will read this on boot to pick up apiKey from vllm's
    // public credentials.json.
    vllmDepStorePath = '/run/vllm/credentials.json'
  }

  // ----- build mounts: only mount vllm dep when integration is "internal"
  let mounts = sdk.Mounts.of().mountVolume({
    volumeId: 'main',
    subpath: null,
    mountpoint: dataDir,
    readonly: false,
  })
  if (cfg?.vllm.mode === 'internal') {
    mounts = mounts.mountDependency({
      dependencyId: 'vllm',
      volumeId: 'public',
      subpath: null,
      mountpoint: '/run/vllm',
      readonly: true,
    })
  }

  const sub = await sdk.SubContainer.of(
    effects,
    { imageId: 'helix-home' },
    mounts,
    'helix-home-sub',
  )

  return sdk.Daemons.of(effects).addDaemon('agent', {
    subcontainer: sub,
    exec: {
      command: ['node', '/app/build/index.js'],
      env: {
        HELIX_DATA_DIR: dataDir,
        HELIX_CONFIG_PATH: `${dataDir}/config.json`,
        MATRIX_HOMESERVER: matrixHomeserver,
        MATRIX_USER_ID: cfg?.matrixUserId ?? '',
        MATRIX_ACCESS_TOKEN: cfg?.matrixAccessToken ?? '',
        MATRIX_ALLOW_LIST: cfg?.allowList ?? '',
        GITEA_HOST: giteaHost,
        GITEA_TOKEN: cfg?.giteaToken ?? '',
        VLLM_ENDPOINT: vllmEndpoint,
        VLLM_API_KEY: vllmApiKey,
        VLLM_MODEL: cfg?.vllmModel ?? '',
        VLLM_DEP_STORE: vllmDepStorePath,
      },
    },
    ready: {
      display: i18n('Helix Home agent'),
      fn: async () => {
        const ok = !!(
          matrixHomeserver &&
          cfg?.matrixAccessToken &&
          cfg?.vllmModel
        )
        return {
          result: ok ? 'success' : 'starting',
          message: ok
            ? i18n('The Helix Home agent is running')
            : i18n('The Helix Home agent is not running'),
        }
      },
    },
    requires: [],
  })
})
