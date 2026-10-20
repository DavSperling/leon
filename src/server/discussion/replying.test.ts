import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';

// Audit 3 n° 12 : dans l'appli compilée, la route de la discussion et l'action de la page (isReplying) sont dans
// deux paquets de Next, chacun avec sa copie des modules. Vérifié sur `pnpm build` puis `pnpm start` : la route
// voyait la réponse en cours (« en-cours »), l'action non. Deux imports après vi.resetModules() rejouent ces deux
// copies : elles doivent voir le même ensemble « réponses en cours ».

async function freshAgent() {
  vi.resetModules();
  return import('./agent');
}

describe('isReplying', () => {
  it('voit une réponse commencée par une autre copie du module', async () => {
    const route = await freshAgent();
    const action = await freshAgent();
    expect(route).not.toBe(action);
    const userId = randomUUID();
    const ctx = { tenantId: randomUUID(), userId, principals: [userId] };
    const discussionId = randomUUID();

    const events = route.replyStream(ctx, discussionId, 'La clause ?', {
      llm: createFakeLlm({ texts: [] }),
      embedder: null,
    });

    expect(events).not.toBeNull();
    expect(events).not.toBe('trop');
    expect(action.isReplying(ctx, discussionId)).toBe(true);
    expect(action.isReplying({ ...ctx, userId: randomUUID() }, discussionId)).toBe(false);
  });
});
