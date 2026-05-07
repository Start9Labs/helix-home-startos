import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { env, hasMatrixCreds, hasVllm } from './config.js'
import { initAgentRuntime } from './agent/runtime.js'
import { startMatrixBot } from './matrix/index.js'
import { whoami } from './gitea/client.js'

async function main() {
  console.log('helix-home: starting...')

  for (const sub of ['home', 'workspaces', 'sessions', 'repos', 's9pks', 'matrix']) {
    mkdirSync(join(env.HELIX_DATA_DIR, sub), { recursive: true })
  }

  if (hasVllm) {
    initAgentRuntime()
  } else {
    console.warn(
      'helix-home: vLLM not configured yet, agent runtime not initialised. Run the "Configure agent" action.',
    )
  }

  const gitea = await whoami()
  if (gitea) console.log(`helix-home: gitea ok as ${gitea.login}`)
  else console.warn('helix-home: gitea not configured or unreachable')

  if (hasMatrixCreds && hasVllm) {
    await startMatrixBot()
  } else {
    console.warn(
      'helix-home: idle until "Configure agent" action provides Matrix + vLLM creds. ' +
        'Restart the service after configuring.',
    )
    // Keep the process alive so StartOS sees it as running. The user will
    // restart the daemon after configuring; on next boot we'll have creds.
    setInterval(() => {}, 1 << 30)
  }
}

main().catch((err) => {
  console.error('helix-home: fatal', err)
  process.exit(1)
})
