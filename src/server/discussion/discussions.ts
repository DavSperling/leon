import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionView } from '@/lib/actions';
import {
  DISCUSSION_MESSAGE_MAX_CHARS,
  type DiscussionCitation,
  parseDiscussionCitations,
} from '@/lib/discussion-events';
import { PAGE_SIZE } from '@/lib/search-limits';
import type { TenantContext } from '@/server/auth/tenant-context';
import { discussionMessages, discussions } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { ChatMessage } from '@/server/llm/llm';
import { oneLine } from '@/server/memory/labels';
import { sourceInfoFrom, textArray } from '@/server/search/filters-sql';
import { DISCUSSION_HISTORY_MAX } from './discussion-prompt';
import { listDiscussionActions, type TimedAction } from './proposed-actions';

// Les discussions et leurs messages (0012, C9 du plan du deuxième jet), toujours sous les droits de leur auteur :
// une discussion est privée à lui (acl = [user_id], la base le garantit) et personne d'autre ne la liste, ne la lit
// ni n'y écrit. Un identifiant invisible, inconnu ou mal écrit donne null, sans rien dire de ce qui existe.

export const DISCUSSION_TITLE_MAX = 200;
// Discussions listées au plus, les plus récentes d'abord.
export const DISCUSSIONS_LIST_MAX = 100;

export type DiscussionSummary = { id: string; title: string; createdAt: Date; updatedAt: Date };

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: DiscussionCitation[];
  // Les actions proposées pendant la réponse que ce message clôt (attachActions).
  actions: ActionView[];
  createdAt: Date;
};

const UuidSchema = z.uuid();
const isUuid = (value: string): boolean => UuidSchema.safeParse(value).success;

// Une question de 1 à DISCUSSION_MESSAGE_MAX_CHARS caractères, sans espaces autour. Lève sinon : la route et
// les actions valident avant d'appeler.
export function cleanQuestion(question: string): string {
  const text = question.trim();
  if (text === '' || text.length > DISCUSSION_MESSAGE_MAX_CHARS) {
    throw new Error('Question vide ou trop longue');
  }
  return text;
}

// Le titre d'une discussion : sa première question, sur une ligne, coupée à 200 caractères (sans séparer les deux
// moitiés d'un émoji).
export function discussionTitle(question: string): string {
  const line = oneLine(question);
  if (line.length <= DISCUSSION_TITLE_MAX) return line;
  const high = line.charCodeAt(DISCUSSION_TITLE_MAX - 1);
  return line.slice(
    0,
    high >= 0xd800 && high <= 0xdbff ? DISCUSSION_TITLE_MAX - 1 : DISCUSSION_TITLE_MAX,
  );
}

const summaryColumns = {
  id: discussions.id,
  title: discussions.title,
  createdAt: discussions.createdAt,
  updatedAt: discussions.updatedAt,
};

type SeedRow = {
  id: string;
  kind: string;
  title: string | null;
  metadata: unknown;
  passage_id: string | null;
};

// Les résultats d'où part une discussion ouverte depuis la barre : les sources que l'auteur voit, dans l'ordre de
// la page, chacune avec son titre, son lien et son premier passage (l'aperçu s'ouvre dessus). La liste vient du
// navigateur : une source invisible, inconnue ou sans passage est écartée, et la liste ne donne accès à rien.
async function resolveSeeds(
  tx: Tx,
  ctx: TenantContext,
  sourceIds: readonly string[],
): Promise<DiscussionCitation[]> {
  const ids = [...new Set(sourceIds.map((id) => id.toLowerCase()).filter(isUuid))].slice(
    0,
    PAGE_SIZE,
  );
  if (ids.length === 0) return [];
  const { rows } = await tx.execute<SeedRow>(sql`
    select s.id, s.kind, s.title, s.metadata,
           (select p.id from passages p
              join turns t on t.tenant_id = p.tenant_id and t.id = p.turn_id
             where p.tenant_id = s.tenant_id and p.source_id = s.id
             order by t.ts, t.created_at, t.id, p.ord
             limit 1) as passage_id
    from sources s
    where s.tenant_id = ${ctx.tenantId}
      and s.id = any(${textArray(ids)}::uuid[])`);
  const found = new Map(rows.map((row) => [row.id, row]));
  const seeds: DiscussionCitation[] = [];
  for (const id of ids) {
    const row = found.get(id);
    if (!row?.passage_id) continue;
    const info = sourceInfoFrom({ ...row, lastTs: new Date(0) });
    seeds.push({
      n: seeds.length + 1,
      sourceId: info.sourceId,
      passageId: row.passage_id,
      title: info.title,
      url: info.url,
    });
  }
  return seeds;
}

// Une discussion qui commence par cette question ; `seedSourceIds` : les résultats de la barre d'où elle part.
export async function createDiscussion(
  ctx: TenantContext,
  input: { question: string; seedSourceIds?: string[] },
): Promise<string> {
  const question = cleanQuestion(input.question);
  return withTenant(ctx, async (tx) => {
    const acl = [ctx.userId];
    const [created] = await tx
      .insert(discussions)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId, title: discussionTitle(question), acl })
      .returning({ id: discussions.id });
    if (!created) throw new Error('Discussion non créée');
    const seeds = await resolveSeeds(tx, ctx, input.seedSourceIds ?? []);
    await tx.insert(discussionMessages).values({
      tenantId: ctx.tenantId,
      discussionId: created.id,
      role: 'user',
      content: question,
      citations: seeds,
      acl,
    });
    return created.id;
  });
}

export async function listDiscussions(
  ctx: TenantContext,
  limit = DISCUSSIONS_LIST_MAX,
): Promise<DiscussionSummary[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select(summaryColumns)
      .from(discussions)
      .where(eq(discussions.userId, ctx.userId))
      .orderBy(desc(discussions.updatedAt), desc(discussions.id))
      .limit(limit),
  );
}

// Supprime une discussion de l'utilisateur et ses messages (clé étrangère en cascade). Faux si elle n'existe pas ou
// n'est pas la sienne : la sécurité par ligne la cache, et le filtre sur l'auteur le redit.
export async function deleteDiscussion(ctx: TenantContext, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return withTenant(ctx, async (tx) => {
    const deleted = await tx
      .delete(discussions)
      .where(and(eq(discussions.id, id), eq(discussions.userId, ctx.userId)))
      .returning({ id: discussions.id });
    return deleted.length > 0;
  });
}

async function loadSummary(tx: Tx, id: string): Promise<DiscussionSummary | null> {
  const [row] = await tx.select(summaryColumns).from(discussions).where(eq(discussions.id, id));
  return row ?? null;
}

export async function findDiscussion(
  ctx: TenantContext,
  id: string,
): Promise<DiscussionSummary | null> {
  if (!isUuid(id)) return null;
  return withTenant(ctx, (tx) => loadSummary(tx, id));
}

// Les sources que l'auteur voit encore parmi celles des citations (vigilance 3 du plan) : une source retirée,
// exclue ou supprimée depuis ne garde dans la discussion ni son titre ni son lien. Une requête, sous ses droits.
async function visibleSourceIds(
  tx: Tx,
  ctx: TenantContext,
  citations: readonly DiscussionCitation[],
): Promise<Set<string>> {
  const ids = [...new Set(citations.map((citation) => citation.sourceId))].filter(isUuid);
  if (ids.length === 0) return new Set();
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from sources
    where tenant_id = ${ctx.tenantId} and id = any(${textArray(ids)}::uuid[])`);
  return new Set(rows.map((row) => row.id));
}

// Une action se place sous le premier message écrit après elle : la réponse pendant laquelle Leon l'a proposée
// (écrite à la fin). Sans réponse gardée (une panne), sous le dernier message, la question.
function attachActions(messages: StoredMessage[], proposed: TimedAction[]): StoredMessage[] {
  const last = messages.length - 1;
  return messages.map((message, index) => ({
    ...message,
    actions: proposed
      .filter((action) => {
        const anchor = messages.findIndex((m) => m.createdAt > action.createdAt);
        return (anchor === -1 ? last : anchor) === index;
      })
      .map(({ createdAt: _at, ...action }) => action),
  }));
}

// La discussion et tous ses messages, dans l'ordre. Les citations d'une source que l'auteur ne voit plus sont
// écartées ; les autres gardent leur numéro, celui du texte de la réponse.
export async function getDiscussion(
  ctx: TenantContext,
  id: string,
): Promise<{ discussion: DiscussionSummary; messages: StoredMessage[] } | null> {
  if (!isUuid(id)) return null;
  const found = await readDiscussion(ctx, id);
  if (!found) return null;
  return {
    ...found,
    messages: attachActions(found.messages, await listDiscussionActions(ctx, id)),
  };
}

async function readDiscussion(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const discussion = await loadSummary(tx, id);
    if (!discussion) return null;
    const rows = await tx
      .select({
        id: discussionMessages.id,
        role: discussionMessages.role,
        content: discussionMessages.content,
        citations: discussionMessages.citations,
        createdAt: discussionMessages.createdAt,
      })
      .from(discussionMessages)
      .where(eq(discussionMessages.discussionId, id))
      .orderBy(asc(discussionMessages.createdAt), asc(discussionMessages.id));
    const messages = rows.map((row) => ({
      ...row,
      citations: parseDiscussionCitations(row.citations),
    }));
    const visible = await visibleSourceIds(
      tx,
      ctx,
      messages.flatMap((message) => message.citations),
    );
    return {
      discussion,
      messages: messages.map((message) => ({
        ...message,
        citations: message.citations.filter((citation) => visible.has(citation.sourceId)),
        actions: [] as ActionView[],
      })),
    };
  });
}

// L'accès de la discussion, qu'elle verrouille jusqu'à la fin de la transaction : deux écritures dans la même
// discussion passent l'une après l'autre, et la seconde voit ce que la première a écrit (ni question ni réponse en
// double, même depuis deux serveurs). Null pour une discussion invisible.
async function lockDiscussion(tx: Tx, id: string): Promise<string[] | null> {
  const [row] = await tx
    .select({ acl: discussions.acl })
    .from(discussions)
    .where(eq(discussions.id, id))
    .for('update');
  return row?.acl ?? null;
}

// L'heure d'un nouveau message : celle de l'écriture (clock_timestamp(), comme le défaut de 0012), mais toujours
// après le dernier message de la discussion. Les messages se lisent dans l'ordre de cette heure : une horloge qui
// recule d'un pas (synchronisation du serveur) ne doit pas faire passer une question avant la réponse précédente.
const nextMessageTime = (ctx: TenantContext, id: string) => sql`greatest(clock_timestamp(),
  (select max(m.created_at) from discussion_messages m
    where m.tenant_id = ${ctx.tenantId} and m.discussion_id = ${id}) + interval '1 microsecond')`;

const touch = (tx: Tx, id: string) =>
  tx.update(discussions).set({ updatedAt: sql`now()` }).where(eq(discussions.id, id));

// Avant une réponse : la question entre dans la discussion (sauf si elle y attend déjà sa réponse : une
// discussion ouverte depuis la barre, une réponse tombée en panne), puis les 20 derniers messages pour le
// modèle et, tant que la discussion n'a aucune réponse, les résultats d'où elle part que l'auteur voit encore,
// avec le numéro qu'affiche la question (l'agent les numérote ainsi). `questionId` : la question à laquelle la
// réponse répondra (saveReply).
export async function startReply(
  ctx: TenantContext,
  id: string,
  question: string,
): Promise<{ questionId: string; history: ChatMessage[]; seeds: DiscussionCitation[] } | null> {
  if (!isUuid(id)) return null;
  const text = cleanQuestion(question);
  return withTenant(ctx, async (tx) => {
    const acl = await lockDiscussion(tx, id);
    if (!acl) return null;
    const byId = eq(discussionMessages.discussionId, id);
    const newestFirst = [desc(discussionMessages.createdAt), desc(discussionMessages.id)];
    const [last] = await tx
      .select({
        id: discussionMessages.id,
        role: discussionMessages.role,
        content: discussionMessages.content,
      })
      .from(discussionMessages)
      .where(byId)
      .orderBy(...newestFirst)
      .limit(1);
    let questionId = last?.id ?? '';
    if (!(last?.role === 'user' && last.content === text)) {
      const [inserted] = await tx
        .insert(discussionMessages)
        .values({
          tenantId: ctx.tenantId,
          discussionId: id,
          role: 'user',
          content: text,
          acl,
          createdAt: nextMessageTime(ctx, id),
        })
        .returning({ id: discussionMessages.id });
      questionId = inserted?.id ?? '';
    }
    await touch(tx, id);
    const recent = await tx
      .select({ role: discussionMessages.role, content: discussionMessages.content })
      .from(discussionMessages)
      .where(byId)
      .orderBy(...newestFirst)
      .limit(DISCUSSION_HISTORY_MAX);
    const answered = await tx
      .select({ id: discussionMessages.id })
      .from(discussionMessages)
      .where(and(byId, eq(discussionMessages.role, 'assistant')))
      .limit(1);
    let seeds: DiscussionCitation[] = [];
    if (answered.length === 0) {
      const [first] = await tx
        .select({ citations: discussionMessages.citations })
        .from(discussionMessages)
        .where(byId)
        .orderBy(asc(discussionMessages.createdAt), asc(discussionMessages.id))
        .limit(1);
      const stored = parseDiscussionCitations(first?.citations);
      const visible = await visibleSourceIds(tx, ctx, stored);
      seeds = stored.filter((seed) => visible.has(seed.sourceId));
    }
    return { questionId, history: recent.reverse(), seeds };
  });
}

// 'gardee' : la réponse est écrite ; 'invisible' : la discussion n'est pas à l'auteur ; 'deja-repondue' : le
// dernier message n'est plus sa question (une autre réponse à la même question a été gardée entre-temps, ou une
// autre question est arrivée depuis).
export type SaveReplyResult = 'gardee' | 'invisible' | 'deja-repondue';

// La réponse de l'agent et ses citations, juste après la question à laquelle elle répond (`questionId`) : jamais
// deux réponses de suite, ni une réponse après une autre question. Rien n'est écrit pour une discussion invisible
// ou déjà répondue.
export async function saveReply(
  ctx: TenantContext,
  id: string,
  reply: { questionId: string; content: string; citations: DiscussionCitation[] },
): Promise<SaveReplyResult> {
  if (!isUuid(id)) return 'invisible';
  return withTenant(ctx, async (tx) => {
    const acl = await lockDiscussion(tx, id);
    if (!acl) return 'invisible';
    const [last] = await tx
      .select({ id: discussionMessages.id })
      .from(discussionMessages)
      .where(eq(discussionMessages.discussionId, id))
      .orderBy(desc(discussionMessages.createdAt), desc(discussionMessages.id))
      .limit(1);
    if (last?.id !== reply.questionId) return 'deja-repondue';
    await tx.insert(discussionMessages).values({
      tenantId: ctx.tenantId,
      discussionId: id,
      role: 'assistant',
      content: reply.content,
      citations: reply.citations,
      acl,
      createdAt: nextMessageTime(ctx, id),
    });
    await touch(tx, id);
    return 'gardee';
  });
}
