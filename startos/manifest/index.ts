import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'helix-home',
  title: 'Helix Home',
  license: 'GPL',
  packageRepo: 'https://github.com/Start9Labs/helix-home-startos',
  upstreamRepo: 'https://github.com/Start9Labs/helix-home-startos',
  marketingUrl: 'https://start9.com/',
  donationUrl: 'https://donate.start9.com/',
  docsUrls: [
    'https://github.com/Start9Labs/helix-home-startos/blob/master/README.md',
  ],
  description: { short, long },
  // Required: helix-home builds StartOS packages from inside its own container,
  // which needs a rootless OCI engine (podman + fuse-overlayfs) for image
  // builds during `start-cli s9pk pack`. Depends on Start9Labs/start-os#3209
  // — until that lands and exposes nestedRuntime in the SDK manifest type,
  // this cast keeps the field present in the emitted manifest.
  ...({ nestedRuntime: true } as unknown as Record<string, never>),
  volumes: ['main'],
  images: {
    'helix-home': {
      source: { dockerBuild: {} },
      arch: ['x86_64', 'aarch64'],
    },
  },
  alerts: {
    install: {
      en_US:
        'Helix Home runs an AI developer agent that builds and installs StartOS packages on this server when you tell it to. After install, run the "Sign in to StartOS" action so the agent can talk to start-cli on your behalf, then configure your Matrix, Gitea, and vLLM credentials.',
    },
    update: null,
    uninstall: null,
    restore: null,
    start: null,
    stop: null,
  },
  dependencies: {
    matrix: {
      description: null,
      optional: false,
      metadata: {
        title: 'Matrix',
        icon: 'icon.svg',
      },
    },
    gitea: {
      description: null,
      optional: false,
      metadata: {
        title: 'Gitea',
        icon: 'icon.svg',
      },
    },
    vllm: {
      description: null,
      optional: false,
      metadata: {
        title: 'vLLM',
        icon: 'icon.svg',
      },
    },
  },
})
