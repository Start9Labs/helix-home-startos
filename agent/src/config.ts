import { z } from 'zod'

const envSchema = z.object({
  HELIX_DATA_DIR: z.string().default('/data'),
  HELIX_CONFIG_PATH: z.string().default('/data/config.json'),
  MATRIX_HOMESERVER: z.string().default(''),
  MATRIX_USER_ID: z.string().default(''),
  MATRIX_ACCESS_TOKEN: z.string().default(''),
  MATRIX_ALLOW_LIST: z.string().default(''),
  GITEA_HOST: z.string().default(''),
  GITEA_TOKEN: z.string().default(''),
  VLLM_ENDPOINT: z.string().default(''),
  VLLM_MODEL: z.string().default(''),
  STALL_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse(process.env)

export const allowList: Set<string> = new Set(
  env.MATRIX_ALLOW_LIST.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export const hasMatrixCreds = !!(
  env.MATRIX_HOMESERVER &&
  env.MATRIX_USER_ID &&
  env.MATRIX_ACCESS_TOKEN
)

export const hasVllm = !!(env.VLLM_ENDPOINT && env.VLLM_MODEL)
