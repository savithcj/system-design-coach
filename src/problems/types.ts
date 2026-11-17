import type { Role } from '../core/roles'
import type { Challenge, EngineProblem } from '../engine/types'

/** A deep dive the problem can raise in stage 5 (or a problem-specific check in an earlier stage). */
export interface ProblemChallenge extends Challenge {
  stage: 1 | 2 | 3 | 4 | 5
  /** When it becomes worth raising, in plain words (the rule decides in code). */
  trigger: string
  whyItMatters: string
}

/**
 * A question for a missing piece, in the order a design usually grows. Matched by CATEGORY only, so any
 * technology satisfies it. These are the L1/L2 wording source when no rule has anything to say.
 */
export interface Nudge { role: Role; text: string }

/**
 * What one problem asks of the engine. Problems are data: no answer graph, no pass/fail from a reference design.
 * The reference design lives in `baselines.ts` and is read only by the report, after the session is finished.
 */
export interface Problem extends EngineProblem {
  title: string
  short: string
  prompt: string
  /** What a good version of each stage looks like, for the report. Never shown during a session. */
  stageRubrics: Readonly<Record<1 | 2 | 3 | 4 | 5, string>>
  challenges: readonly ProblemChallenge[]
  nudges: readonly Nudge[]
  scaleNotes: { assumptions: readonly string[] }
}

export interface BaselineNode { id: string; role: Role; label: string; why: string; ddia?: string }
/** "One reasonable design", for the post-session comparison only. */
export interface Baseline { nodes: readonly BaselineNode[]; edges: readonly (readonly [string, string])[] }
