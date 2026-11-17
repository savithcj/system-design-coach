import type { Role } from '../core/roles'
import type { State } from '../core/state'

export type Level = 'mid' | 'senior' | 'staff'
export const LEVEL_RANK: Readonly<Record<Level, number>> = { mid: 0, senior: 1, staff: 2 }
export type Lens = 'default' | 'startup_mvp' | 'global_scale'
export type Severity = 'info' | 'warn' | 'block'

export type MoveKind =
  | 'ask_clarifying'
  | 'probe_bottleneck'
  | 'challenge_assumption'
  | 'scale_curveball'
  | 'offer_hint'
  | 'affirm_and_advance'
  | 'stay_quiet'

/** What a rule found. The engine adds ruleId, stage and severity (see evaluate.ts). */
export interface Finding {
  /** Box or arrow ids, or short excerpts of the learner's own text. */
  evidence: string[]
  /** The learner's own names for the things involved, so wording can refer to them without inventing anything. */
  subjects: string[]
  /** Neutral, no spoilers. */
  summary: string
}

export interface Violation extends Finding {
  ruleId: string
  stage: number
  severity: Severity
}

/** A route the finished board should contain, by CATEGORY (never by name). `via` is an ordered list of categories on it. */
export interface RequiredPath { name: string; from: Role; to: Role; via?: readonly Role[] }

/** A rule the problem switches on, for problem-specific rules, with the order a coach should raise them in. */
export interface Challenge { ruleId: string; order: number }

/** The part of a problem the engine needs. Step 6 builds the full problem format on top of this. */
export interface EngineProblem {
  id: string
  requiredPaths: readonly RequiredPath[]
  challenges: readonly Challenge[]
  /** Terms not to utter before the keyed stage (1..5). */
  stageSpoilers: Readonly<Partial<Record<number, readonly string[]>>>
}

export interface Rule {
  id: string
  stage: 1 | 2 | 3 | 4 | 5
  severity: Severity
  /** Which kind of coach move a violation of this rule usually calls for. */
  move: Exclude<MoveKind, 'offer_hint' | 'affirm_and_advance' | 'stay_quiet'>
  /** Lowest learner level that is coached on this. Lower levels still see it flagged, but it is not raised. */
  minLevel: Level
  /** Only runs when the problem lists it in `challenges`. */
  needsChallenge?: boolean
  applies(state: State, problem: EngineProblem, lens: Lens): boolean
  check(state: State, problem: EngineProblem, lens: Lens): Finding | null
  hints: { l1: string; l2: (v: Violation) => string; l3: (v: Violation) => string }
  /** Terms that must not appear in L1/L2 wording or model replies about this rule. L3 may use them. */
  spoilers: readonly string[]
  /** For the report: what clears it, in plain words. */
  resolvedBy: string
}
