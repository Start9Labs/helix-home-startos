## ---- agent build stage ----------------------------------------------------
FROM node:22-bookworm-slim AS agent-builder

WORKDIR /agent
COPY agent/package.json agent/tsconfig.json agent/tsup.config.ts ./
RUN npm install --no-audit --no-fund
COPY agent/src ./src
RUN npx tsc --noEmit && npx tsup

## ---- runtime --------------------------------------------------------------
FROM node:22-bookworm-slim

# Build/runtime tooling helix-home invokes against the host:
#   - start-cli: pack + install s9pks
#   - podman + fuse-overlayfs: rootless OCI engine for `start-cli s9pk pack`
#     image builds (depends on Start9Labs/start-os#3209 which exposes /dev/fuse)
#   - git, make, jq, awk, curl: package build tools
#   - python3 + squashfs-tools: mksquashfs and helpers used by start-cli
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git make jq gawk \
      python3 squashfs-tools \
      podman fuse-overlayfs uidmap slirp4netns \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

# start-cli (Start9 official installer)
RUN curl -fsSL https://start9.com/start-cli/install.sh | sh \
    && mv /root/.local/bin/start-cli /usr/local/bin/start-cli \
    && start-cli --version

# Configure rootless podman + fuse-overlayfs. Both `runroot` and `graphroot`
# must be present at the top of [storage] or podman aborts with
# "runroot must be set" — even with --runroot/--root flags. Discovered
# while testing against start-os#3209 (nestedRuntime). The mkdirs need
# to exist before any podman invocation; we put them on /tmp/containers
# so the data is writable even when /var is mounted ro elsewhere.
RUN mkdir -p /etc/containers /run/containers/storage /var/lib/containers/storage \
    && cat > /etc/containers/storage.conf <<'EOF'
[storage]
driver = "overlay"
runroot = "/run/containers/storage"
graphroot = "/var/lib/containers/storage"

[storage.options.overlay]
mount_program = "/usr/bin/fuse-overlayfs"
mountopt = "nodev,metacopy=on"
EOF

WORKDIR /app

# Install only production deps for the agent.
COPY agent/package.json ./agent-package.json
RUN cp agent-package.json package.json \
    && npm install --omit=dev --no-audit --no-fund \
    && rm agent-package.json

# Bundle the built agent.
COPY --from=agent-builder /agent/build ./build

# helix-repo wrapper — pooled CoW repo slots for per-thread workspaces.
COPY agent/bin/helix-repo /usr/local/bin/helix-repo
RUN chmod +x /usr/local/bin/helix-repo

# Service writes everything (start-cli creds, sqlite, repos) under /data
# (mounted by StartOS from the 'main' volume). HOME is set there too so
# start-cli's ~/.startos/config.yaml lives on the persistent volume.
ENV NODE_ENV=production HOME=/data/home

CMD ["node", "/app/build/index.js"]
