import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeLlm } from './fake-llm';
import type { LlmRequest } from './llm';

const schema = z.object({ ids: z.array(z.string()) });
const request: LlmRequest<{ ids: string[] }> = {
  step: 'triage',
  system: 'Système',
  prompt: 'Invite',
  schema,
  maxTokens: 100,
};

describe('createFakeLlm', () => {
  it('renvoie la sortie du handler', async () => {
    const llm = createFakeLlm(() => ({ ids: ['a'] }));
    expect(await llm.generateObject(request)).toEqual({ ids: ['a'] });
  });

  it('lève si la sortie du handler ne respecte pas le schéma', async () => {
    const llm = createFakeLlm(() => ({ ids: 'a' }));
    await expect(llm.generateObject(request)).rejects.toThrow();
  });

  it('garde chaque requête dans calls', async () => {
    const llm = createFakeLlm(() => ({ ids: [] }));
    await llm.generateObject(request);
    await llm.generateObject({ ...request, step: 'extraction' });
    expect(llm.calls.map((call) => call.step)).toEqual(['triage', 'extraction']);
  });
});
