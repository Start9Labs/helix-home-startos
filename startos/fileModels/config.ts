import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { configFileName } from '../utils'

const matrixShape = z.object({
  homeserver: z.string().catch(''),
  userId: z.string().catch(''),
  accessToken: z.string().catch(''),
  allowList: z.string().catch(''),
})

const giteaShape = z.object({
  host: z.string().catch(''),
  token: z.string().catch(''),
})

const vllmShape = z.object({
  endpoint: z.string().catch(''),
  model: z.string().catch(''),
})

const shape = z.object({
  matrix: matrixShape.catch(() => matrixShape.parse({})),
  gitea: giteaShape.catch(() => giteaShape.parse({})),
  vllm: vllmShape.catch(() => vllmShape.parse({})),
})

export type AgentConfig = z.infer<typeof shape>

export const configFile = FileHelper.json(
  { base: sdk.volumes.main, subpath: configFileName },
  shape,
)
