import { LOCAL_MODEL_ID } from './config'
import { REPLY_SCHEMA, parseReply, toMessages } from './prompt'
import type { CoachModel, ModelStatus, TurnReply, TurnRequest } from './types'

/** Minimal shape of the engine we use, so the heavy library is only ever imported lazily. */
interface Engine {
  chat: { completions: { create(args: unknown): Promise<{ choices: { message: { content: string | null } }[] }> } }
}

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/** WebLLM in a Web Worker. Any failure leaves the app on the scripted coach. */
export function webllmModel(modelId: string = LOCAL_MODEL_ID): CoachModel {
  let st: ModelStatus = 'idle'
  let engine: Engine | null = null
  return {
    id: `webllm:${modelId}`,
    status: () => st,
    async load(onProgress) {
      st = 'loading'
      try {
        if (!hasWebGpu()) throw new Error('WebGPU is not available')
        const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
        engine = (await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: (r) => onProgress(r.progress) })) as unknown as Engine
        st = 'ready'
      } catch (e) {
        st = 'error'
        // Workers and caches reject with non-Error values; keep their message so the status line can say why.
        throw e instanceof Error ? e : new Error(String((e as { message?: unknown } | null)?.message ?? e))
      }
    },
    async phrase(req: TurnRequest, opts): Promise<TurnReply> {
      if (!engine) throw new Error('model not loaded')
      const out = await engine.chat.completions.create({
        messages: toMessages(req, opts.strict),
        // Constrained decoding: the engine can only produce this shape.
        response_format: { type: 'json_object', schema: JSON.stringify(REPLY_SCHEMA) },
        temperature: opts.strict ? 0.1 : 0.4,
        max_tokens: 160,
        stream: false,
      })
      const reply = parseReply(out.choices[0]?.message.content ?? '')
      if (!reply) throw new Error('invalid reply')
      return reply
    },
  }
}
