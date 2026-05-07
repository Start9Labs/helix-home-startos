import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { configFileName } from '../utils'

// Each integration is either "internal" — pull config from a same-host
// dep service via mount/serviceInterface — or "external" — user supplies
// the URL/token. The shape mirrors the Value.union output produced by
// the Configure action so we can copy the result straight in.

// Defaults to "external" with empty strings on first boot — that way the
// daemon can come up before the user has resolved any deps. Switching to
// "internal" via the Configure action turns the corresponding dep into a
// hard requirement (and StartOS auto-installs it).

const matrixShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({ mode: z.literal('external'), homeserver: z.string().catch('') }),
  ])
  .catch(() => ({ mode: 'external' as const, homeserver: '' }))

const giteaShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({ mode: z.literal('external'), host: z.string().catch('') }),
  ])
  .catch(() => ({ mode: 'external' as const, host: '' }))

const vllmShape = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('internal') }),
    z.object({
      mode: z.literal('external'),
      endpoint: z.string().catch(''),
      apiKey: z.string().catch(''),
    }),
  ])
  .catch(() => ({ mode: 'external' as const, endpoint: '', apiKey: '' }))

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
