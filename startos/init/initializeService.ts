import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { configure } from '../actions/configure'
import { startCliLogin } from '../actions/startCliLogin'

/**
 * On fresh install, surface two tasks in the StartOS UI:
 *
 * - `configure` (critical) — blocks the service from starting until the
 *   user supplies Matrix bot creds, Gitea creds, and the vLLM model name.
 *   Without these the daemon has nothing useful to do.
 *
 * - `start-cli-login` (important) — only required for the `!install`
 *   command (sideloading freshly built packages onto this server); the
 *   bot can clone, edit, commit, push and `!build` without it. Surfaced
 *   prominently but doesn't block boot.
 *
 * Tasks are idempotent by replayId (default: `<package-id>:<action-id>`),
 * so the createOwnTask calls are safe on every init.
 */
export const initializeService = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'install') return

  await sdk.action.createOwnTask(effects, configure, 'critical', {
    reason: i18n(
      'Set Matrix bot, Gitea, and vLLM credentials so the agent can boot.',
    ),
  })

  await sdk.action.createOwnTask(effects, startCliLogin, 'important', {
    reason: i18n(
      'Sign the agent into start-cli on this server. Required for `!install` (building and installing packages onto this server).',
    ),
  })
})
