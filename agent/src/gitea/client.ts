import { env } from '../config.js'

type GiteaUser = {
  login: string
  full_name?: string
  email?: string
}

const headers = () => ({
  Authorization: `token ${env.GITEA_TOKEN}`,
  'Content-Type': 'application/json',
})

export async function whoami(): Promise<GiteaUser | null> {
  if (!env.GITEA_HOST || !env.GITEA_TOKEN) return null
  const res = await fetch(`${env.GITEA_HOST}/api/v1/user`, {
    headers: headers(),
  })
  if (!res.ok) return null
  return (await res.json()) as GiteaUser
}

/**
 * URL the agent's bash tool should use to clone/push (token-embedded).
 */
export function authedRepoUrl(owner: string, repo: string): string {
  const base = env.GITEA_HOST.replace(/\/+$/, '')
  const u = new URL(`${base}/${owner}/${repo}.git`)
  if (env.GITEA_TOKEN) {
    u.username = 'oauth2'
    u.password = env.GITEA_TOKEN
  }
  return u.toString()
}
