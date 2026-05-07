import { sdk } from './sdk'
import { configFile } from './fileModels/config'

/**
 * Each integration is a union: "internal" pulls config from the same-host
 * dep service, "external" hits a user-supplied URL. We only require the
 * dep to be running when it's selected as "internal" — so users running
 * vLLM on a beefy GPU box outside StartOS don't need a stub vllm install
 * to satisfy our dependency declaration.
 *
 * The static `dependencies` block in startos/manifest/index.ts still lists
 * all three so they show up in the UI as "supported integrations" with
 * proper metadata.
 */
export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const cfg = await configFile.read((c) => c).once()

  const out: Record<
    string,
    {
      kind: 'running'
      versionRange: string
      healthChecks: never[]
    }
  > = {}

  if (cfg?.matrix.mode === 'internal') {
    out.synapse = {
      kind: 'running',
      versionRange: '>=0.0.0',
      healthChecks: [],
    }
  }
  if (cfg?.gitea.mode === 'internal') {
    out.gitea = { kind: 'running', versionRange: '>=0.0.0', healthChecks: [] }
  }
  if (cfg?.vllm.mode === 'internal') {
    out.vllm = { kind: 'running', versionRange: '>=0.0.0', healthChecks: [] }
  }

  return out
})
