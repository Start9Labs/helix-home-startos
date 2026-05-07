import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(
  async ({ effects: _effects }) => ({
    synapse: {
      kind: 'running',
      versionRange: '>=0.0.0',
      healthChecks: [],
    },
    gitea: {
      kind: 'running',
      versionRange: '>=0.0.0',
      healthChecks: [],
    },
    vllm: {
      kind: 'running',
      versionRange: '>=0.0.0',
      healthChecks: [],
    },
  }),
)
