import { afterAll, describe, expect, it } from 'vitest';
import type { AnswerEvent } from '@/lib/answer-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { searchPassages } from '@/server/search/search';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { answerStream } from './answer';
import { buildAnswerPrompt } from './answer-prompt';

// La réponse en tête sur la vraie recherche : le modèle ne reçoit que ce que le lecteur a le droit de voir.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function collect(stream: AsyncIterable<AnswerEvent> | null): Promise<AnswerEvent[]> {
  if (stream === null) throw new Error('flux attendu');
  const events: AnswerEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const PRIVATE_WORDS = 'clause pénalité fournisseur xylophage';

// Alice et Bob dans une équipe : une conversation privée d'Alice et un ticket d'équipe, qui partagent des mots.
async function setup() {
  const { tenantId, members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  await seedIndexed(alice, {
    kind: 'claude_ai',
    title: 'Conversation privée',
    turns: [{ text: `Note personnelle : la ${PRIVATE_WORDS} reste entre nous.` }],
  });
  await seedIndexed(alice, {
    kind: 'github',
    acl: [tenantId],
    title: 'Ticket fournisseur',
    turns: [{ text: 'Le fournisseur xylophage relance : la clause de pénalité est à revoir.' }],
  });
  return { tenantId, alice, bob };
}

describe('answerStream sur la base', () => {
  // Vigilance 4 : le prompt ne contient que les passages que le lecteur voit.
  it('n’envoie au modèle aucun passage d’une conversation privée d’un autre, même cherchée par ses mots exacts', async () => {
    const { alice, bob } = await setup();
    const asBob = createFakeLlm({ texts: ['Réponse [1].'] });
    const asAlice = createFakeLlm({ texts: ['Réponse [1].'] });

    await collect(answerStream(bob, PRIVATE_WORDS, { llm: asBob, embedder: null }));
    await collect(answerStream(alice, PRIVATE_WORDS, { llm: asAlice, embedder: null }));

    const bobPrompt = JSON.stringify(asBob.calls);
    expect(asBob.calls).toHaveLength(1);
    expect(bobPrompt).toContain('Ticket fournisseur');
    expect(bobPrompt).not.toContain('Conversation privée');
    expect(bobPrompt).not.toContain('Note personnelle');
    expect(bobPrompt).not.toContain('entre nous');
    // Alice, elle, retrouve sa conversation : la recherche n'a pas simplement échoué.
    expect(JSON.stringify(asAlice.calls)).toContain('Note personnelle');
  });

  it('numérote les passages par le rang de leur résultat sur la première page', async () => {
    const { tenantId, alice } = await setup();
    for (const index of [1, 2, 3]) {
      await seedIndexed(alice, {
        kind: 'linear',
        acl: [tenantId],
        title: `Ticket ${index}`,
        turns: [{ text: `Le fournisseur xylophage, épisode ${index}.` }],
      });
    }
    const embedder = createFakeEmbedder();
    const now = new Date();

    const page = await searchPassages(alice, { query: 'fournisseur xylophage', embedder, now });
    const { numbered } = buildAnswerPrompt('fournisseur xylophage', page.hits);

    expect(page.hits.length).toBeGreaterThanOrEqual(4);
    expect(numbered.length).toBeGreaterThanOrEqual(4);
    for (const entry of numbered) {
      expect(page.hits[entry.n - 1]?.sourceId).toBe(entry.sourceId);
    }
  });
});
