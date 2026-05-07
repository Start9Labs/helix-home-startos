<p align="center">
  <img src="icon.svg" alt="Helix Home" width="21%">
</p>

# Helix Home on StartOS

> A self-hosted AI developer agent — talk to it in Matrix, it writes code,
> commits to your local Gitea, runs an LLM via vLLM, and (only when you
> explicitly tell it to) builds and installs StartOS packages on this
> server.

Inspired by the Helix agent that runs the Start9 Labs engineering pipeline,
this is a much smaller, single-user, single-server cousin of it. No
Anthropic billing, no GitHub — just your own LLM, your own Gitea, and your
own StartOS box.

## What it does

- Listens in Matrix rooms (E2EE, scoped by an allow-list)
- Dispatches each thread to a [`pi-coding-agent`](https://github.com/mariozechner/pi)
  session backed by your local vLLM
- Has a real bash tool, so it clones Gitea repos, edits, commits, pushes,
  runs tests, etc., per thread
- On `!build` / `!install`, runs `make` and `start-cli package install`
  inside its own container — the **only** way the agent ever touches the
  host StartOS

## Install + first-run flow

1. Install Helix Home from your registry (or sideload). Make sure you have
   **Matrix**, **Gitea**, and **vLLM** installed and running first.
2. Run the **Sign in to StartOS** action, supply this server's hostname and
   master password. The agent stores its `start-cli` session in `/data/home`
   on the persistent volume.
3. Run the **Configure agent** action with:
   - Matrix homeserver URL (prefilled from the synapse dependency)
   - Bot user ID, bot access token
   - (optional) comma-separated allow-list of room IDs / user IDs
   - Gitea host URL + an API token for the bot user
   - vLLM model name (required — e.g. `Qwen/Qwen2.5-Coder-32B-Instruct`).
     The **api key and endpoint are auto-discovered** from the vllm
     dependency's `public/credentials.json` and the vllm interface URL.
     The endpoint field is an optional override.
4. Restart the service. The bot connects to Matrix and starts replying.

## Volumes & data layout

| Volume | Mount    | Purpose                                                      |
| ------ | -------- | ------------------------------------------------------------ |
| `main` | `/data`  | Pi sessions, per-thread workspaces, start-cli creds, config  |

```
/data/
├── home/.startos/config.yaml   # start-cli session (from Sign-in action)
├── config.json                 # set by the Configure action
├── matrix/                     # E2EE crypto + sync state
├── sessions/<thread>/          # pi JSONL session files
└── workspaces/<thread>/        # repo clones the agent works in
```

## Bot commands

| Command                  | Effect                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- |
| anything (no leading `!`) | Dispatched to pi as a prompt for the current thread                          |
| `!build`                 | Run `make` in the thread's workspace                                          |
| `!install`               | `!build` then `start-cli package install` (needs Sign-in)                    |
| `!interrupt <message>`   | Abort the in-flight turn and steer the agent with `<message>`               |
| `!done`                  | Release this thread's `helix-repo` slots                                     |
| `!stop`                  | Shut the daemon down — restart from the StartOS UI to bring it back          |
| `!help`                  | List commands                                                                |

## Repo slots

The agent's bash tool has a `helix-repo` wrapper available. It maintains
a clean **baseline** clone per repo and hands each thread a copy-on-write
**slot** snapshotted from baseline:

```sh
cd "$(helix-repo Start9Labs/helix-home-startos)"   # acquires a slot
cd "$(helix-repo http://gitea.startos:3000/me/foo.git my-branch)"
helix-repo list                                     # who owns what
```

Slot creation is `cp -a --reflink=auto baseline slot-N` — copy-on-write on
btrfs/xfs/zfs (instant + storage shared with baseline until divergence), a
plain copy elsewhere. Build artefacts (`node_modules/`, `target/`) live
inside the slot and survive across turns, but baseline is never modified.

Slots are per-repo capped (`HELIX_MAX_SLOTS_PER_REPO`, default 8). `!done`
releases every slot owned by the calling thread; `!stop` releases this
thread's slots before exiting.

## Dependencies

| Package  | Why                                                                       |
| -------- | ------------------------------------------------------------------------- |
| synapse  | Matrix homeserver; the bot's home. Configure-action prefills the homeserver URL from synapse's interface. |
| gitea    | Where the agent commits/pushes its work                                    |
| vllm     | OpenAI-compatible LLM endpoint pi targets. Vllm's `public` volume is mounted read-only at `/run/vllm/`; api key comes from `credentials.json`. |

## Known limitations

- **`nestedRuntime` requires [start-os#3209](https://github.com/Start9Labs/start-os/pull/3209).**
  Without the runtime change, the container has no `/dev/fuse`, so
  `start-cli s9pk pack` (image build inside the container) won't be able to
  use a rootless OCI engine. The manifest already declares the opt-in; it'll
  start having an effect once that PR lands.
- Pi only — there is no Claude SDK / Anthropic path here on purpose.
- One-user assumption; allow-list is a soft fence, not a hard auth boundary.
- Builds verified locally for x86_64. aarch64 builds work in CI (or any host
  with `qemu-user-static` binfmt set up).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md).
