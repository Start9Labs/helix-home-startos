import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { configFile } from '../fileModels/config'

const { InputSpec, Value } = sdk

export const inputSpec = InputSpec.of({
  matrixHomeserver: Value.text({
    name: i18n('Matrix homeserver URL'),
    description: null,
    required: true,
    default: null,
    placeholder: 'http://matrix.startos:8008',
  }),
  matrixUserId: Value.text({
    name: i18n('Matrix bot user ID'),
    description: null,
    required: true,
    default: null,
    placeholder: '@helix:example.com',
  }),
  matrixAccessToken: Value.text({
    name: i18n('Matrix bot access token'),
    description: null,
    required: true,
    default: null,
    masked: true,
  }),
  allowList: Value.text({
    name: i18n('Allowed Matrix room or user IDs (comma-separated)'),
    description: null,
    required: false,
    default: null,
    placeholder: '!room:example.com,@me:example.com',
  }),
  giteaHost: Value.text({
    name: i18n('Gitea host URL'),
    description: null,
    required: true,
    default: null,
    placeholder: 'http://gitea.startos:3000',
  }),
  giteaToken: Value.text({
    name: i18n('Gitea API token'),
    description: null,
    required: true,
    default: null,
    masked: true,
  }),
  vllmEndpoint: Value.text({
    name: i18n('vLLM endpoint URL'),
    description: null,
    required: false,
    default: null,
    placeholder: 'http://vllm.startos:8000/v1 (auto)',
  }),
  vllmModel: Value.text({
    name: i18n('vLLM model name'),
    description: null,
    required: true,
    default: null,
    placeholder: 'Qwen/Qwen2.5-Coder-32B-Instruct',
  }),
})

export const configure = sdk.Action.withInput(
  'configure',

  async ({ effects: _effects }) => ({
    name: i18n('Configure agent'),
    description: i18n(
      'Set the Matrix bot credentials, Gitea API token, and vLLM model to use.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => {
    const cfg = await configFile.read((c) => c).once()
    if (!cfg) return {}
    return {
      matrixHomeserver: cfg.matrix.homeserver || undefined,
      matrixUserId: cfg.matrix.userId || undefined,
      matrixAccessToken: cfg.matrix.accessToken || undefined,
      allowList: cfg.matrix.allowList || undefined,
      giteaHost: cfg.gitea.host || undefined,
      giteaToken: cfg.gitea.token || undefined,
      vllmEndpoint: cfg.vllm.endpoint || undefined,
      vllmModel: cfg.vllm.model || undefined,
    }
  },

  async ({ effects, input }) => {
    await configFile.merge(effects, {
      matrix: {
        homeserver: input.matrixHomeserver,
        userId: input.matrixUserId,
        accessToken: input.matrixAccessToken,
        allowList: input.allowList ?? '',
      },
      gitea: {
        host: input.giteaHost,
        token: input.giteaToken,
      },
      vllm: {
        endpoint: input.vllmEndpoint ?? '',
        model: input.vllmModel ?? '',
      },
    })

    return {
      version: '1',
      title: i18n('Configuration saved'),
      message: null,
      result: null,
    }
  },
)
