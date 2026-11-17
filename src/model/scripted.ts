import type { CoachModel, TurnReply, TurnRequest } from './types'

/** Always available, needs nothing. The seed is already the scripted wording. */
export const scriptedModel: CoachModel = {
  id: 'scripted',
  status: () => 'ready',
  load: async () => {},
  phrase: async (req: TurnRequest): Promise<TurnReply> => ({ message: req.seed, aboutRuleId: req.violation?.id }),
}
