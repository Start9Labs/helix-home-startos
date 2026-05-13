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
  /** Final-content fallback for providers that don't stream text_delta. */
  const textEnds: string[] = []
  /** Error events pi emits when the model call itself fails. */
  let modelError: string | undefined
  /** Recent event types — dumped if the turn finishes with no output. */
  const eventTrace: string[] = []
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
    eventTrace.push(
      event.type === 'message_update'
        ? `message_update:${event.assistantMessageEvent.type}`
        : event.type,
    )
    if (eventTrace.length > 60) eventTrace.shift()

    switch (event.type) {
      case 'message_end': {
        // For non-streaming providers (and for any turn where the stream
        // produced no chunks before terminating) pi only emits
        // message_start/message_end — the full assistant payload is
        // attached to event.message. Walk content blocks for text, and
        // surface `errorMessage` if the upstream call failed (pi pushes
        // an `error` event into the stream → agent-loop translates it
        // into a message_end carrying { stopReason: "error", errorMessage }
        // with no message_update beforehand, which is exactly the empty
        // trace shape).
        arm()
        const msg = (event as {
          message?: {
            role?: string
            content?: unknown[]
            stopReason?: string
            errorMessage?: string
          }
        }).message
        if (msg?.role === 'assistant') {
          if (Array.isArray(msg.content)) {
            for (const block of msg.content as Array<{
              type?: string
              text?: unknown
              thinking?: unknown
            }>) {
              if (block?.type === 'text' && typeof block.text === 'string') {
                textEnds.push(block.text)
              } else if (
                block?.type === 'thinking' &&
                typeof block.thinking === 'string' &&
                textEnds.length === 0
              ) {
                // Some reasoning models only emit thinking blocks for very
                // small prompts; use that as a last-resort visible body so
                // the user isn't staring at "no response."
                textEnds.push(`_(thinking)_ ${block.thinking}`)
              }
            }
          }
          if (msg.stopReason === 'error' && msg.errorMessage) {
            modelError = msg.errorMessage
          }
        }
        return
      }
      case 'message_update': {
        arm()
        const sub = event.assistantMessageEvent
        if (sub.type === 'text_delta') {
          text.push(sub.delta)
          opts.onText?.(sub.delta)
        } else if (sub.type === 'text_end') {
          // Non-streaming providers (some OpenAI-compatible endpoints
          // including some vLLM configs) only emit text_end with the
          // full content. Capture it as a fallback.
          if (typeof sub.content === 'string' && sub.content.length > 0) {
            textEnds.push(sub.content)
          }
        } else if (sub.type === 'error') {
          const err = (sub as { error?: unknown }).error
          modelError =
            (err && typeof err === 'object' && 'errorMessage' in err
              ? String((err as { errorMessage?: unknown }).errorMessage)
              : undefined) ??
            (typeof err === 'string' ? err : undefined) ??
            `pi error event (reason=${(sub as { reason?: unknown }).reason})`
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

  // Prefer streamed deltas; fall back to text_end content if the provider
  // didn't stream. Surface model-side errors over the generic "no
  // response" fallback in handler.ts.
  let resultText = text.join('')
  if (!resultText && textEnds.length > 0) resultText = textEnds.join('')
  if (!error && modelError) error = modelError

  if (!resultText && toolCount === 0 && !error) {
    console.warn(
      `helix-home: empty turn for ${opts.key} — pi event trace: ${eventTrace.join(', ')}`,
    )
  }

  return { text: resultText, error, toolCount }
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
