import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type BriefingSection, parseBriefing } from '@/lib/briefing-view';
import type { CitationView, DiscussionCitation, SourceVisibility } from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefings } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
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
  within?: Tx,
): Promise<BriefingSource[]> {
  const ids = sourceIds.map((id) => id.toLowerCase()).slice(0, DETAILS_MAX);
  const wanted = ids.filter(isUuid);
  if (wanted.length === 0) return [];
  const read = (tx: Tx) =>
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
      where s.tenant_id = ${ctx.tenantId} and s.id = any(${textArray(wanted)}::uuid[])`);
  const { rows } = await (within ? read(within) : withTenant(ctx, read));
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

// Les derniers points regardés pour en trouver qui ne soient pas vides (« rien de nouveau », refait chaque matin sur
// un projet en sommeil).
const HOME_BRIEFING_CANDIDATES = 10;
// L'Accueil montre un point par dossier de travail (un dépôt, ou un dossier sans dépôt), au plus quatre, tous préparés
// dans les 24 heures qui précèdent le plus récent : la fournée du matin, pas un vieux point d'un projet abandonné.
export const HOME_BRIEFINGS_MAX = 4;
const HOME_BRIEFING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type HomeBriefing = {
  sections: BriefingSection[];
  sources: BriefingSource[];
  preparedAt: Date;
  project: string;
  stale: boolean;
};

// Les points du matin tels que l'Accueil les montre : un par projet, le plus récemment préparé d'abord, tous projets
// confondus, sans les points vides, leurs trois parties, et leurs sources à leur numéro. Pas le seul projet lu en
// dernier (latestBriefingProject) : l'Accueil ne parlerait que d'un sujet. Une vue de page n'est pas une lecture : ni
// `lastReadAt`, ni journal ; `stale` dit à l'Accueil que le projet a bougé depuis, pour qu'il en demande le recalcul
// (refreshShownBriefing). Un point dont une source n'est plus visible n'est pas montré, comme dans readBriefing. Un
// point dont toutes les lignes sont retirées (0074) est rendu sans parties : l'Accueil ne le montre pas, mais en
// demande encore le recalcul.
export async function homeBriefings(ctx: TenantContext): Promise<HomeBriefing[]> {
  // les points et leurs sources dans la même transaction : une seule ouverture
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        markdown: briefings.markdown,
        sourceIds: briefings.sourceIds,
        preparedAt: briefings.preparedAt,
        project: briefings.project,
        stale: briefings.stale,
        dismissed: briefings.dismissed,
      })
      .from(briefings)
      .where(eq(briefings.userId, ctx.userId))
      .orderBy(desc(briefings.preparedAt))
      .limit(HOME_BRIEFING_CANDIDATES);
    const filled = rows.filter((candidate) => parseBriefing(candidate.markdown) !== null);
    const newest = filled[0]?.preparedAt.getTime() ?? 0;
    const shown: HomeBriefing[] = [];
    for (const row of filled) {
      if (shown.length === HOME_BRIEFINGS_MAX) break;
      if (newest - row.preparedAt.getTime() > HOME_BRIEFING_WINDOW_MS) break;
      const wanted = [...new Set(row.sourceIds)];
      const sources = await briefingSources(ctx, wanted, tx);
      if (sources.length < wanted.length) continue;
      shown.push({
        sections: parseBriefing(row.markdown, row.dismissed) ?? [],
        sources,
        preparedAt: row.preparedAt,
        project: row.project,
        stale: row.stale,
      });
    }
    return shown;
  });
}
