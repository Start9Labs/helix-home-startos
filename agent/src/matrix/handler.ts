import { join } from 'node:path'
import { MatrixClient } from 'matrix-bot-sdk'
import { marked } from 'marked'
import { allowList, env } from '../config.js'
import { abortThread, dispatch } from '../agent/session.js'
import { buildPackage, installPackage } from '../build/install.js'
import { ensureWorkspace, releaseThreadSlots } from '../utils/slots.js'

const THREAD_REL = 'm.thread'

type Event = {
  event_id: string
  sender: string
  type: string
  state_key?: string
  content?: {
    body?: string
    msgtype?: string
    membership?: string
    'm.relates_to'?: {
      rel_type?: string
      event_id?: string
    }
  }
}

export function registerHandlers(client: MatrixClient, botUserId: string) {
  // Auto-join invites — without this, DMs from allowed users sit
  // unaccepted forever. Gated by the same allow-list that filters
  // room messages.
  client.on('room.invite', async (roomId: string, ev: Event) => {
    if (ev.state_key !== botUserId) return
    if (ev.content?.membership !== 'invite') return
    const sender = ev.sender || ''
    if (allowList.size > 0 && !allowList.has(sender)) {
      console.log(
        `helix-home: ignoring invite to ${roomId} from ${sender} (not allow-listed)`,
      )
      return
    }
    try {
      await client.joinRoom(roomId)
      console.log(`helix-home: joined ${roomId} (invited by ${sender})`)
    } catch (err) {
      console.error(`helix-home: failed to join ${roomId}:`, err)
    }
  })

  client.on('room.message', async (roomId: string, ev: Event) => {
    try {
      await handle(client, botUserId, roomId, ev)
    } catch (err) {
      console.error('helix-home: handler error', err)
    }
  })
}

async function handle(
  client: MatrixClient,
  botUserId: string,
  roomId: string,
  ev: Event,
) {
  if (!ev.content?.body || ev.content.msgtype !== 'm.text') return
  if (ev.sender === botUserId) return

  // Allow list: room id OR sender id must match (or empty allow list = open).
  if (allowList.size > 0 && !allowList.has(roomId) && !allowList.has(ev.sender))
    return

  const isThreadReply =
    ev.content['m.relates_to']?.rel_type === THREAD_REL
  const body = ev.content.body.trim()
  const threadRoot = isThreadReply
    ? ev.content['m.relates_to']?.event_id || ev.event_id
    : ev.event_id

  // Read receipts. Per MSC3771 we send two per message — a thread
  // receipt and a main-timeline receipt — so both kinds of client
  // clear unread. But a main receipt has to target an event that's
  // actually IN the main timeline; for an in-thread message the
  // event_id is in the thread (not main) and Synapse rejects with
  // M_INVALID_PARAM ("not related to thread main"). The thread root
  // IS in main, so we redirect the main ack to it.
  //   - in-thread message  → thread receipt on event_id (thread=root)
  //                          + main receipt on the thread ROOT
  //   - top-level message  → main receipt on event_id
  //                          + thread receipt on event_id (thread=self,
  //                            since we always reply in-thread, this
  //                            event IS the future thread root)
  const mainAckTarget = isThreadReply ? threadRoot : ev.event_id
  postReadReceipt(client, roomId, mainAckTarget, 'main').catch((err) =>
    console.error('helix-home: main receipt failed:', err),
  )
  const threadAckId = isThreadReply ? threadRoot : ev.event_id
  postReadReceipt(client, roomId, ev.event_id, threadAckId).catch((err) =>
    console.error('helix-home: thread receipt failed:', err),
  )

  const cwd = join(env.HELIX_DATA_DIR, 'workspaces', encode(threadRoot))
  await ensureWorkspace(cwd, threadRoot)

  // !done: release every helix-repo slot owned by this thread. Use when
  // the work in this thread is finished so other threads can claim the
  // freed slots — slots are capped per-repo, so leaving them held will
  // eventually deny new acquires.
  if (body === '!done') {
    const note = await releaseThreadSlots(threadRoot)
    await reply(client, roomId, ev, threadRoot, `${note}`)
    return
  }

  // !stop: abort the in-flight pi turn for this thread. No follow-up
  // dispatch (use !interrupt <message> when you want to redirect the
  // agent). The daemon stays running so other threads keep working.
  if (body === '!stop') {
    await abortThread(threadRoot)
    await reply(client, roomId, ev, threadRoot, 'Stopped.')
    return
  }

  // !interrupt [<message>]: abort the in-flight pi turn for this thread,
  // then dispatch the trimmed message as a fresh turn. Pi's session
  // continues from where the aborted run left off, so prior context is
  // preserved. With no message, we just say "stop what you were doing."
  const interruptMatch = /^!interrupt\b\s*/i.exec(body)
  if (interruptMatch) {
    const trimmed = body.slice(interruptMatch[0].length).trim()
    const followUp = trimmed || 'Stop what you were doing.'
    await abortThread(threadRoot)
    const result = await runDispatch(client, roomId, ev, threadRoot, cwd, followUp)
    const text =
      result.error ?? (result.text || `_(no response — ${result.toolCount} tool calls)_`)
    await reply(client, roomId, ev, threadRoot, text)
    return
  }

  // Promote-to-build / install commands. These are the ONLY way the agent
  // ever runs `make` and `start-cli package install` against the host —
  // explicit user opt-in, not autonomous.
  if (body.startsWith('!build') || body.startsWith('!install')) {
    await reply(
      client,
      roomId,
      ev,
      threadRoot,
      `Running \`${body.split(/\s+/)[0]}\` in \`${cwd}\` ...`,
    )
    try {
      const s9pk = await buildPackage(cwd)
      let msg = `Built \`${s9pk}\``
      if (body.startsWith('!install')) {
        await installPackage(s9pk)
        msg += ` and installed to this server.`
      }
      await reply(client, roomId, ev, threadRoot, msg)
    } catch (err) {
      await reply(
        client,
        roomId,
        ev,
        threadRoot,
        `Build/install failed: ${String(err)}`,
      )
    }
    return
  }

  if (body.startsWith('!help')) {
    await reply(
      client,
      roomId,
      ev,
      threadRoot,
      [
        '**Helix Home commands**',
        '',
        '- `!build` — run `make` in this thread\'s workspace',
        '- `!install` — `!build` then `start-cli package install` (requires "Sign in to StartOS" action)',
        '- `!interrupt <message>` — abort the in-flight turn and steer with `<message>`',
        '- `!stop` — abort the in-flight turn (no follow-up)',
        '- `!done` — release this thread\'s `helix-repo` slots',
        '- anything else — dispatched to the coding agent',
        '',
        'Inside a thread, the agent has the `helix-repo` wrapper available — it acquires a CoW slot for any Gitea repo (`helix-repo owner/repo` or full URL).',
      ].join('\n'),
    )
    return
  }

  // Dispatch to pi (with typing indicators + 5-min activity heartbeat).
  const result = await runDispatch(client, roomId, ev, threadRoot, cwd, body)
  const text =
    result.error ?? (result.text || `_(no response — ${result.toolCount} tool calls)_`)
  await reply(client, roomId, ev, threadRoot, text)
}

// ------- progress visibility -----------------------------------------

type ToolCounts = {
  commands: number
  reads: number
  edits: number
  fetches: number
  other: number
}
function emptyCounts(): ToolCounts {
  return { commands: 0, reads: 0, edits: 0, fetches: 0, other: 0 }
}
function classifyTool(tool: string): keyof ToolCounts {
  const t = tool.toLowerCase()
  if (t === 'bash' || t === 'bashoutput' || t === 'killbash') return 'commands'
  if (t === 'read' || t === 'grep' || t === 'glob' || t === 'find' || t === 'ls') return 'reads'
  if (t === 'write' || t === 'edit' || t === 'notebookedit') return 'edits'
  if (t === 'webfetch' || t === 'websearch') return 'fetches'
  return 'other'
}
function formatCounts(c: ToolCounts): string {
  const parts: string[] = []
  if (c.commands) parts.push(`${c.commands} command${c.commands === 1 ? '' : 's'}`)
  if (c.reads) parts.push(`${c.reads} read${c.reads === 1 ? '' : 's'}`)
  if (c.edits) parts.push(`${c.edits} edit${c.edits === 1 ? '' : 's'}`)
  if (c.fetches) parts.push(`${c.fetches} fetch${c.fetches === 1 ? '' : 'es'}`)
  if (c.other) parts.push(`${c.other} other`)
  return parts.join(', ')
}
function sumCounts(c: ToolCounts): number {
  return c.commands + c.reads + c.edits + c.fetches + c.other
}

const HEARTBEAT_INTERVAL_MS = 5 * 60_000
const TYPING_TIMEOUT_MS = 30_000

/**
 * Wrap a pi dispatch with periodic "Working — N commands, M reads…"
 * heartbeats every 5 minutes (only if any tool ran since the last
 * flush) plus a renewing typing indicator. Mirrors helix's
 * verbosity='summary' pattern.
 */
async function runDispatch(
  client: MatrixClient,
  roomId: string,
  ev: Event,
  threadRoot: string,
  cwd: string,
  prompt: string,
) {
  let intervalCounts = emptyCounts()
  let totalCounts = emptyCounts()

  const flush = () => {
    if (sumCounts(intervalCounts) === 0) return
    const summary = formatCounts(intervalCounts)
    intervalCounts = emptyCounts()
    reply(client, roomId, ev, threadRoot, `_Working — ${summary}._`).catch(
      (err) => console.error('helix-home: heartbeat post failed:', err),
    )
  }
  const heartbeat = setInterval(flush, HEARTBEAT_INTERVAL_MS)
  // Renew typing every 25s — the homeserver expires it after the
  // timeout we pass otherwise.
  const sendTyping = () =>
    client.setTyping(roomId, true, TYPING_TIMEOUT_MS).catch(() => {})
  sendTyping()
  const typingTimer = setInterval(sendTyping, 25_000)

  try {
    const result = await dispatch({
      key: threadRoot,
      prompt,
      cwd,
      onTool: (state, tool) => {
        if (state !== 'end') return
        const bucket = classifyTool(tool)
        intervalCounts[bucket] += 1
        totalCounts[bucket] += 1
      },
    })
    return result
  } finally {
    clearInterval(heartbeat)
    clearInterval(typingTimer)
    client.setTyping(roomId, false).catch(() => {})
    // Trailing summary if anything happened that we didn't already
    // flush (rare on fast turns, common on long ones).
    if (sumCounts(intervalCounts) > 0) flush()
    if (sumCounts(totalCounts) > 0) {
      console.log(
        `helix-home: dispatch done for ${threadRoot} — ${formatCounts(totalCounts)}`,
      )
    }
  }
}

async function reply(
  client: MatrixClient,
  roomId: string,
  ev: Event,
  threadRoot: string,
  body: string,
) {
  const html = await marked.parse(body)
  await client.sendMessage(roomId, {
    msgtype: 'm.text',
    body,
    format: 'org.matrix.custom.html',
    formatted_body: html,
    'm.relates_to': {
      rel_type: THREAD_REL,
      event_id: threadRoot,
      'm.in_reply_to': { event_id: ev.event_id },
      is_falling_back: true,
    },
  })
}

function encode(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)
}

/**
 * POST a threaded `m.read` receipt. `threadId` is the thread root event
 * id for in-thread acks, or the literal string `"main"` for top-level
 * acks. The bot-sdk's `sendReadReceipt` only sends the main-timeline
 * variant and so leaves threads showing as unread on Element X / Web
 * with threads enabled — per MSC3771 we have to include the thread_id
 * in the body.
 */
async function postReadReceipt(
  client: MatrixClient,
  roomId: string,
  eventId: string,
  threadId: string,
): Promise<void> {
  await client.doRequest(
    'POST',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`,
    null,
    { thread_id: threadId },
  )
}
