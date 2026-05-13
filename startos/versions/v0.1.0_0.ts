import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v_0_1_0 = VersionInfo.of({
  version: '0.1.0:0',
  releaseNotes: {
    en_US: 'Initial release.',
  },
  migrations: {
    up: async ({ effects: _effects }) => {},
    down: IMPOSSIBLE,
  },
})
