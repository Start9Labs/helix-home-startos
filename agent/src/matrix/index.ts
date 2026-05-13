import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MatrixAuth,
  MatrixClient,
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
} from 'matrix-bot-sdk'
// matrix-bot-sdk's d.ts re-exports `RustSdkCryptoStoreType` but its runtime
// .js doesn't, so import the enum from the native crypto package.
import { StoreType as RustSdkCryptoStoreType } from '@matrix-org/matrix-sdk-crypto-nodejs'
import { env, hasMatrixCreds } from '../config.js'
import { registerHandlers } from './handler.js'

let client: MatrixClient | null = null

export function getMatrixClient(): MatrixClient | null {
  return client
}

/**
 * Matrix bots are just regular user accounts — Configure gives us the
 * bot's username + password, and we exchange them for an access token
 * via `POST /_matrix/client/r0/login` the first time we boot. The
 * token is cached on the persistent volume so subsequent boots don't
 * re-login (and don't churn devices).
 */
async function resolveAccessToken(stateDir: string): Promise<string> {
  const tokenPath = join(stateDir, 'access-token')
  if (existsSync(tokenPath)) {
    const cached = readFileSync(tokenPath, 'utf8').trim()
    if (cached) return cached
  }
  console.log(
    `helix-home: no cached access token — logging in as ${env.MATRIX_USER_ID} via password`,
  )
  const auth = new MatrixAuth(env.MATRIX_HOMESERVER)
  const loggedIn = await auth.passwordLogin(
    env.MATRIX_USER_ID,
    env.MATRIX_PASSWORD,
    'helix-home',
  )
  const token = loggedIn.accessToken
  if (!token) throw new Error('matrix passwordLogin returned no access token')
  writeFileSync(tokenPath, token + '\n', { mode: 0o600 })
  console.log('helix-home: matrix access token cached')
  return token
}

export async function startMatrixBot(): Promise<void> {
  if (!hasMatrixCreds) {
    console.log(
      'helix-home: MATRIX_* env not set, skipping Matrix bot. Run the "Configure agent" action.',
    )
    return
  }

  const stateDir = join(env.HELIX_DATA_DIR, 'matrix')
  mkdirSync(stateDir, { recursive: true })

  const accessToken = await resolveAccessToken(stateDir)

  const storage = new SimpleFsStorageProvider(join(stateDir, 'sync.json'))
  const cryptoDir = join(stateDir, 'crypto')
  mkdirSync(cryptoDir, { recursive: true })
  const cryptoStore = new RustSdkCryptoStorageProvider(
    cryptoDir,
    RustSdkCryptoStoreType.Sqlite,
  )

  const c = new MatrixClient(
    env.MATRIX_HOMESERVER,
    accessToken,
    storage,
    cryptoStore,
  )
  c.syncingTimeout = 30_000

  const botUserId = await c.getUserId()
  console.log(`helix-home: logged in as ${botUserId}`)

  registerHandlers(c, botUserId)

  const joined = await c.getJoinedRooms()
  await c.crypto.prepare(joined)
  console.log(
    `helix-home: E2EE ready (device ${c.crypto.clientDeviceId})`,
  )

  await c.start()
  console.log('helix-home: matrix sync started')
  client = c
}
