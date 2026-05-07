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
  content?: {
    body?: string
    msgtype?: string
    'm.relates_to'?: {
      rel_type?: string
      event_id?: string
    }
  }
}

export function registerHandlers(client: MatrixClient, botUserId: string) {
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

  const body = ev.content.body.trim()
  const threadRoot =
    ev.content['m.relates_to']?.rel_type === THREAD_REL
      ? ev.content['m.relates_to'].event_id || ev.event_id
      : ev.event_id

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

  // !stop: graceful exit. StartOS keeps the service stopped until the
  // user starts it again. Free this thread's slots first so they aren't
  // pinned across the restart.
  if (body === '!stop' || body === '!stop-force') {
    await releaseThreadSlots(threadRoot)
    await reply(client, roomId, ev, threadRoot, 'Shutting down — restart the service from the StartOS UI to bring me back.')
    setTimeout(() => process.exit(0), 250)
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
    const result = await dispatch({ key: threadRoot, prompt: followUp, cwd })
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
        '- `!done` — release this thread\'s `helix-repo` slots',
        '- `!stop` — shut the service down (restart from the StartOS UI to bring me back)',
        '- anything else — dispatched to the coding agent',
        '',
        'Inside a thread, the agent has the `helix-repo` wrapper available — it acquires a CoW slot for any Gitea repo (`helix-repo owner/repo` or full URL).',
      ].join('\n'),
    )
    return
  }

  // Dispatch to pi.
  const result = await dispatch({
    key: threadRoot,
    prompt: body,
    cwd,
  })
  const text =
    result.error ?? (result.text || `_(no response — ${result.toolCount} tool calls)_`)
  await reply(client, roomId, ev, threadRoot, text)
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
