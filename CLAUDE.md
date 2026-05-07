# Helix Home — packaging notes

This is the StartOS package wrapper for Helix Home, an in-server AI developer
agent. It is **not** a fork of `Start9Labs/helix`; it's a separate codebase
that vendors a slimmed-down, pi-only agent in `agent/`.

## Repo layout

- `startos/` — package definition (manifest, actions, file model, version
  graph, daemon wiring). Identical shape to other Start9 packages.
- `agent/` — the Node/TypeScript service that runs inside the container.
  Connects to Matrix, dispatches each thread to a `pi-coding-agent` session,
  proxies LLM calls through vLLM (OpenAI-compatible).
- `Dockerfile` — multi-stage: builds `agent/` with `tsup`, then a runtime
  image with node + start-cli + podman/fuse-overlayfs for in-container s9pk
  builds.

## Build

```bash
make             # builds x86 + arm by default; emits .s9pk per arch
make x86         # x86_64 only
```

`make` runs `npm run check && npm run build` (the package side) then
`start-cli s9pk pack`. The Dockerfile's first stage type-checks and bundles
`agent/`.

If you only changed `agent/` source, you still have to `make` from the
repo root — the Dockerfile builds the agent.

## Commands

The bot listens for these in any Matrix message it can see (subject to
`MATRIX_ALLOW_LIST`):

- `!build` — `make` in the thread's workspace
- `!install` — `!build` then `start-cli package install` (requires Sign-in
  action first)
- `!interrupt <message>` — abort the current pi turn, steer with `<message>`
- `!done` — release this thread's `helix-repo` slots
- `!stop` — exit the daemon (StartOS keeps it stopped until restarted; also
  releases this thread's slots first)
- `!help` — list these
- anything else — dispatched to pi as a fresh prompt for that thread

Per-thread workspaces live under `/data/workspaces/<thread-root-id>/`. Pi
sessions persist under `/data/sessions/<thread-root-id>/`. The handler
writes `<workspace>/.helix/thread-id` so the `helix-repo` wrapper picks
the right owner for slot acquisitions.

## Repo slots (helix-repo)

`agent/bin/helix-repo` is copied to `/usr/local/bin/helix-repo` in the
runtime image. It gives pi a pooled, copy-on-write working tree per repo:

```
/data/repos/<key>/baseline/       single clean clone (refreshed on acquire)
/data/repos/<key>/slots/slot-N/   per-thread snapshot of baseline
        slot-N/.helix/owner       thread id
```

Slot creation is `cp -a --reflink=auto baseline slot-N` — copy-on-write on
btrfs/xfs/zfs (instant, storage shared with baseline until divergence), a
plain copy elsewhere. No FS-specific paths in the wrapper.

Thread attribution: `helix-repo` reads `$HELIX_THREAD_ID` first, then walks
up from `$PWD` for `.helix/thread-id`. The matrix handler writes that file
in the workspace before each dispatch, so any pi turn calling `helix-repo`
from inside the workspace gets correct ownership for free.

`HELIX_MAX_SLOTS_PER_REPO` (default 8) caps slots per repo. `!done` and
`!stop` both call `helix-repo release-thread <id>`.

## Init-time tasks

`startos/init/initializeService.ts` runs on first install only and surfaces
two tasks via `sdk.action.createOwnTask`:

- **configure** — `critical` severity. StartOS blocks the service from
  starting until the user runs it. Without Matrix/Gitea/vLLM creds the
  agent has nothing useful to do.
- **start-cli-login** — `important`. Only needed for the `!install`
  bot command (which sideloads built packages onto this server); not
  blocking.

Tasks dedup by replayId (`<package-id>:<action-id>` by default), so it's
safe to call `createOwnTask` again later — it'll be a no-op until the
user runs the action.

## Synapse homeserver auto-fill

The Matrix dependency is the `synapse` package (id `synapse`, not `matrix`).
The Configure action's prefill calls `sdk.serviceInterface.get(effects,
{ id: 'homeserver', packageId: 'synapse' }).once()` and uses the first
`nonLocal` URL it returns as the default for `matrixHomeserver`. If synapse
hasn't published an address yet (just installed, not started), the fallback
is the inter-service hostname `http://synapse.startos`.

## vLLM auto-discovery

vllm-startos exposes a dedicated `public` volume containing
`credentials.json` (`{ apiKey: string }`) for dependent services. We mount
that volume read-only at `/run/vllm/` (declared in `startos/main.ts` via
`mountDependency` with `volumeId: 'public'`). On agent boot, `config.ts`
parses `/run/vllm/credentials.json` and pulls `apiKey`, which is then
exposed as `OPENAI_API_KEY` before `AuthStorage.create()` so pi picks it
up.

The endpoint defaults to `http://vllm.startos:8000/v1` (vllm's `api`
interface). The Configure action's `vllmEndpoint` field is an optional
override; `vllmModel` is required (vllm's public volume doesn't currently
expose the running model id).

## start-cli auth

The `Sign in to StartOS` action runs `start-cli auth login` inside a temp
subcontainer with the main volume mounted. We pin `HOME=/data/home` so
start-cli's `~/.startos/config.yaml` lives on the persistent volume; the
long-running daemon sets the same `HOME` (via `ENV` in the Dockerfile)
so it inherits the credential.

## nestedRuntime

The manifest sets `nestedRuntime: true` (via a cast — the field isn't in
the SDK type yet). It depends on `Start9Labs/start-os#3209`, which adds
`/dev/fuse` + the cgroup permission needed for rootless podman inside the
service container. Until that PR ships in start-cli, the field is silently
dropped during pack — but it's already in the bundled `javascript/index.js`
manifest, so once #3209 lands, no rebuild is needed.

## Things to be careful with

- Pi only — no Anthropic Claude SDK path. Don't add one back without
  discussion.
- GitHub tooling (`gh`, PR polling) intentionally absent. Use Gitea via
  `src/gitea/client.ts` and the `git` CLI from inside pi tool calls.
- Don't put secrets in env vars persisted to the manifest. The configure
  action stores them in `/data/config.json` via the file model; `main.ts`
  reads them and forwards via the daemon's `exec.env`.
- `s9pk.mk` is plumbing — DO NOT EDIT.

## Reference

The full Helix codebase lives at `~/helix` (or `$HELIX_PROJECT_ROOT`) when
you're running as the helix-nine agent. It's more elaborate (claude-sdk
driver, GitHub PR polling, libvirt VM pool, repo-pool / btrfs slots) — but
helix-home stays slim on purpose. When in doubt, mirror helix's pi-only
era (see `git log --oneline --all -- src/coder/claude-code.ts` to find
the last commit before claude-sdk was introduced; the architecture there
is what helix-home is patterned on).
