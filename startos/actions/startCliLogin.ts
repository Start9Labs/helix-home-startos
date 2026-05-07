import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { dataDir } from '../utils'

const { InputSpec, Value } = sdk

export const inputSpec = InputSpec.of({
  hostname: Value.text({
    name: i18n('Server hostname'),
    description: i18n(
      'Hostname or IP of this StartOS server (e.g. server-name.local).',
    ),
    required: true,
    default: null,
  }),
  password: Value.text({
    name: i18n('Server password'),
    description: i18n('StartOS master password.'),
    required: true,
    default: null,
    masked: true,
  }),
})

export const startCliLogin = sdk.Action.withInput(
  'start-cli-login',

  async ({ effects: _effects }) => ({
    name: i18n('Sign in to StartOS'),
    description: i18n(
      'Sign the agent into start-cli on this server so it can build and install packages on your behalf.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects: _effects }) => {},

  async ({ effects, input }) => {
    const mounts = sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: dataDir,
      readonly: false,
    })

    // start-cli reads ~/.startos/config.yaml and persists session state under
    // the same dir. We point HOME at the mounted volume so the credential
    // outlives the temp subcontainer and is visible to the long-running
    // agent daemon (which sets HOME the same way).
    await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'helix-home' },
      mounts,
      'start-cli-login',
      async (sub) => {
        await sub.execFail([
          'sh',
          '-c',
          [
            `export HOME="${dataDir}/home"`,
            `mkdir -p "$HOME/.startos"`,
            `printf 'host: http://%s\\n' "$1" > "$HOME/.startos/config.yaml"`,
            // Exchange the password for a session token.
            `printf '%s\\n' "$2" | start-cli auth login`,
          ].join(' && '),
          '--',
          input.hostname,
          input.password,
        ])
      },
    )

    return {
      version: '1',
      title: i18n('Sign-in successful'),
      message: null,
      result: null,
    }
  },
)
