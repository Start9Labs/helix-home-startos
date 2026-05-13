# Helix Home

A self-hosted AI developer agent that lives in Matrix. Talk to it; it writes code, commits to your local Gitea, runs an LLM via vLLM, and — only when you explicitly invoke `!build` / `!install` — builds and installs StartOS packages on this server.

## First-run flow

The daemon comes up idle on first boot — no hard dependencies until you opt into them via Configure. StartOS surfaces two tasks; do them in order.

### 1. Configure agent (critical — blocks startup)

For each of **Matrix**, **Gitea**, and **vLLM** you pick:

- **Internal** — use the same-StartOS dep. Picking this turns that package into a hard dependency and StartOS will auto-install/start it. The URL (and, for vLLM, the api key) is read from the dep at runtime.
- **External** (the default) — supply your own URL, and for vLLM the api key. Use this if you want to point at, say, a beefier vLLM box outside this StartOS server.

Then fill in:

- **Matrix bot user ID** (`@bot:server.tld`) and **bot password** — Helix Home logs in via password once and caches the access token on the persistent volume. Create the user on your homeserver first.
- (optional) Comma-separated **allow-list** of Matrix room IDs / user IDs. Invites and messages from outside the list are ignored.
- **Gitea API token** for the bot user.
- **vLLM model name**, e.g. `Qwen/Qwen2.5-Coder-32B-Instruct`. The endpoint can omit `/v1` — it's appended automatically.

### 2. Sign in to StartOS (important — needed only for `!install`)

Supply this server's hostname and master password. Helix Home runs `start-cli auth login` inside its container and caches the session under `/data/home` so the agent can call `start-cli package install` against this host on your behalf.

You can skip this if you only ever use `!build` (which produces a `.s9pk` but doesn't sideload).

### 3. Restart the service

After Configure (and optionally Sign-in), restart Helix Home from the StartOS UI. The bot connects to Matrix and starts replying.

## Talking to the bot

Invite the bot to a room or DM it. Anything you send (without a leading `!`) is dispatched to the LLM as a fresh prompt for that thread. The bot replies in-thread.

| Command                | Effect                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| _any message_          | Dispatched to the agent for this Matrix thread                            |
| `!build`               | Run `make` in the thread's workspace                                       |
| `!install`             | `!build` then `start-cli package install` (needs Sign-in)                 |
| `!interrupt <message>` | Abort the in-flight turn and steer the agent with `<message>`             |
| `!stop`                | Abort the in-flight turn (no follow-up dispatch)                          |
| `!done`                | Release this thread's `helix-repo` slots (frees the working tree)         |
| `!help`                | List commands                                                              |

## What lives where

| Path                                   | Purpose                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `/data/config.json`                    | Configure action writes here; daemon reads on boot         |
| `/data/matrix/`                        | E2EE crypto + sync state + cached access token            |
| `/data/home/.startos/config.yaml`      | Cached `start-cli` session from the Sign-in action         |
| `/data/sessions/<thread>/`             | Pi JSONL session files per Matrix thread                  |
| `/data/workspaces/<thread>/`           | Per-thread working directory                              |
| `/data/repos/<repo>/baseline/`         | Clean clone, never modified                               |
| `/data/repos/<repo>/slots/slot-N/`     | Copy-on-write snapshot, owned by a thread                 |

## Known limitations

- **`!build` and `!install` need [start-os#3209](https://github.com/Start9Labs/start-os/pull/3209)** to be live on this server — that PR adds `/dev/fuse` to the package's container so rootless podman (used during `start-cli s9pk pack`) can run. The package boots and chats fine without it; only the build/install commands fail.
- Single-user assumption — the allow-list is a soft fence, not a hard auth boundary.
- Self-signed certs are trusted by default (Helix Home is intended for self-hosted endpoints). Set `HELIX_STRICT_TLS=true` to opt back into strict verification.

## Where to read more

- [README on GitHub](https://github.com/Start9Labs/helix-home-startos/blob/master/README.md) — design overview and contribution guide
- [pi-coding-agent](https://github.com/mariozechner/pi) — the underlying agent driving each thread
