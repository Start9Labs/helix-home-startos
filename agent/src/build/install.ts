import { spawn } from 'node:child_process'

export type RunResult = {
  code: number | null
  stdout: string
  stderr: string
}

/** Run a shell command with output captured (and tee'd to console). */
export function run(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: process.env })
    let stdout = ''
    let stderr = ''
    p.stdout?.on('data', (b) => {
      const s = b.toString()
      stdout += s
      process.stdout.write(s)
    })
    p.stderr?.on('data', (b) => {
      const s = b.toString()
      stderr += s
      process.stderr.write(s)
    })
    p.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

/**
 * Build a StartOS package living at <repoDir>. Returns absolute path of the
 * produced .s9pk on success.
 */
export async function buildPackage(repoDir: string): Promise<string> {
  const r = await run('make', [], repoDir)
  if (r.code !== 0) {
    throw new Error(
      `make exited ${r.code}: ${r.stderr.split('\n').slice(-5).join('\n')}`,
    )
  }
  // s9pk.mk emits <id>_<arch>.s9pk; pick the most recent.
  const ls = await run('ls', ['-t', '.'], repoDir)
  const s9pk = ls.stdout
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.endsWith('.s9pk'))
  if (!s9pk) throw new Error('build produced no .s9pk')
  return `${repoDir.replace(/\/+$/, '')}/${s9pk}`
}

/**
 * Sideload a built .s9pk to the StartOS host. Requires the user has run the
 * "Sign in to StartOS" action.
 */
export async function installPackage(s9pkPath: string): Promise<void> {
  const r = await run('start-cli', ['package', 'install', '-s', s9pkPath], '/')
  if (r.code !== 0) {
    throw new Error(
      `start-cli package install exited ${r.code}: ${r.stderr.split('\n').slice(-5).join('\n')}`,
    )
  }
}
