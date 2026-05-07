export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Helix Home...': 0,
  'Helix Home agent': 1,
  'The Helix Home agent is running': 2,
  'The Helix Home agent is not running': 3,

  // actions
  'Sign in to StartOS': 4,
  'Sign the agent into start-cli on this server so it can build and install packages on your behalf.':
    5,
  'Server hostname': 6,
  'Hostname or IP of this StartOS server (e.g. server-name.local).': 7,
  'Server password': 8,
  'StartOS master password.': 9,
  'Sign-in successful': 10,
  'Configure agent': 11,
  'Set the Matrix bot credentials, Gitea API token, and vLLM model to use.':
    12,
  'Matrix homeserver URL': 13,
  'Matrix bot user ID': 14,
  'Matrix bot access token': 15,
  'Allowed Matrix room or user IDs (comma-separated)': 16,
  'Gitea host URL': 17,
  'Gitea API token': 18,
  'vLLM endpoint URL': 19,
  'vLLM model name': 20,
  'Configuration saved': 21,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
