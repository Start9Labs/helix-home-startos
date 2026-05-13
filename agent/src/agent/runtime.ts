import { delimiter, join } from 'node:path'
import {
  AuthStorage,
  ModelRegistry,
  getAgentDir,
} from '@mariozechner/pi-coding-agent'
import type { Model } from '@mariozechner/pi-ai'
import { env, hasVllm } from '../config.js'

type Runtime = {
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  agentDir: string
  model: Model<any>
}

let runtime: Runtime | null = null

export function initAgentRuntime(): Runtime {
  if (runtime) return runtime

  // Force git/ssh into non-interactive mode so a tool that would otherwise
  // block on a credential prompt fails fast instead of hanging the session.
  process.env.GIT_TERMINAL_PROMPT = '0'
  process.env.GIT_ASKPASS = '/bin/true'
  process.env.SSH_ASKPASS = '/bin/true'
  process.env.SSH_ASKPASS_REQUIRE = 'never'
  process.env.GCM_INTERACTIVE = 'Never'

  // start-cli reads ~/.startos/config.yaml — point HOME at the persistent
  // volume so creds written by the "Sign in to StartOS" action are visible.
  const home = join(env.HELIX_DATA_DIR, 'home')
  process.env.HOME = home

  // Workspace + memory dirs the agent's bash tool will use.
  process.env.HELIX_REPOS_DIR = join(env.HELIX_DATA_DIR, 'repos')
  process.env.HELIX_S9PKS_DIR = join(env.HELIX_DATA_DIR, 's9pks')
  process.env.HELIX_DATA_DIR = env.HELIX_DATA_DIR

  // Ensure /usr/local/bin (start-cli) is on PATH for the model's bash tool.
  const required = ['/usr/local/bin', '/usr/bin', '/bin']
  const parts = (process.env.PATH ?? '').split(delimiter)
  for (const dir of required) if (!parts.includes(dir)) parts.unshift(dir)
  process.env.PATH = parts.join(delimiter)

  if (!hasVllm) {
    throw new Error(
      'vLLM endpoint or model not configured (and the dependency mount at ' +
        `${env.VLLM_DEP_STORE || '/run/vllm/store.json'} is empty or missing). ` +
        'Make sure vllm is running, or set overrides via the "Configure agent" action.',
    )
  }

  // Pi's openai provider auths via OPENAI_API_KEY env. Inject the effective
  // key (user-set override OR vllm's exported apiKey) BEFORE AuthStorage
  // initialises, so pi picks it up.
  if (env.effectiveVllmApiKey) {
    process.env.OPENAI_API_KEY = env.effectiveVllmApiKey
  }

  const agentDir = getAgentDir()
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)

  // vLLM exposes the OpenAI **chat completions** API at
  // /v1/chat/completions — NOT the newer /v1/responses API that pi-ai's
  // "openai" provider defaults to (`api: "openai-responses"`). Build
  // the model from scratch with `api: "openai-completions"` so pi-ai
  // routes through the right transport. baseUrl gets overridden to
  // the vLLM endpoint regardless.
  const model: Model<any> = {
    provider: 'openai',
    api: 'openai-completions',
    id: env.effectiveVllmModel,
    name: env.effectiveVllmModel,
    baseUrl: env.effectiveVllmEndpoint,
    reasoning: false,
    input: ['text'],
    contextWindow: 32_000,
    maxTokens: 8_192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as Model<any>

  runtime = {
    authStorage,
    modelRegistry,
    agentDir,
    model: model as Model<any>,
  }
  console.log(
    `Helix Home: pi runtime ready (openai/${env.effectiveVllmModel} @ ${env.effectiveVllmEndpoint}, ` +
      `apiKey=${env.effectiveVllmApiKey ? 'set' : 'none'})`,
  )
  return runtime
}

export function getAgentRuntime(): Runtime {
  if (!runtime)
    throw new Error('Agent runtime not initialised — call initAgentRuntime()')
  return runtime
}
