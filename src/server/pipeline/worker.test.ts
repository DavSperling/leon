import { describe, expect, it, vi } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';

const work = vi.fn(async () => 'worker-id');
vi.mock('./queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queue')>()),
  getBoss: async () => ({ work }),
}));

const { startPipelineWorker } = await import('./worker');

describe('startPipelineWorker', () => {
  // pg-boss rejette `pollingIntervalSeconds: undefined` (il teste la présence de la clé) :
  // sans option, la clé doit être absente, sinon le serveur ne démarre pas.
  it("n'envoie pas pollingIntervalSeconds à pg-boss quand il n'est pas fourni", async () => {
    await startPipelineWorker(createFakeLlm(() => ({})));

    expect(work).toHaveBeenCalledTimes(3);
    for (const [, options] of work.mock.calls as unknown as Array<[string, object]>) {
      expect(options).not.toHaveProperty('pollingIntervalSeconds');
    }
  });
});
