// How much the coach throws at the learner: it widens or narrows which curveballs are raised.
export type Level = 'mid' | 'senior' | 'staff'
export const LEVELS: readonly Level[] = ['mid', 'senior', 'staff']
export const isLevel = (x: unknown): x is Level => x === 'mid' || x === 'senior' || x === 'staff'
