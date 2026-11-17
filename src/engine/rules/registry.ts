import type { Rule } from '../types'
import { rule as REQ_TOO_MANY_FEATURES } from './REQ_TOO_MANY_FEATURES'
import { rule as REQ_NO_OUT_OF_SCOPE } from './REQ_NO_OUT_OF_SCOPE'
import { rule as REQ_VAGUE_NFR } from './REQ_VAGUE_NFR'
import { rule as REQ_CAP_UNSCOPED } from './REQ_CAP_UNSCOPED'
import { rule as ENT_PREMATURE_DETAIL } from './ENT_PREMATURE_DETAIL'
import { rule as API_NO_COVERAGE } from './API_NO_COVERAGE'
import { rule as API_USER_ID_IN_BODY } from './API_USER_ID_IN_BODY'
import { rule as API_SINGLE_STEP_BOOKING } from './API_SINGLE_STEP_BOOKING'
import { rule as HLD_CLIENT_TO_DB } from './HLD_CLIENT_TO_DB'
import { rule as HLD_NO_ENTRY_POINT } from './HLD_NO_ENTRY_POINT'
import { rule as HLD_UNFINISHED_PATH } from './HLD_UNFINISHED_PATH'
import { rule as HLD_PREMATURE_OPTIMISATION } from './HLD_PREMATURE_OPTIMISATION'
import { rule as DD_RESERVATION_NO_EXPIRY } from './DD_RESERVATION_NO_EXPIRY'
import { rule as DD_CRON_STALE_WINDOW } from './DD_CRON_STALE_WINDOW'
import { rule as DD_SEARCH_FULL_SCAN } from './DD_SEARCH_FULL_SCAN'
import { rule as DD_SEARCH_PRIMARY_STORE } from './DD_SEARCH_PRIMARY_STORE'
import { rule as DD_SURGE_NO_CHOKEPOINT } from './DD_SURGE_NO_CHOKEPOINT'
import { rule as DD_LOCK_STORE_OUTAGE } from './DD_LOCK_STORE_OUTAGE'

/** Stage order, then the order they are listed in docs/05. */
export const RULES: readonly Rule[] = [
  REQ_TOO_MANY_FEATURES, REQ_NO_OUT_OF_SCOPE, REQ_VAGUE_NFR, REQ_CAP_UNSCOPED,
  ENT_PREMATURE_DETAIL,
  API_NO_COVERAGE, API_USER_ID_IN_BODY, API_SINGLE_STEP_BOOKING,
  HLD_CLIENT_TO_DB, HLD_NO_ENTRY_POINT, HLD_UNFINISHED_PATH, HLD_PREMATURE_OPTIMISATION,
  DD_RESERVATION_NO_EXPIRY, DD_CRON_STALE_WINDOW, DD_SEARCH_FULL_SCAN, DD_SEARCH_PRIMARY_STORE, DD_SURGE_NO_CHOKEPOINT, DD_LOCK_STORE_OUTAGE,
]

export const ruleById = (id: string): Rule | undefined => RULES.find((r) => r.id === id)
