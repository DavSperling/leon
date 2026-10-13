import type { Llm, LlmRequest } from './llm';

export type FakeLlm = Llm & { calls: Array<LlmRequest<unknown>> };

// Valide la réponse du handler avec request.schema : une fixture qui dérive du schéma casse le test.
export function createFakeLlm(handler: (request: LlmRequest<unknown>) => unknown): FakeLlm {
  const calls: Array<LlmRequest<unknown>> = [];
  return {
    calls,
    async generateObject<T>(request: LlmRequest<T>): Promise<T> {
      calls.push(request);
      return request.schema.parse(handler(request));
    },
  };
}
