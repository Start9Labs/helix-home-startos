import { sdk } from '../sdk'
import { configure } from './configure'
import { startCliLogin } from './startCliLogin'

export const actions = sdk.Actions.of()
  .addAction(configure)
  .addAction(startCliLogin)
