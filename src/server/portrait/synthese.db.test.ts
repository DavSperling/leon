import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorTurn } from '@/server/connectors/types';
import { users } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { lignesFiche } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import { type FicheLine, readFiche, retireLine } from './fiche';
import { gatherPortraitMaterial } from './material';
import { synthesizeFiche } from './synthese';

vi.mock('@/server/pipeline/queue');

// La synthèse de la fiche, de bout en bout sous les droits de la personne : la matière (ses seules sources, dans tous
// ses outils), un seul appel au faux modèle, le rôle et les tâches écrits dans sa fiche. Les fils de courrier passent
// par la normalisation et l'ingestion des connecteurs, comme une relève. Données inventées : Julie et Paul dans une
// organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const LEA = 'lea@client.test';

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

// Julie et Paul, collègues, et Zoé, d'une autre organisation.
async function people(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  tenantIds.push(team.tenantId, other.tenantId);
  return [...team.members, ...other.members] as [TenantContext, TenantContext, TenantContext];
}

const received = (at: Date, text: string): ConnectorTurn => ({
  externalId: `message:${randomUUID()}`,
  role: 'participant',
  author: { name: 'Léa Roy', email: LEA },
  recipients: { to: ['julie@acme.test'], cc: [] },
  text,
  ts: at.toISOString(),
});
const sent = (at: Date, text: string, to: string[] = [LEA]): ConnectorTurn => ({
  ...received(at, text),
  author: { name: 'Julie Martin', email: 'julie@acme.test' },
  side: 'team',
  recipients: { to, cc: [] },
});

// Un fil de courrier relevé par la boîte privée de `owner`.
async function thread(
  owner: TenantContext,
  title: string,
  messages: ConnectorTurn[],
  provider: 'gmail' | 'outlook' = 'gmail',
): Promise<void> {
  const item = normalizeItem(
    {
      externalId: `thread:${randomUUID()}`,
      nature: 'fil',
      title,
      url: null,
      updatedAt: messages.at(-1)?.ts ?? '',
      origin: {},
      turns: messages,
    },
    provider,
  );
  if (!item) throw new Error('fil de test refusé par la normalisation');
  const connection = {
    id: await seedConnection(owner, { provider }),
    provider,
    createdBy: owner.userId,
    privateRaw: true,
  };
  await ingestConnectorItems(owner, connection, [item]);
}

const titles = (material: Awaited<ReturnType<typeof gatherPortraitMaterial>>) =>
  material.sources.map((entry) => entry.source.title);

describe('gatherPortraitMaterial', () => {
  it('rend ses sources dans tous ses outils, assistants compris, et du courrier les seuls fils où elle a écrit de sa main', async () => {
    const [julie, paul, zoe] = await people();
    await seedRun(julie, {
      kind: 'claude_ai',
      title: 'Préparer une relance',
      turns: [{ text: 'Aide-moi à relancer ce client.', ts: ago(HOUR) }],
      lastTurnAt: ago(HOUR),
    });
    // Elle a répondu de sa main : le fil est gardé, avec ses 2 derniers tours.
    await thread(julie, 'Devis pour un client', [
      received(ago(3 * DAY), 'Bonjour Julie, où en est le devis ?'),
      sent(ago(2 * DAY), 'Bonjour Léa,\nVoici le devis.\nCordialement'),
      received(ago(2 * HOUR), 'Merci Julie, je regarde.'),
    ]);
    await thread(
      julie,
      'Relance du contrat',
      [sent(ago(3 * HOUR), 'Bonjour Léa,\nAvez-vous pu signer le contrat ?')],
      'outlook',
    );
    await seedRun(julie, {
      kind: 'linear',
      title: 'LIN-4 Démo client',
      metadata: { nature: 'ticket' },
      turns: [{ text: 'Démo préparée.', ts: ago(4 * HOUR), role: 'participant' }],
      lastTurnAt: ago(4 * HOUR),
    });
    // Ce qu'elle reçoit sans y répondre.
    await thread(julie, 'Lettre d’information', [received(ago(HOUR), 'Les nouveautés du mois.')]);
    // La notification d'un outil, partie cinq fois de son compte : les mêmes libellés, aux mêmes destinataires.
    for (const n of [1, 2, 3, 4, 5])
      await thread(julie, `Nouveau contact ${n}`, [
        sent(
          ago(n * HOUR),
          `Nouveau contact ajouté au tableau\nNom : Exemple Inventé ${n}\nTéléphone : 01 00 00 00 ${10 + n}\nCode postal : 7500${n}`,
          ['alertes@acme.test'],
        ),
      ]);
    // Une réunion de son agenda Outlook : du courrier par son outil, mais pas un mail qu'elle a écrit.
    await seedRun(julie, {
      kind: 'outlook',
      title: 'Point devis',
      metadata: { nature: 'reunion' },
      turns: [{ text: 'Début : 2026-11-17T09:00:00Z', ts: ago(HOUR), role: 'document' }],
      lastTurnAt: ago(HOUR),
    });
    // Ce qui n'est pas à elle : le ticket que Paul ouvre à l'équipe (elle le voit), son mail, la page de Zoé.
    await seedRun(paul, {
      kind: 'linear',
      acl: [paul.tenantId],
      title: 'LIN-9 Ticket de Paul',
      turns: [{ text: 'Texte de Paul.', ts: ago(HOUR) }],
      lastTurnAt: ago(HOUR),
    });
    await thread(paul, 'Mail de Paul', [sent(ago(HOUR), 'Bonjour Léa,\nUn mot de Paul.')]);
    await seedRun(zoe, {
      kind: 'notion',
      title: 'Page de Zoé',
      turns: [{ text: 'Texte de Zoé.', ts: ago(HOUR) }],
      lastTurnAt: ago(HOUR),
    });

    const material = await gatherPortraitMaterial(julie, new Date());

    // Les plus récentes d'abord.
    expect(titles(material)).toEqual([
      'Préparer une relance',
      'Devis pour un client',
      'Relance du contrat',
      'LIN-4 Démo client',
    ]);
    expect(material.sources.map((entry) => entry.source.kind)).toEqual([
      'claude_ai',
      'gmail',
      'outlook',
      'linear',
    ]);
    expect(material.sources[1]?.turns.map((turn) => turn.text)).toEqual([
      'Bonjour Léa,\nVoici le devis.\nCordialement',
      'Merci Julie, je regarde.',
    ]);
    // Julie voit le ticket de Paul (sécurité par ligne), mais ce n'est pas le sien ; Paul a les siens.
    const visible = await withTenant(julie, (tx) =>
      tx.select({ id: sources.id }).from(sources).where(eq(sources.title, 'LIN-9 Ticket de Paul')),
    );
    expect(visible).toHaveLength(1);
    expect(titles(await gatherPortraitMaterial(paul, new Date())).toSorted()).toEqual([
      'LIN-9 Ticket de Paul',
      'Mail de Paul',
    ]);
    expect(titles(await gatherPortraitMaterial(zoe, new Date()))).toEqual(['Page de Zoé']);
  });

  it('ignore ce qui date de plus de 90 jours', async () => {
    const [julie] = await people();
    const now = new Date();
    for (const [title, days] of [
      ['Page de l’été', 91],
      ['Page de la rentrée', 89],
    ] as const) {
      const at = new Date(now.getTime() - days * DAY);
      await seedRun(julie, {
        kind: 'notion',
        title,
        turns: [{ text: 'Notes.', ts: at }],
        lastTurnAt: at,
      });
    }
    // Un fil où elle a écrit il y a plus de 90 jours, et qui n'a reçu depuis qu'une réponse : hors de la période.
    await thread(julie, 'Devis de l’été', [
      sent(new Date(now.getTime() - 100 * DAY), 'Bonjour Léa,\nVoici le devis.'),
      received(new Date(now.getTime() - DAY), 'Merci, bien reçu.'),
    ]);

    expect(titles(await gatherPortraitMaterial(julie, now))).toEqual(['Page de la rentrée']);
  });

  it('s’arrête à 50 sources par outil et à 150 en tout, les plus récentes', async () => {
    const [julie] = await people();
    const now = new Date();
    const pages = (
      kind: 'notion' | 'linear' | 'github' | 'jira',
      count: number,
      minutesAgo: (index: number) => number,
    ) =>
      Array.from({ length: count }, (_, index) => ({
        tenantId: julie.tenantId,
        kind,
        externalId: randomUUID(),
        ownerUserId: julie.userId,
        title: `${kind} ${index}`,
        acl: [julie.userId],
        lastTurnAt: new Date(now.getTime() - minutesAgo(index) * 60_000),
      }));
    // 60 pages Notion, toutes plus récentes que le reste, puis 40 éléments de trois autres outils, entrelacés.
    await adminDb
      .insert(sources)
      .values([
        ...pages('notion', 60, (index) => index + 1),
        ...pages('linear', 40, (index) => 100 + index * 3),
        ...pages('github', 40, (index) => 101 + index * 3),
        ...pages('jira', 40, (index) => 102 + index * 3),
      ]);

    const material = await gatherPortraitMaterial(julie, now);

    expect(material.sources).toHaveLength(150);
    const count = (kind: string) =>
      material.sources.filter((entry) => entry.source.kind === kind).length;
    // Notion s'arrête à 50, et laisse 100 places aux autres : les 100 plus récents d'entre eux.
    expect(['notion', 'linear', 'github', 'jira'].map(count)).toEqual([50, 34, 33, 33]);
    expect(titles(material).slice(0, 2)).toEqual(['notion 0', 'notion 1']);
    expect(titles(material)).toContain('notion 49');
    expect(titles(material)).not.toContain('notion 50');
    expect(titles(material).at(-1)).toBe('linear 33');
    const times = material.sources.map((entry) => entry.source.lastTs.getTime());
    expect(times).toEqual(times.toSorted((a, b) => b - a));
  });
});

const ROLE = 'Commerciale : suit les clients et prépare les devis.';
const DEVIS = {
  tache: 'Répondre aux demandes de devis',
  detail: 'Un client demande un prix ; elle répond avec un devis.',
  n: [1, 2, 3],
};
const RELANCE = {
  tache: 'Relancer les devis sans réponse',
  detail: 'Sans réponse après une semaine, elle relance.',
  n: [2, 3, 4],
};
const answer = (...lines: unknown[]) => lines.map((line) => `${JSON.stringify(line)}\n`);
const ANSWER = answer({ role: ROLE }, DEVIS, RELANCE);

// Quatre fiches de CRM de Julie : leur rang (la plus récente d'abord) est leur numéro dans la consigne.
async function seeded(julie: TenantContext): Promise<string[]> {
  const ids: string[] = [];
  for (const n of [1, 2, 3, 4]) {
    const run = await seedRun(julie, {
      kind: 'hubspot',
      title: `Demande de devis ${n}`,
      turns: [
        {
          text: `Devis envoyé, demande ${n}.`,
          ts: ago(n * HOUR),
          role: 'participant',
          authorName: 'Julie Martin',
        },
      ],
      lastTurnAt: ago(n * HOUR),
    });
    ids.push(run.sourceId);
  }
  return ids;
}

const stored = (ctx: TenantContext) =>
  adminDb.select().from(lignesFiche).where(eq(lignesFiche.userId, ctx.userId));
const byKey = (fiche: FicheLine[]) =>
  fiche.toSorted((a, b) => `${a.genre}:${a.cle}`.localeCompare(`${b.genre}:${b.cle}`));
const deleteAccountOf = (ctx: TenantContext) =>
  adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ctx.userId));

describe('synthesizeFiche', () => {
  it('écrit le rôle et les tâches dans sa fiche, en provenance « synthese », d’un seul appel au modèle sur ses sources', async () => {
    const [julie, paul] = await people();
    const ids = await seeded(julie);
    await seedRun(paul, {
      kind: 'hubspot',
      acl: [paul.tenantId],
      title: 'Fiche de Paul',
      turns: [{ text: 'Texte de Paul.', ts: ago(HOUR) }],
      lastTurnAt: ago(HOUR),
    });
    const llm = createFakeLlm({ texts: ANSWER });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(await synthesizeFiche(julie, { llm })).toBe(true);

    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call?.step).toBe('fiche');
    const prompt = call?.messages[0]?.content ?? '';
    expect(prompt.startsWith(DATA_GUARD_LINE)).toBe(true);
    // Son nom : de quoi savoir quels tours d'un fil sont les siens.
    expect(prompt).toMatch(/<personne nom="[^"]+"\/>/);
    expect(prompt).toContain('<espace nom="Organisation de test"/>');
    expect(prompt).toContain('<source n="1" outil="HubSpot" titre="Demande de devis 1">');
    expect(prompt).toContain('Devis envoyé, demande 4.');
    expect(prompt).not.toContain('Paul');
    expect(byKey(await readFiche(julie))).toEqual([
      {
        id: expect.any(String),
        genre: 'role',
        cle: '',
        valeur: { texte: ROLE },
        provenance: 'synthese',
        mails: null,
        corrigeeLe: null,
      },
      {
        id: expect.any(String),
        genre: 'tache',
        cle: '1',
        valeur: { titre: DEVIS.tache, detail: DEVIS.detail, sources: ids.slice(0, 3) },
        provenance: 'synthese',
        mails: null,
        corrigeeLe: null,
      },
      {
        id: expect.any(String),
        genre: 'tache',
        cle: '2',
        valeur: { titre: RELANCE.tache, detail: RELANCE.detail, sources: ids.slice(1, 4) },
        provenance: 'synthese',
        mails: null,
        corrigeeLe: null,
      },
    ]);
    for (const row of await stored(julie)) expect(row.acl).toEqual([julie.userId]);
    expect(await stored(paul)).toEqual([]);
    // Le journal ne porte que des nombres : rien de ce que le modèle a lu ou écrit.
    const logged = info.mock.calls.find((args) => args[1] === 'fiche.synthesized');
    info.mockRestore();
    expect(JSON.parse(String(logged?.[2]))).toEqual({
      userId: julie.userId,
      sources: 4,
      lignes: 3,
      chars: ANSWER.join('').length,
    });
  });

  it('ne rappelle pas le modèle une seconde fois', async () => {
    const [julie] = await people();
    await seeded(julie);
    const llm = createFakeLlm({ texts: ANSWER });

    expect(await synthesizeFiche(julie, { llm })).toBe(true);
    const before = await stored(julie);
    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(1);
    expect(await stored(julie)).toEqual(before);
  });

  it('une ligne retirée ne revient pas, et suffit à ne pas rappeler le modèle', async () => {
    const [julie] = await people();
    await seeded(julie);
    await synthesizeFiche(julie, { llm: createFakeLlm({ texts: ANSWER }) });
    // Elle retire tout ce que la synthèse a écrit.
    for (const line of await readFiche(julie)) expect(await retireLine(julie, line.id)).toBe(true);
    const before = await stored(julie);
    const llm = createFakeLlm({ texts: ANSWER });

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await readFiche(julie)).toEqual([]);
    expect(await stored(julie)).toEqual(before);
    expect(before.map((row) => row.retireeLe)).toEqual([
      expect.any(Date),
      expect.any(Date),
      expect.any(Date),
    ]);
  });

  it('n’écrit rien quand une ligne de rôle arrive pendant l’appel au modèle, et ne l’écrase pas', async () => {
    const [julie] = await people();
    await seeded(julie);
    const fake = createFakeLlm({ texts: ANSWER });
    const llm: Llm = {
      ...fake,
      async *streamText(request) {
        await adminPool.query(
          `insert into lignes_fiche (tenant_id, user_id, genre, valeur, provenance, acl)
           values ($1, $2, 'role', '{"texte": "Directrice commerciale."}', 'personne', array[$2::uuid])`,
          [julie.tenantId, julie.userId],
        );
        yield* fake.streamText(request);
      },
    };

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    const fiche = await readFiche(julie);
    expect(fiche.map((line) => [line.genre, line.cle, line.provenance])).toEqual([
      ['role', '', 'personne'],
    ]);
    expect(fiche[0]?.valeur).toEqual({ texte: 'Directrice commerciale.' });
  });

  it('de deux synthèses lancées ensemble, une seule écrit : la fiche ne mêle pas les deux réponses', async () => {
    const [julie] = await people();
    await seeded(julie);
    // Les deux appels au modèle finissent au même instant : les deux écritures se croisent.
    let called = 0;
    let go = () => {};
    const both = new Promise<void>((resolve) => {
      go = resolve;
    });
    const gated = (texts: string[]): Llm => {
      const fake = createFakeLlm({ texts });
      return {
        ...fake,
        async *streamText(request) {
          if (++called === 2) go();
          await both;
          yield* fake.streamText(request);
        },
      };
    };
    const CRM = { tache: 'Tenir le CRM à jour', detail: 'Après un échange.', n: [1, 2, 4] };

    const wrote = await Promise.all([
      synthesizeFiche(julie, { llm: gated(ANSWER) }),
      // Sans rôle et avec une tâche de plus : mêlée à la première, la fiche aurait quatre lignes.
      synthesizeFiche(julie, { llm: gated(answer(RELANCE, CRM, DEVIS)) }),
    ]);

    expect(wrote.toSorted()).toEqual([false, true]);
    const keys = byKey(await readFiche(julie)).map((line) => `${line.genre}:${line.cle}`);
    expect([
      ['role:', 'tache:1', 'tache:2'],
      ['tache:1', 'tache:2', 'tache:3'],
    ]).toContainEqual(keys);
  });

  it('n’écrit rien, sans appeler le modèle, pour un compte supprimé', async () => {
    const [julie] = await people();
    await seeded(julie);
    await deleteAccountOf(julie);
    const llm = createFakeLlm({ texts: ANSWER });

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
  });

  it('n’écrit rien quand le compte est supprimé pendant l’appel au modèle', async () => {
    const [julie] = await people();
    await seeded(julie);
    const fake = createFakeLlm({ texts: ANSWER });
    const llm: Llm = {
      ...fake,
      async *streamText(request) {
        await deleteAccountOf(julie);
        yield* fake.streamText(request);
      },
    };

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(fake.calls).toHaveLength(1);
    expect(await stored(julie)).toEqual([]);
  });

  it('n’écrit rien, sans appeler le modèle, quand elle n’a aucune matière', async () => {
    const [julie, paul] = await people();
    await thread(julie, 'Lettre d’information', [received(ago(HOUR), 'Les nouveautés du mois.')]);
    await seeded(paul);
    const llm = createFakeLlm({ texts: ANSWER });

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(0);
    expect(await stored(julie)).toEqual([]);
  });

  it.each([
    ['vide', []],
    ['blanche', [' \n ']],
    ['sans ligne JSON', ['Je ne vois rien qui revienne dans ces éléments.']],
    ['dont la seule tâche se voit dans deux sources', answer({ ...DEVIS, n: [1, 2, 2, 9] })],
    ['dont le rôle est trop long', answer({ role: 'x'.repeat(301) })],
  ])('n’écrit rien et rend false pour une réponse %s', async (_, texts) => {
    const [julie] = await people();
    await seeded(julie);
    const llm = createFakeLlm({ texts });

    expect(await synthesizeFiche(julie, { llm })).toBe(false);

    expect(llm.calls).toHaveLength(1);
    expect(await stored(julie)).toEqual([]);
  });

  it('laisse remonter une panne du modèle sans rien écrire, et un nouvel appel reste possible', async () => {
    const [julie] = await people();
    await seeded(julie);
    const failing: Llm = {
      // biome-ignore lint/correctness/useYield: un modèle en panne ne rend rien
      async *streamText() {
        throw new LlmError('erreur du modèle');
      },
      runAgent: () => {
        throw new Error('inutile ici');
      },
    };

    await expect(synthesizeFiche(julie, { llm: failing })).rejects.toThrow(LlmError);

    expect(await stored(julie)).toEqual([]);
    expect(await synthesizeFiche(julie, { llm: createFakeLlm({ texts: ANSWER }) })).toBe(true);
    expect(await stored(julie)).toHaveLength(3);
  });

  it('ni un collègue ni une autre organisation ne lisent ces lignes', async () => {
    const [julie, paul, zoe] = await people();
    await seeded(julie);
    await synthesizeFiche(julie, { llm: createFakeLlm({ texts: ANSWER }) });

    const visible = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ id: lignesFiche.id }).from(lignesFiche));
    expect(await visible(julie)).toHaveLength(3);
    for (const ctx of [paul, zoe]) {
      expect(await visible(ctx)).toEqual([]);
      expect(await readFiche(ctx)).toEqual([]);
    }
  });
});
