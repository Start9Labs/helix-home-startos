import { i18n } from './i18n'
import { sdk } from './sdk'
import { configFile } from './fileModels/config'
import { dataDir } from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Helix Home...'))

  // Seed the config file with empty defaults if it doesn't exist yet so the
  // agent can boot with placeholder values until the user runs the
  // "Configure agent" action.
  await configFile.merge(effects, {})
  const cfg = (await configFile.read((c) => c).const(effects)) ?? {
    matrix: { homeserver: '', userId: '', accessToken: '', allowList: '' },
    gitea: { host: '', token: '' },
    vllm: { endpoint: '', model: '' },
  }

  const sub = await sdk.SubContainer.of(
    effects,
    { imageId: 'helix-home' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: dataDir,
      readonly: false,
    }),
    'helix-home-sub',
  )

  return sdk.Daemons.of(effects).addDaemon('agent', {
    subcontainer: sub,
    exec: {
      command: ['node', '/app/build/index.js'],
      env: {
        HELIX_DATA_DIR: dataDir,
        HELIX_CONFIG_PATH: `${dataDir}/config.json`,
        MATRIX_HOMESERVER: cfg.matrix.homeserver,
        MATRIX_USER_ID: cfg.matrix.userId,
        MATRIX_ACCESS_TOKEN: cfg.matrix.accessToken,
        MATRIX_ALLOW_LIST: cfg.matrix.allowList,
        GITEA_HOST: cfg.gitea.host,
        GITEA_TOKEN: cfg.gitea.token,
        VLLM_ENDPOINT: cfg.vllm.endpoint,
        VLLM_MODEL: cfg.vllm.model,
      },
    },
    ready: {
      display: i18n('Helix Home agent'),
      fn: async () => {
        const ok = !!(cfg.matrix.homeserver && cfg.matrix.accessToken)
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
