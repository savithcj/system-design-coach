// An OpenAI-compatible endpoint (llama.cpp server, Ollama, vLLM...) as a CoachModel, for `npm run evals -- --openai <url>`.
// Off by default and never part of the app: it lets a candidate model be scored on fixtures from Node.
import { toMessages } from '../src/model/prompt'
import type { CoachModel, TurnReply, TurnRequest } from '../src/model/types'
import { parseReply } from '../src/model/prompt'

export function openAiCompatible(baseUrl: string, model: string, apiKey?: string): CoachModel {
  return {
    id: `openai:${model}`,
    status: () => 'ready',
    load: async () => {},
    async phrase(req: TurnRequest, opts): Promise<TurnReply> {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, messages: toMessages(req, opts.strict), temperature: opts.strict ? 0.1 : 0.4, max_tokens: 160, response_format: { type: 'json_object' } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { choices: { message: { content: string } }[] }
      const reply = parseReply(body.choices[0]?.message.content ?? '')
      if (!reply) throw new Error('invalid reply')
      return reply
    },
  }
}
