import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { DiscussionCitation } from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { discussionMessages, discussions } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import {
  createDiscussion,
  findDiscussion,
  getDiscussion,
  listDiscussions,
  saveReply,
  startReply,
} from './discussions';

// Les discussions sont privées à leur auteur (C9) : la base le garantit, pas seulement le code.

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from discussions where tenant_id = any($1)', [tenantIds]);
  await dropTeams(tenantIds);
});

async function team() {
  const { tenantId, members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  return { tenantId, alice, bob };
}

// Une réponse à la dernière question de la discussion (celle que saveReply attend).
async function answer(
  ctx: TenantContext,
  id: string,
  reply: { content: string; citations: DiscussionCitation[] },
) {
  const messages = (await getDiscussion(ctx, id))?.messages ?? [];
  const questionId = messages.findLast((m) => m.role === 'user')?.id ?? '';
  return saveReply(ctx, id, { questionId, ...reply });
}

const RLS_VIOLATION = { cause: { code: '42501' } };
const CHECK_VIOLATION = { cause: { code: '23514' } };

describe('createDiscussion', () => {
  it('crée une discussion privée à son auteur, titrée par la question, qui commence par elle', async () => {
    const { alice } = await team();

    const id = await createDiscussion(alice, { question: '  Où en est le\ncontrat ACME ?  ' });

    const [row] = await adminDb.select().from(discussions).where(eq(discussions.id, id));
    expect(row).toMatchObject({ userId: alice.userId, title: 'Où en est le contrat ACME ?' });
    expect(row?.acl).toEqual([alice.userId]);
    const messages = await adminDb
      .select()
      .from(discussionMessages)
      .where(eq(discussionMessages.discussionId, id));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: 'Où en est le\ncontrat ACME ?',
      citations: [],
      acl: [alice.userId],
    });
  });

  it('coupe un titre trop long à 200 caractères', async () => {
    const { alice } = await team();

    const id = await createDiscussion(alice, { question: 'mot '.repeat(100) });

    expect((await findDiscussion(alice, id))?.title).toHaveLength(200);
  });

  it('refuse une question vide ou trop longue', async () => {
    const { alice } = await team();

    await expect(createDiscussion(alice, { question: '   ' })).rejects.toThrow();
    await expect(createDiscussion(alice, { question: 'x'.repeat(4001) })).rejects.toThrow();
  });

  // La liste vient du navigateur : elle ne donne accès à rien que l'auteur ne voie déjà.
  it('garde les résultats d’où elle part, sous les droits de l’auteur et dans l’ordre de la page', async () => {
    const { tenantId, alice, bob } = await team();
    const ticket = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket ACME',
      metadata: { nature: 'ticket', url: 'https://github.com/acme/leon/issues/7' },
      turns: [{ text: 'Le contrat ACME est signé.' }, { text: 'Relance prévue.' }],
    });
    const meeting = await seedIndexed(alice, {
      kind: 'fathom',
      acl: [tenantId],
      title: 'Call ACME',
      metadata: { nature: 'reunion', url: 'javascript:alert(1)' },
      turns: [{ text: 'On a parlé du contrat.' }],
    });
    const secret = await seedIndexed(alice, {
      kind: 'claude_ai',
      title: 'Conversation privée d’Alice',
      turns: [{ text: 'Notes personnelles sur ACME.' }],
    });
    const unknown = randomUUID();
    const seeds = [meeting.sourceId, secret.sourceId, unknown, 'pas-un-id', ticket.sourceId];

    const id = await createDiscussion(bob, { question: 'ACME ?', seedSourceIds: seeds });

    const found = await getDiscussion(bob, id);
    const [question] = found?.messages ?? [];
    const firstPassage = async (sourceId: string) =>
      (
        await adminPool.query<{ id: string }>(
          `select p.id from passages p join turns t on t.id = p.turn_id
            where p.source_id = $1 order by t.ts, t.created_at, t.id, p.ord limit 1`,
          [sourceId],
        )
      ).rows[0]?.id;
    expect(question?.citations).toEqual([
      {
        n: 1,
        sourceId: meeting.sourceId,
        passageId: await firstPassage(meeting.sourceId),
        title: 'Call ACME',
        url: null,
      },
      {
        n: 2,
        sourceId: ticket.sourceId,
        passageId: await firstPassage(ticket.sourceId),
        title: 'Ticket ACME',
        url: 'https://github.com/acme/leon/issues/7',
      },
    ]);
  });
});

describe('les discussions d’un autre', () => {
  it('ne se listent ni ne se lisent', async () => {
    const { alice, bob } = await team();
    const id = await createDiscussion(alice, { question: 'Question privée' });
    const own = await createDiscussion(bob, { question: 'Question de Bob' });

    expect((await listDiscussions(bob)).map((d) => d.id)).toEqual([own]);
    expect(await findDiscussion(bob, id)).toBeNull();
    expect(await getDiscussion(bob, id)).toBeNull();
    expect((await listDiscussions(alice)).map((d) => d.id)).toEqual([id]);
    expect((await getDiscussion(alice, id))?.messages).toHaveLength(1);
  });

  it('ne reçoivent ni question ni réponse, par le code', async () => {
    const { alice, bob } = await team();
    const id = await createDiscussion(alice, { question: 'Question privée' });

    expect(await startReply(bob, id, 'Je m’invite')).toBeNull();
    expect(await answer(bob, id, { content: 'Réponse', citations: [] })).toBe('invisible');
    const { rows } = await adminPool.query(
      'select 1 from discussion_messages where discussion_id = $1',
      [id],
    );
    expect(rows).toHaveLength(1);
  });

  // La clé étrangère se vérifie hors sécurité par ligne : sans la règle de 0012, connaître l'identifiant
  // suffirait pour écrire dans la discussion d'un autre.
  it('ne reçoivent aucune ligne, même écrite directement par la base', async () => {
    const { alice, bob } = await team();
    const id = await createDiscussion(alice, { question: 'Question privée' });

    const write = (acl: string[]) =>
      withTenant(bob, (tx) =>
        tx.insert(discussionMessages).values({
          tenantId: bob.tenantId,
          discussionId: id,
          role: 'user',
          content: 'Glissé',
          acl,
        }),
      );

    await expect(write([bob.userId])).rejects.toMatchObject(RLS_VIOLATION);
    await expect(write([alice.userId])).rejects.toMatchObject(RLS_VIOLATION);
    await expect(write([bob.tenantId])).rejects.toMatchObject(RLS_VIOLATION);
  });

  it('ne peuvent pas devenir celles de l’équipe', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question privée' });

    // Une discussion visible de l'équipe : refusée par la base.
    const shared = withTenant(alice, (tx) =>
      tx.insert(discussions).values({
        tenantId: alice.tenantId,
        userId: alice.userId,
        title: 'Partagée',
        acl: [alice.tenantId],
      }),
    );
    await expect(shared).rejects.toMatchObject(CHECK_VIOLATION);
    // Un message de sa propre discussion, mais visible de l'équipe : refusé aussi.
    const message = withTenant(alice, (tx) =>
      tx.insert(discussionMessages).values({
        tenantId: alice.tenantId,
        discussionId: id,
        role: 'user',
        content: 'Visible de tous ?',
        acl: [alice.tenantId],
      }),
    );
    await expect(message).rejects.toMatchObject(RLS_VIOLATION);
  });
});

describe('ce que l’app peut changer', () => {
  it('ajoute des messages, change la date d’une discussion, la supprime (0031), et rien d’autre', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });

    // Une écriture à la fois, chacune attendue dès qu'elle part : lancées ensemble, l'une pouvait échouer pendant
    // qu'on attendait l'autre, et Vitest comptait son refus comme une erreur non traitée.
    const retitle = () =>
      withTenant(alice, (tx) =>
        tx.update(discussions).set({ title: 'Autre' }).where(eq(discussions.id, id)),
      );
    const rewrite = () =>
      withTenant(alice, (tx) =>
        tx
          .update(discussionMessages)
          .set({ content: 'Autre' })
          .where(eq(discussionMessages.discussionId, id)),
      );
    // Un message ne s'efface pas seul : il ne part qu'avec sa discussion (0031).
    const remove = () =>
      withTenant(alice, (tx) =>
        tx.delete(discussionMessages).where(eq(discussionMessages.discussionId, id)),
      );

    await expect(retitle()).rejects.toMatchObject(RLS_VIOLATION);
    await expect(rewrite()).rejects.toMatchObject(RLS_VIOLATION);
    await expect(remove()).rejects.toMatchObject(RLS_VIOLATION);
  });
});

describe('startReply et saveReply', () => {
  it('ajoute la question, puis la réponse et ses citations, et rajeunit la discussion', async () => {
    const { tenantId, alice } = await team();
    const ticket = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'T',
      turns: [{ text: 'Le contrat ACME est signé.' }],
    });
    const id = await createDiscussion(alice, { question: 'Première question' });
    const before = await findDiscussion(alice, id);

    const turn = await startReply(alice, id, 'Deuxième question');
    const saved = await answer(alice, id, {
      content: 'Réponse [1].',
      citations: [
        { n: 1, sourceId: ticket.sourceId, passageId: randomUUID(), title: 'T', url: null },
      ],
    });

    expect(turn?.history).toEqual([
      { role: 'user', content: 'Première question' },
      { role: 'user', content: 'Deuxième question' },
    ]);
    expect(saved).toBe('gardee');
    const found = await getDiscussion(alice, id);
    expect(found?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Première question'],
      ['user', 'Deuxième question'],
      ['assistant', 'Réponse [1].'],
    ]);
    expect(found?.messages[2]?.citations).toHaveLength(1);
    expect(found?.discussion.updatedAt.getTime()).toBeGreaterThan(
      before?.updatedAt.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  // La page reprend d'elle-même la question restée sans réponse (une discussion ouverte depuis la barre, une
  // panne du modèle) : la même question n'est pas répétée.
  it('ne répète pas la question restée sans réponse', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });

    const turn = await startReply(alice, id, 'Question');

    expect(turn?.history).toEqual([{ role: 'user', content: 'Question' }]);
  });

  it('joint les résultats d’origine tant que la discussion n’a pas de réponse', async () => {
    const { tenantId, alice } = await team();
    const ticket = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket ACME',
      turns: [{ text: 'Le contrat ACME est signé.' }],
    });
    const id = await createDiscussion(alice, {
      question: 'ACME ?',
      seedSourceIds: [ticket.sourceId],
    });

    const first = await startReply(alice, id, 'ACME ?');
    await answer(alice, id, { content: 'Réponse.', citations: [] });
    const second = await startReply(alice, id, 'Et ensuite ?');

    expect(first?.seeds.map((seed) => seed.sourceId)).toEqual([ticket.sourceId]);
    expect(second?.seeds).toEqual([]);
  });

  it('rend au plus les 20 derniers messages, dans l’ordre', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'message 1' });
    for (let index = 2; index <= 24; index++) {
      if (index % 2 === 0) await answer(alice, id, { content: `message ${index}`, citations: [] });
      else await startReply(alice, id, `message ${index}`);
    }

    const turn = await startReply(alice, id, 'message 25');

    expect(turn?.history).toHaveLength(20);
    expect(turn?.history[0]?.content).toBe('message 6');
    expect(turn?.history.at(-1)).toEqual({ role: 'user', content: 'message 25' });
  });

  // Une horloge qui recule d'un pas (synchronisation du serveur) ne fait pas passer une question avant la réponse
  // précédente : chaque message est daté après le dernier de sa discussion.
  it('garde l’ordre des messages quand l’horloge recule', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });
    await answer(alice, id, { content: 'Réponse', citations: [] });
    // La réponse semble écrite dans une heure : l'horloge de la base a reculé depuis.
    await adminPool.query(
      `update discussion_messages set created_at = now() + interval '1 hour'
        where discussion_id = $1 and role = 'assistant'`,
      [id],
    );

    const turn = await startReply(alice, id, 'Suite');
    await answer(alice, id, { content: 'Réponse à la suite', citations: [] });

    expect(turn?.history.map((m) => m.content)).toEqual(['Question', 'Réponse', 'Suite']);
    expect((await getDiscussion(alice, id))?.messages.map((m) => m.content)).toEqual([
      'Question',
      'Réponse',
      'Suite',
      'Réponse à la suite',
    ]);
  });

  // Une réponse répond à la question qui la précède : jamais deux réponses de suite (deux agents lancés pour la
  // même question, sur deux serveurs ou après un retour sur la page).
  it('n’écrit pas une seconde réponse à la même question', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });

    const first = await answer(alice, id, { content: 'Réponse', citations: [] });
    const second = await answer(alice, id, { content: 'Doublon', citations: [] });

    expect([first, second]).toEqual(['gardee', 'deja-repondue']);
    expect((await getDiscussion(alice, id))?.messages.map((m) => m.content)).toEqual([
      'Question',
      'Réponse',
    ]);
  });

  // Sur deux serveurs : une question posée pendant la réponse à la précédente. Cette réponse-là n'est pas écrite
  // après la nouvelle question, à laquelle elle ne répond pas.
  it('n’écrit pas la réponse d’une question qui n’est plus la dernière', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });
    const first = await startReply(alice, id, 'Question');
    const second = await startReply(alice, id, 'Autre question');

    const late = await saveReply(alice, id, {
      questionId: first?.questionId ?? '',
      content: 'Réponse à la première',
      citations: [],
    });
    const right = await saveReply(alice, id, {
      questionId: second?.questionId ?? '',
      content: 'Réponse à la seconde',
      citations: [],
    });

    expect([late, right]).toEqual(['deja-repondue', 'gardee']);
    expect((await getDiscussion(alice, id))?.messages.map((m) => m.content)).toEqual([
      'Question',
      'Autre question',
      'Réponse à la seconde',
    ]);
  });

  it('écrites en même temps, une seule réponse et une seule question entrent', async () => {
    const { alice } = await team();
    const id = await createDiscussion(alice, { question: 'Question' });

    const saved = await Promise.all(
      [1, 2, 3].map((n) => answer(alice, id, { content: `Réponse ${n}`, citations: [] })),
    );
    await Promise.all([1, 2, 3].map(() => startReply(alice, id, 'Suite')));

    expect(saved.toSorted()).toEqual(['deja-repondue', 'deja-repondue', 'gardee']);
    const { rows } = await adminPool.query<{ role: string }>(
      'select role from discussion_messages where discussion_id = $1 order by created_at',
      [id],
    );
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('rend null pour une discussion inconnue ou un identifiant mal écrit', async () => {
    const { alice } = await team();

    expect(await startReply(alice, randomUUID(), 'Question')).toBeNull();
    expect(await startReply(alice, 'pas-un-id', 'Question')).toBeNull();
    expect(await findDiscussion(alice, 'pas-un-id')).toBeNull();
    expect(await answer(alice, 'pas-un-id', { content: 'x', citations: [] })).toBe('invisible');
  });
});

// Vigilance 3 : une source que l'auteur ne voit plus (part retirée, exclusion, élément supprimé dans l'outil)
// disparaît aussi des discussions déjà écrites. Le titre et le lien gardés avec la citation ne s'affichent plus.
describe('une source devenue invisible', () => {
  // L'accès de la source, de ses tours et de ses passages, comme le recalcule une part retirée (C11).
  const restrict = async (sourceId: string, acl: string[]) => {
    for (const table of ['sources', 'turns', 'passages']) {
      const column = table === 'sources' ? 'id' : 'source_id';
      await adminPool.query(`update ${table} set acl = $2 where ${column} = $1`, [sourceId, acl]);
    }
  };

  async function discussionOnTwoTickets() {
    const { tenantId, alice, bob } = await team();
    const kept = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket gardé',
      metadata: { nature: 'ticket', url: 'https://github.com/acme/leon/issues/1' },
      turns: [{ text: 'Le contrat ACME est signé.' }],
    });
    const lost = await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket retiré',
      metadata: { nature: 'ticket', url: 'https://github.com/acme/leon/issues/2' },
      turns: [{ text: 'La relance ACME est prévue.' }],
    });
    const id = await createDiscussion(bob, {
      question: 'ACME ?',
      seedSourceIds: [kept.sourceId, lost.sourceId],
    });
    return { alice, bob, kept, lost, id };
  }

  it('n’est plus citée, ni dans la réponse ni dans les résultats d’origine', async () => {
    const { alice, bob, lost, id } = await discussionOnTwoTickets();
    const seeds = (await getDiscussion(bob, id))?.messages[0]?.citations ?? [];
    await answer(bob, id, { content: 'Signé [1], relance [2].', citations: seeds });

    await restrict(lost.sourceId, [alice.userId]);

    const found = await getDiscussion(bob, id);
    expect(found?.messages.map((m) => m.citations.map((c) => c.title))).toEqual([
      ['Ticket gardé'],
      ['Ticket gardé'],
    ]);
    expect(JSON.stringify(found)).not.toContain('Ticket retiré');
    expect(JSON.stringify(found)).not.toContain(lost.sourceId);
  });

  // Audit 2 n° 15 c : les résultats joints gardent le numéro qu'affiche la question (getDiscussion), même avec
  // un trou : l'agent les numérote ainsi.
  it('n’est plus jointe à la première question envoyée au modèle', async () => {
    const { bob, kept, lost, id } = await discussionOnTwoTickets();

    await adminPool.query('delete from sources where id = $1', [kept.sourceId]);
    const turn = await startReply(bob, id, 'ACME ?');
    const shown = (await getDiscussion(bob, id))?.messages[0]?.citations ?? [];

    expect(turn?.seeds.map((seed) => [seed.n, seed.sourceId])).toEqual([[2, lost.sourceId]]);
    expect(shown.map((seed) => [seed.n, seed.sourceId])).toEqual([[2, lost.sourceId]]);
  });
});
