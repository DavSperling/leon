import { afterAll, describe, expect, it } from 'vitest';
import type { AnswerEvent } from '@/lib/answer-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { searchPassages } from '@/server/search/search';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { answerStream } from './answer';
import { ANSWER_CONTEXT_MAX_CHARS } from './answer-prompt';
import { readPassageTexts } from './passage-texts';

// La réponse en tête sur la vraie recherche : le modèle ne reçoit que ce que le lecteur a le droit de voir, le
// texte entier des passages, et des numéros qui désignent les résultats affichés sur la page.

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
  const conversation = await seedIndexed(alice, {
    kind: 'claude_ai',
    title: 'Conversation privée',
    turns: [{ text: `Note personnelle : la ${PRIVATE_WORDS} reste entre nous.` }],
  });
  const ticket = await seedIndexed(alice, {
    kind: 'github',
    acl: [tenantId],
    title: 'Ticket fournisseur',
    turns: [{ text: 'Le fournisseur xylophage relance : la clause de pénalité est à revoir.' }],
  });
  return { tenantId, alice, bob, privateId: conversation.sourceId, ticketId: ticket.sourceId };
}

// Les passages envoyés au modèle : leur numéro et le titre de leur source.
function sentPassages(content: string): Array<{ n: number; title: string }> {
  return [...content.matchAll(/<passage n="(\d+)" outil="[^"]*" titre="([^"]*)"/g)].map(
    (match) => ({ n: Number(match[1]), title: match[2] ?? '' }),
  );
}

describe('answerStream sur la base', () => {
  // Vigilance 4 : le prompt ne contient que les passages que le lecteur voit, même quand la liste des résultats
  // envoyée par le navigateur nomme une source qu'il ne voit pas.
  it('n’envoie au modèle aucun passage d’une conversation privée d’un autre, même cherchée par ses mots exacts et nommée dans la liste', async () => {
    const { alice, bob, privateId, ticketId } = await setup();
    const asBob = createFakeLlm({ texts: ['Réponse [1].'] });
    const asAlice = createFakeLlm({ texts: ['Réponse [1].'] });
    const resultIds = [privateId, ticketId];

    await collect(
      answerStream(bob, { query: PRIVATE_WORDS, resultIds }, { llm: asBob, embedder: null }),
    );
    await collect(
      answerStream(alice, { query: PRIVATE_WORDS, resultIds }, { llm: asAlice, embedder: null }),
    );

    const bobPrompt = JSON.stringify(asBob.calls);
    expect(asBob.calls).toHaveLength(1);
    expect(bobPrompt).toContain('Ticket fournisseur');
    expect(bobPrompt).not.toContain('Conversation privée');
    expect(bobPrompt).not.toContain('Note personnelle');
    expect(bobPrompt).not.toContain('entre nous');
    // Alice, elle, retrouve sa conversation : la recherche n'a pas simplement échoué.
    expect(JSON.stringify(asAlice.calls)).toContain('Note personnelle');
  });

  // La page et la route font chacune leur recherche. Entre les deux, une capture ou une synchronisation peut
  // apporter une source plus pertinente : la route numérote quand même d'après la page, et la source arrivée
  // après n'est pas lue par le modèle (la page ne l'affiche pas, un renvoi vers elle ne mènerait nulle part).
  it('relie chaque [n] au n-ième résultat de la page, même quand une source plus pertinente arrive entre les deux recherches', async () => {
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
    const query = 'fournisseur xylophage';
    const page = await searchPassages(alice, { query, embedder });

    const newcomer = await seedIndexed(alice, {
      kind: 'linear',
      acl: [tenantId],
      title: 'Arrivé après la page',
      turns: [
        {
          text: 'Fournisseur xylophage. Le fournisseur xylophage, encore le fournisseur xylophage.',
        },
      ],
    });
    const later = await searchPassages(alice, { query, embedder });
    // Le cas est bien là : la recherche de la route place la source arrivée après la page à un rang que la page
    // donne à un autre résultat. Numéroter d'après elle ferait mener [n] à une autre source que celle lue.
    const pageIds = page.hits.map((hit) => hit.sourceId);
    const laterIds = later.hits.map((hit) => hit.sourceId);
    expect(pageIds).not.toContain(newcomer.sourceId);
    expect(laterIds.indexOf(newcomer.sourceId)).toBeGreaterThanOrEqual(0);
    expect(laterIds.indexOf(newcomer.sourceId)).toBeLessThan(pageIds.length);

    const llm = createFakeLlm({ texts: ['Réponse [1].'] });
    await collect(
      answerStream(
        alice,
        { query, resultIds: page.hits.map((hit) => hit.sourceId) },
        { llm, embedder },
      ),
    );

    const content = llm.calls[0]?.messages[0]?.content ?? '';
    const sent = sentPassages(content);
    expect(page.hits.length).toBeGreaterThanOrEqual(5);
    expect(sent.length).toBeGreaterThanOrEqual(5);
    for (const { n, title } of sent) {
      expect(title).toBe(page.hits[n - 1]?.title);
    }
    expect(content).not.toContain('Arrivé après la page');
  });

  // La recherche ne rend qu'un extrait surligné (2 fragments de 30 mots) : trop peu pour répondre. Le modèle lit
  // le passage entier, dans la limite de ANSWER_CONTEXT_MAX_CHARS.
  it('envoie au modèle le texte entier du passage, pas l’extrait de la recherche', async () => {
    const { tenantId, alice } = await setup();
    const long =
      `Accord cadre ornithorynque. ${'Le plafond des remises est fixé à vingt pour cent du montant annuel, révisable chaque trimestre. '.repeat(13)}`.trim();
    expect(long.length).toBeGreaterThan(1200);
    expect(long.length).toBeLessThan(1600);
    const accord = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Accord cadre',
      turns: [{ text: long }],
    });
    const query = 'ornithorynque';
    const page = await searchPassages(alice, { query, embedder: null });
    expect(page.hits.map((hit) => hit.sourceId)).toEqual([accord.sourceId]);
    expect(page.hits[0]?.passages[0]?.snippet.length ?? 0).toBeLessThan(long.length / 2);

    const llm = createFakeLlm({ texts: ['Réponse [1].'] });
    await collect(
      answerStream(alice, { query, resultIds: [accord.sourceId] }, { llm, embedder: null }),
    );

    const content = llm.calls[0]?.messages[0]?.content ?? '';
    expect(content).toContain(`>${long}</passage>`);
    expect(content.length).toBeLessThan(ANSWER_CONTEXT_MAX_CHARS);
  });
});

describe('readPassageTexts', () => {
  it('rend le texte des passages que le lecteur voit, et rien de ceux d’un autre', async () => {
    const { alice, bob } = await setup();
    const [alicePage, bobPage] = await Promise.all([
      searchPassages(alice, { query: PRIVATE_WORDS, embedder: null }),
      searchPassages(bob, { query: PRIVATE_WORDS, embedder: null }),
    ]);
    const all = alicePage.hits.flatMap((hit) => hit.passages.map((entry) => entry.passageId));
    expect(all.length).toBe(2);

    const asAlice = await readPassageTexts(alice, all);
    const asBob = await readPassageTexts(bob, all);

    expect([...asAlice.values()].join(' ')).toContain('Note personnelle');
    expect(asAlice.size).toBe(2);
    expect(asBob.size).toBe(1);
    expect([...asBob.values()].join(' ')).not.toContain('Note personnelle');
    expect(bobPage.hits).toHaveLength(1);
  });

  it('rend une table vide sans identifiant, sans interroger la base', async () => {
    const { alice } = await setup();
    expect(await readPassageTexts(alice, [])).toEqual(new Map());
  });
});
