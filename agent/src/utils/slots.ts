import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/**
 * Make sure the per-thread workspace exists and has a .helix/thread-id
 * marker so `helix-repo` invoked anywhere inside it attributes acquisitions
 * to this thread.
 */
export async function ensureWorkspace(
  cwd: string,
  threadId: string,
): Promise<void> {
  const helix = join(cwd, '.helix')
  await mkdir(helix, { recursive: true })
  await writeFile(join(helix, 'thread-id'), `${threadId}\n`, 'utf8')
}

/**
 * Release every helix-repo slot owned by `threadId`.
 */
export async function releaseThreadSlots(threadId: string): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn('helix-repo', ['release-thread', threadId], {
      env: process.env,
    })
    let out = ''
    p.stdout?.on('data', (b) => {
      out += b.toString()
    })
    p.stderr?.on('data', (b) => {
      out += b.toString()
    })
    p.on('close', () => resolve(out.trim()))
    p.on('error', (err) => resolve(`helix-repo unavailable: ${String(err)}`))
  })
}
