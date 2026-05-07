import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
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

export async function startMatrixBot(): Promise<void> {
  if (!hasMatrixCreds) {
    console.log(
      'helix-home: MATRIX_* env not set, skipping Matrix bot. Run the "Configure agent" action.',
    )
    return
  }

  const stateDir = join(env.HELIX_DATA_DIR, 'matrix')
  mkdirSync(stateDir, { recursive: true })

  const storage = new SimpleFsStorageProvider(join(stateDir, 'sync.json'))
  const cryptoDir = join(stateDir, 'crypto')
  mkdirSync(cryptoDir, { recursive: true })
  const cryptoStore = new RustSdkCryptoStorageProvider(
    cryptoDir,
    RustSdkCryptoStoreType.Sqlite,
  )

  const c = new MatrixClient(
    env.MATRIX_HOMESERVER,
    env.MATRIX_ACCESS_TOKEN,
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
