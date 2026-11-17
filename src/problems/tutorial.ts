import type { Problem } from './types'

/**
 * A tiny practice round that teaches the tool, not system design. It has no rules, no hidden answer and no reference design;
 * the coach's steps come from src/engine/tutorial.ts.
 */
export const TUTORIAL: Problem = {
  id: 'tutorial', title: 'Practice: a bookmark saver', short: 'Tutorial', tutorial: true,
  prompt: 'A tiny app lets people save links and find them again later. Nothing here is graded: use it to try every part of the tool.',
  stageRubrics: { 1: '', 2: '', 3: '', 4: '', 5: '' },
  requiredPaths: [],
  challenges: [],
  stageSpoilers: {},
  nudges: [],
  scaleNotes: { assumptions: [] },
}
