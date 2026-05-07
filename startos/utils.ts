// Constants and helpers shared across the package.

// Where the agent stores all of its state inside the container, mounted
// from the 'main' volume. Includes start-cli credentials and the agent's
// SQLite + per-thread workspaces.
export const dataDir = '/data'

export const configFileName = 'config.json'
