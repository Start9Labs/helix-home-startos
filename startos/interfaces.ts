import { sdk } from './sdk'

// Helix Home has no built-in web UI — it talks to users via Matrix. If a
// status dashboard is added later it would attach here.
export const setInterfaces = sdk.setupInterfaces(
  async ({ effects: _effects }) => [],
)
