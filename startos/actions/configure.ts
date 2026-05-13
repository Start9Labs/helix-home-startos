import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { configFile } from '../fileModels/config'

const { InputSpec, Value, Variants } = sdk

const matrixVariants = Variants.of({
  internal: {
    name: 'Internal Synapse',
    spec: InputSpec.of({}),
  },
  external: {
    name: 'External',
    spec: InputSpec.of({
      homeserver: Value.text({
        name: i18n('Matrix homeserver URL'),
        description: null,
        required: true,
        default: null,
      }),
    }),
  },
})

const giteaVariants = Variants.of({
  internal: {
    name: 'Internal Gitea',
    spec: InputSpec.of({}),
  },
  external: {
    name: 'External',
    spec: InputSpec.of({
      host: Value.text({
        name: i18n('Gitea host URL'),
        description: null,
        required: true,
        default: null,
      }),
    }),
  },
})

const vllmVariants = Variants.of({
  internal: {
    name: 'Internal vLLM',
    spec: InputSpec.of({}),
  },
  external: {
    name: 'External (OpenAI-compatible)',
    spec: InputSpec.of({
      endpoint: Value.text({
        name: i18n('vLLM endpoint URL'),
        description: i18n(
          'Base URL of the OpenAI-compatible API. `/v1` is appended automatically if you leave it off (so `https://vllm.example.com` and `https://vllm.example.com/v1` both work).',
        ),
        required: true,
        default: null,
      }),
      apiKey: Value.text({
        name: i18n('vLLM API key'),
        description: null,
        required: true,
        default: null,
        masked: true,
      }),
    }),
  },
})

export const inputSpec = InputSpec.of({
  matrix: Value.union({
    name: i18n('Matrix homeserver'),
    description: null,
    default: 'internal',
    variants: matrixVariants,
  }),
  matrixUserId: Value.text({
    name: i18n('Matrix bot user ID'),
    description: i18n(
      'Full @user:server.tld of the Matrix account the bot will sign in as. Create it on your homeserver first — Helix Home just signs in.',
    ),
    required: true,
    default: null,
    placeholder: '@helix:example.com',
  }),
  matrixPassword: Value.text({
    name: i18n('Matrix bot password'),
    description: i18n(
      'Password of the bot account. Helix Home logs in once and caches the access token on the persistent volume.',
    ),
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
  gitea: Value.union({
    name: i18n('Gitea'),
    description: null,
    default: 'internal',
    variants: giteaVariants,
  }),
  giteaToken: Value.text({
    name: i18n('Gitea API token'),
    description: null,
    required: true,
    default: null,
    masked: true,
  }),
  vllm: Value.union({
    name: i18n('vLLM (LLM backend)'),
    description: null,
    default: 'internal',
    variants: vllmVariants,
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

    const matrix =
      cfg.matrix.mode === 'external'
        ? { selection: 'external' as const, value: { homeserver: cfg.matrix.homeserver || '' } }
        : { selection: 'internal' as const, value: {} }

    const gitea =
      cfg.gitea.mode === 'external'
        ? { selection: 'external' as const, value: { host: cfg.gitea.host || '' } }
        : { selection: 'internal' as const, value: {} }

    const vllm =
      cfg.vllm.mode === 'external'
        ? {
            selection: 'external' as const,
            value: {
              endpoint: cfg.vllm.endpoint || '',
              apiKey: cfg.vllm.apiKey || '',
            },
          }
        : { selection: 'internal' as const, value: {} }

    return {
      matrix,
      matrixUserId: cfg.matrixUserId || undefined,
      matrixPassword: cfg.matrixPassword || undefined,
      allowList: cfg.allowList || undefined,
      gitea,
      giteaToken: cfg.giteaToken || undefined,
      vllm,
      vllmModel: cfg.vllmModel || undefined,
    }
  },

  async ({ effects, input }) => {
    const matrix =
      input.matrix.selection === 'external'
        ? {
            mode: 'external' as const,
            homeserver: input.matrix.value.homeserver,
          }
        : { mode: 'internal' as const }

    const gitea =
      input.gitea.selection === 'external'
        ? { mode: 'external' as const, host: input.gitea.value.host }
        : { mode: 'internal' as const }

    const vllm =
      input.vllm.selection === 'external'
        ? {
            mode: 'external' as const,
            endpoint: input.vllm.value.endpoint,
            apiKey: input.vllm.value.apiKey,
          }
        : { mode: 'internal' as const }

    await configFile.merge(effects, {
      matrix,
      matrixUserId: input.matrixUserId,
      matrixPassword: input.matrixPassword,
      allowList: input.allowList ?? '',
      gitea,
      giteaToken: input.giteaToken,
      vllm,
      vllmModel: input.vllmModel,
    })

    return {
      version: '1',
      title: i18n('Configuration saved'),
      message: null,
      result: null,
    }
  },
)
