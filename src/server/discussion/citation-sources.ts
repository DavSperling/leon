import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type BriefingSection, parseBriefing } from '@/lib/briefing-view';
import type { CitationView, DiscussionCitation, SourceVisibility } from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefings } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { sourceInfoFrom, textArray } from '@/server/search/filters-sql';

// Ce qu'une citation sait de sa source, pour l'écran (la tuile d'une source, le surligneur d'une réponse) : l'outil,
// qui la voit, et le texte du passage cité. Rien n'est stocké avec la citation : c'est relu à chaque affichage, sous les
// droits du lecteur ; un passage qu'il ne voit pas (ou plus) n'a pas de détail, et l'écran garde le numéro seul.

export type CitationDetails = { kind: string; visibility: SourceVisibility; passage: string };

// Assez pour retrouver les mots d'une phrase dans son passage, sans envoyer au navigateur un tour entier.
const PASSAGE_MAX_CHARS = 2000;
// Une réponse cite rarement plus de dix sources ; une discussion entière, quelques dizaines.
const DETAILS_MAX = 200;

const isUuid = (value: string) => z.uuid().safeParse(value).success;

const visibilityOf = (ctx: TenantContext) => sql`case
  when s.acl = array[${ctx.userId}]::uuid[] then 'moi'
  when s.acl = array[s.tenant_id] then 'equipe'
  else 'restreint' end`;

export async function citationDetails(
  ctx: TenantContext,
  passageIds: readonly string[],
): Promise<Map<string, CitationDetails>> {
  const ids = [...new Set(passageIds.map((id) => id.toLowerCase()))]
    .filter(isUuid)
    .slice(0, DETAILS_MAX);
  if (ids.length === 0) return new Map();
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ id: string; kind: string; visibility: SourceVisibility; passage: string }>(sql`
      select p.id, s.kind, ${visibilityOf(ctx)} as visibility, left(p.text, ${PASSAGE_MAX_CHARS}) as passage
      from passages p
      join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
      where p.tenant_id = ${ctx.tenantId} and p.id = any(${textArray(ids)}::uuid[])`),
  );
  return new Map(
    rows.map((row) => [
      row.id,
      { kind: row.kind, visibility: row.visibility, passage: row.passage },
    ]),
  );
}

// Les messages d'une discussion avec, sur chaque citation, ce que sa source dit d'elle. Une panne ne prive pas de la
// discussion : les citations restent nues, l'écran garde leurs numéros.
export async function withCitationDetails<M extends { citations: DiscussionCitation[] }>(
  ctx: TenantContext,
  messages: M[],
): Promise<Array<Omit<M, 'citations'> & { citations: CitationView[] }>> {
  let details = new Map<string, CitationDetails>();
  try {
    details = await citationDetails(
      ctx,
      messages.flatMap((message) => message.citations.map((citation) => citation.passageId)),
    );
  } catch (error) {
    logError('discussion.details_citations', error);
  }
  return messages.map((message) => ({
    ...message,
    citations: message.citations.map((citation) => ({
      ...citation,
      ...details.get(citation.passageId.toLowerCase()),
    })),
  }));
}

// Une source du point du matin, à son numéro : le point numérote ses sources dans l'ordre où il les a reçues (n = rang
// + 1 dans `sourceIds`, briefing-prompt.ts). `passageId` : son premier passage, où le panneau ouvre l'original.
export type BriefingSource = {
  n: number;
  sourceId: string;
  passageId: string | null;
  title: string | null;
  url: string | null;
  kind: string;
  visibility: SourceVisibility;
};

export async function briefingSources(
  ctx: TenantContext,
  sourceIds: readonly string[],
): Promise<BriefingSource[]> {
  const ids = sourceIds.map((id) => id.toLowerCase()).slice(0, DETAILS_MAX);
  const wanted = ids.filter(isUuid);
  if (wanted.length === 0) return [];
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{
      id: string;
      kind: string;
      title: string | null;
      metadata: unknown;
      visibility: SourceVisibility;
      passage_id: string | null;
    }>(sql`
      select s.id, s.kind, s.title, s.metadata, ${visibilityOf(ctx)} as visibility,
             (select p.id from passages p
                join turns t on t.tenant_id = p.tenant_id and t.id = p.turn_id
               where p.tenant_id = s.tenant_id and p.source_id = s.id
               order by t.ts, t.created_at, t.id, p.ord
               limit 1) as passage_id
      from sources s
      where s.tenant_id = ${ctx.tenantId} and s.id = any(${textArray(wanted)}::uuid[])`),
  );
  const found = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id, index) => {
    const row = found.get(id);
    if (!row) return [];
    const info = sourceInfoFrom({ ...row, lastTs: new Date(0) });
    return [
      {
        n: index + 1,
        sourceId: row.id,
        passageId: row.passage_id,
        title: info.title,
        url: info.url,
        kind: row.kind,
        visibility: row.visibility,
      },
    ];
  });
}

// Le point du matin tel que l'Accueil le montre : le dernier de la personne (le projet lu en dernier, sinon préparé en
// dernier, comme latestBriefingProject), ses trois parties, et ses sources à leur numéro. Une vue de page n'est pas une
// lecture : ni `lastReadAt`, ni journal, ni recalcul mis en file (readBriefing le fait pour l'assistant de code). Null
// sans point, pour un point vide (« rien de nouveau »), ou quand une de ses sources n'est plus visible (le point n'est
// plus montré, comme dans readBriefing).
export async function homeBriefing(
  ctx: TenantContext,
): Promise<{ sections: BriefingSection[]; sources: BriefingSource[]; preparedAt: Date } | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({
        markdown: briefings.markdown,
        sourceIds: briefings.sourceIds,
        preparedAt: briefings.preparedAt,
      })
      .from(briefings)
      .where(eq(briefings.userId, ctx.userId))
      .orderBy(sql`${briefings.lastReadAt} desc nulls last`, desc(briefings.preparedAt))
      .limit(1),
  );
  const sections = row ? parseBriefing(row.markdown) : null;
  if (!row || !sections) return null;
  const wanted = [...new Set(row.sourceIds)];
  const sources = await briefingSources(ctx, wanted);
  return sources.length < wanted.length ? null : { sections, sources, preparedAt: row.preparedAt };
}
