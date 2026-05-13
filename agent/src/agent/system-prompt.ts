import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { env } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))
// tsup copies the .md next to the bundled index.js via the
// `publicDir`/`onSuccess` step in tsup.config.ts.
const MD_PATH = join(here, 'system-prompt.md')

let cached: string | null = null

/**
 * Appended to pi-coding-agent's built-in coding-assistant prompt. The
 * prose lives in `system-prompt.md` (kept out of the .ts to avoid
 * escaping every markdown backtick); a short env-aware footer is
 * appended at boot.
 */
export function buildSystemPrompt(): string {
  if (cached) return cached
  const md = readFileSync(MD_PATH, 'utf8')
  const footer = [
    '',
    '## Live environment (this server)',
    '',
    `- Matrix homeserver: ${env.MATRIX_HOMESERVER || '(not configured)'}`,
    `- Gitea host: ${env.GITEA_HOST || '(not configured)'}`,
    `- vLLM model (you): ${env.VLLM_MODEL || '(unknown)'}`,
    `- vLLM endpoint: ${env.effectiveVllmEndpoint || '(unknown)'}`,
  ].join('\n')
  cached = `${md}\n${footer}\n`
  return cached
}
