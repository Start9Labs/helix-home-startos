import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { configFileName } from '../utils'

// Each integration is either "internal" — pull config from a same-host
// dep service via mount/serviceInterface — or "external" — user supplies
// the URL/token. The shape mirrors the Value.union output produced by
// the Configure action so we can copy the result straight in.

const matrixShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({ mode: z.literal('external'), homeserver: z.string().catch('') }),
  ])
  .catch(() => ({ mode: 'internal' as const }))

const giteaShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({ mode: z.literal('external'), host: z.string().catch('') }),
  ])
  .catch(() => ({ mode: 'internal' as const }))

const vllmShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({
      mode: z.literal('external'),
      endpoint: z.string().catch(''),
      apiKey: z.string().catch(''),
    }),
  ])
  .catch(() => ({ mode: 'internal' as const }))

const shape = z.object({
  matrix: matrixShape,
  matrixUserId: z.string().catch(''),
  matrixAccessToken: z.string().catch(''),
  allowList: z.string().catch(''),
  gitea: giteaShape,
  giteaToken: z.string().catch(''),
  vllm: vllmShape,
  vllmModel: z.string().catch(''),
})

export type AgentConfig = z.infer<typeof shape>

export const configFile = FileHelper.json(
  { base: sdk.volumes.main, subpath: configFileName },
  shape,
)
