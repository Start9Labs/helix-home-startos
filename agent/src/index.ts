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
    const missing = [
      !hasMatrixCreds && 'Matrix bot creds',
      !hasVllm &&
        'a vLLM endpoint (autodetected from the vllm dependency, or set via Configure)',
    ]
      .filter(Boolean)
      .join(' and ')
    console.warn(
      `helix-home: idle until ${missing} are available. Run the "Configure agent" ` +
        'action and then restart this service.',
    )
    setInterval(() => {}, 1 << 30)
  }
}

main().catch((err) => {
  console.error('helix-home: fatal', err)
  process.exit(1)
})
