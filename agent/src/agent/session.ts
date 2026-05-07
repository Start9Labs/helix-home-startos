import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent'
import { env } from '../config.js'
import { getAgentRuntime } from './runtime.js'

const sessions = new Map<string, AgentSession>()

/**
 * Abort the in-flight pi turn for a thread, if any. No-op if nothing is
 * running. Used by the matrix `!interrupt` path so a new prompt can take
 * over from where the aborted run left off.
 */
export async function abortThread(key: string): Promise<void> {
  const s = sessions.get(key)
  if (!s) return
  try {
    await s.abort()
  } catch {}
}

export type DispatchOptions = {
  /** Stable conversation key (Matrix thread root id). */
  key: string
  prompt: string
  /** Per-thread workspace dir (cloned repos etc. live here). */
  cwd: string
  onText?: (chunk: string) => void
  onTool?: (
    state: 'start' | 'end',
    tool: string,
    input?: unknown,
    error?: boolean,
  ) => void
}

export type DispatchResult = {
  text: string
  error?: string
  toolCount: number
}

/**
 * Dispatch a prompt to the per-thread pi session. Awaits completion.
 */
export async function dispatch(
  opts: DispatchOptions,
): Promise<DispatchResult> {
  await mkdir(opts.cwd, { recursive: true })
  const session = await getOrCreate(opts.key, opts.cwd)

  const text: string[] = []
  let toolCount = 0
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let aborted = false

  const arm = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      aborted = true
      try {
        session.abort?.()
      } catch {}
    }, env.STALL_TIMEOUT_MS)
  }
  const disarm = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = undefined
  }

  const unsubscribe = session.subscribe((event) => {
    switch (event.type) {
      case 'message_update': {
        arm()
        const sub = event.assistantMessageEvent
        if (sub.type === 'text_delta') {
          text.push(sub.delta)
          opts.onText?.(sub.delta)
        }
        return
      }
      case 'tool_execution_start': {
        disarm()
        opts.onTool?.('start', event.toolName, event.args)
        return
      }
      case 'tool_execution_end': {
        arm()
        toolCount += 1
        opts.onTool?.(
          'end',
          event.toolName,
          undefined,
          Boolean((event as { isError?: boolean }).isError),
        )
        return
      }
    }
  })

  arm()
  let error: string | undefined
  try {
    await session.prompt(opts.prompt)
  } catch (err) {
    error = aborted
      ? 'Stalled: aborted by helix-home watchdog'
      : `dispatch failed: ${String(err)}`
  } finally {
    disarm()
    unsubscribe()
  }

  return { text: text.join(''), error, toolCount }
}

async function getOrCreate(
  key: string,
  cwd: string,
): Promise<AgentSession> {
  const cached = sessions.get(key)
  if (cached) return cached
  const runtime = getAgentRuntime()
  const sessionsDir = join(env.HELIX_DATA_DIR, 'sessions', encodeKey(key))
  await mkdir(sessionsDir, { recursive: true })
  const sessionManager = SessionManager.create(sessionsDir)
  const { session } = await createAgentSession({
    cwd,
    authStorage: runtime.authStorage,
    modelRegistry: runtime.modelRegistry,
    model: runtime.model,
    sessionManager,
  })
  sessions.set(key, session)
  return session
}

function encodeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)
}
