import { readFileSync } from 'node:fs'
import { z } from 'zod'

const envSchema = z.object({
  HELIX_DATA_DIR: z.string().default('/data'),
  HELIX_CONFIG_PATH: z.string().default('/data/config.json'),
  MATRIX_HOMESERVER: z.string().default(''),
  MATRIX_USER_ID: z.string().default(''),
  MATRIX_PASSWORD: z.string().default(''),
  MATRIX_ALLOW_LIST: z.string().default(''),
  GITEA_HOST: z.string().default(''),
  GITEA_TOKEN: z.string().default(''),
  /** User-supplied overrides from the Configure action. Empty = autodetect. */
  VLLM_ENDPOINT: z.string().default(''),
  VLLM_MODEL: z.string().default(''),
  /** Filled by main.ts from the dep mount. */
  VLLM_DEP_STORE: z.string().default(''),
  VLLM_DEP_ENDPOINT: z.string().default(''),
  /** Optional explicit override of pi's openai-provider api key. */
  VLLM_API_KEY: z.string().default(''),
  STALL_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
})

export type Env = z.infer<typeof envSchema>

const rawEnv: Env = envSchema.parse(process.env)

// Pull apiKey out of vllm's public credentials file (mounted from the vllm
// dep's `public` volume). Best-effort — if the mount isn't present yet
// (vllm not running) we just fall through and the agent stays idle.
function readVllmDep(): { apiKey: string } {
  if (!rawEnv.VLLM_DEP_STORE) return { apiKey: '' }
  try {
    const raw = readFileSync(rawEnv.VLLM_DEP_STORE, 'utf8')
    const j = JSON.parse(raw) as { apiKey?: unknown }
    return { apiKey: typeof j.apiKey === 'string' ? j.apiKey : '' }
  } catch {
    return { apiKey: '' }
  }
}

const dep = readVllmDep()

export const env: Env & {
  effectiveVllmEndpoint: string
  effectiveVllmModel: string
  effectiveVllmApiKey: string
} = {
  ...rawEnv,
  effectiveVllmEndpoint: rawEnv.VLLM_ENDPOINT || rawEnv.VLLM_DEP_ENDPOINT,
  effectiveVllmModel: rawEnv.VLLM_MODEL,
  effectiveVllmApiKey: rawEnv.VLLM_API_KEY || dep.apiKey,
}

export const allowList: Set<string> = new Set(
  env.MATRIX_ALLOW_LIST.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export const hasMatrixCreds = !!(
  env.MATRIX_HOMESERVER &&
  env.MATRIX_USER_ID &&
  env.MATRIX_PASSWORD
)

export const hasVllm = !!(
  env.effectiveVllmEndpoint && env.effectiveVllmModel
)
