import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { FOLLOW_FAMILIES, type FollowFamily, toolsOfFamilies } from '@/lib/providers';
import { members } from '@/server/db/schema/auth';
import { managerFollows, reportingLines } from '@/server/db/schema/organisation';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { recentSources } from '@/server/search/activity';
import type { SourceHit } from '@/server/search/types';
import { canInvite } from './members';
import type { TenantContext } from './tenant-context';

// L'organigramme (0053) et l'écran « Mon équipe ». Un propriétaire ou un administrateur rattache chaque membre à son
// manager ; un manager voit les gens sous lui, directs et indirects, et choisit par personne les familles d'outils
// qu'il suit. Rien de privé n'y entre : seules les sources visibles de toute l'équipe sont lues, sous ses droits.

const MemberIdSchema = z.uuid();
// Garde-fou des requêtes récursives : setManager refuse les boucles, aucune chaîne réelle n'est aussi longue.
const MAX_DEPTH = 32;
// Sources montrées pour une personne ; le reste se lit dans la recherche (`de:`).
export const REPORT_ACTIVITY_LIMIT = 12;

export type Report = {
  memberId: string;
  name: string;
  email: string;
  managerId: string;
  managerName: string;
  depth: number; // 1 : rattaché directement au lecteur
  families: FollowFamily[];
};

type ReportRow = {
  member_id: string;
  manager_id: string;
  depth: number;
  name: string;
  email: string;
  manager_name: string;
  families: string[] | null;
};

const myMemberId = (ctx: TenantContext) =>
  sql`(select id from member where "userId" = ${ctx.userId} and "organizationId" = ${ctx.tenantId})`;

// Sans ligne, le manager suit tout ; une famille retirée du code depuis est ignorée.
const followed = (families: string[] | null): FollowFamily[] =>
  families === null ? [...FOLLOW_FAMILIES] : FOLLOW_FAMILIES.filter((f) => families.includes(f));

// L'ordre de l'arbre : chaque manager suivi des gens sous lui, par nom.
function treeOrder(rows: Report[]): Report[] {
  const byName = (a: Report, b: Report) => a.name.localeCompare(b.name, 'fr');
  const children = new Map<string, Report[]>();
  for (const row of rows)
    children.set(row.managerId, [...(children.get(row.managerId) ?? []), row]);
  const ordered: Report[] = [];
  const visit = (row: Report) => {
    ordered.push(row);
    for (const child of (children.get(row.memberId) ?? []).sort(byName)) visit(child);
  };
  for (const root of rows.filter((row) => row.depth === 1).sort(byName)) visit(root);
  return ordered;
}

async function reportsIn(tx: Tx, ctx: TenantContext): Promise<Report[]> {
  const { rows } = await tx.execute<ReportRow>(sql`
    with recursive under (member_id, manager_id, depth) as (
      select r.member_id, r.manager_id, 1 from reporting_lines r where r.manager_id = ${myMemberId(ctx)}
      union
      select r.member_id, r.manager_id, u.depth + 1 from reporting_lines r
      join under u on r.manager_id = u.member_id
      where u.depth < ${MAX_DEPTH}
    )
    select u.member_id, u.manager_id, u.depth, usr.name, usr.email, boss.name as manager_name, f.families
    from under u
    join member m on m.id = u.member_id
    join "user" usr on usr.id = m."userId"
    join member mm on mm.id = u.manager_id
    join "user" boss on boss.id = mm."userId"
    left join manager_follows f on f.manager_id = ${myMemberId(ctx)} and f.member_id = u.member_id`);
  return treeOrder(
    rows.map((row) => ({
      memberId: row.member_id,
      name: row.name,
      email: row.email,
      managerId: row.manager_id,
      managerName: row.manager_name,
      depth: Number(row.depth),
      families: followed(row.families),
    })),
  );
}

// Les gens sous le lecteur, directs puis indirects, dans l'ordre de l'arbre.
export async function listReports(ctx: TenantContext): Promise<Report[]> {
  return withTenant(ctx, (tx) => reportsIn(tx, ctx));
}

// L'activité récente d'une personne de `listReports` : les sources visibles de toute l'équipe (jamais celles qui ne
// sont qu'à elle ou au lecteur), d'un outil des familles suivies, dont un passage est d'elle.
export async function reportActivity(
  ctx: TenantContext,
  report: Report,
): Promise<{ hits: SourceHit[]; total: number }> {
  const tools = toolsOfFamilies(report.families);
  if (tools.length === 0) return { hits: [], total: 0 };
  return withTenant(ctx, (tx) =>
    recentSources(
      tx,
      ctx,
      { tools, authorEmails: [report.email] },
      { limit: REPORT_ACTIVITY_LIMIT, offset: 0 },
      sql`true`,
      sql`s.acl @> array[${ctx.tenantId}]::uuid[]`,
    ),
  );
}

// Seulement pour une personne sous le lecteur ; false sinon.
export async function setFollowed(
  ctx: TenantContext,
  memberId: string,
  families: readonly string[],
): Promise<boolean> {
  if (!MemberIdSchema.safeParse(memberId).success) return false;
  const kept = FOLLOW_FAMILIES.filter((f) => families.includes(f));
  return withTenant(ctx, async (tx) => {
    if (!(await reportsIn(tx, ctx)).some((report) => report.memberId === memberId)) return false;
    await tx
      .insert(managerFollows)
      .values({ tenantId: ctx.tenantId, managerId: myMemberId(ctx), memberId, families: kept })
      .onConflictDoUpdate({
        target: [managerFollows.managerId, managerFollows.memberId],
        set: { families: kept },
      });
    return true;
  });
}

// Rattache un membre à son manager (null : à personne). Réservé aux propriétaires et administrateurs ; refuse une
// boucle (le manager est déjà sous ce membre).
export async function setManager(
  ctx: TenantContext,
  memberId: string,
  managerId: string | null,
): Promise<'ok' | 'refuse' | 'boucle'> {
  const ids = managerId === null ? [memberId] : [memberId, managerId];
  if (!ids.every((id) => MemberIdSchema.safeParse(id).success)) return 'refuse';
  if (memberId === managerId) return 'boucle';
  if (!(await canInvite(ctx))) return 'refuse';
  return withTenant(ctx, async (tx) => {
    const found = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.organizationId, ctx.tenantId), inArray(members.id, ids)));
    if (found.length !== ids.length) return 'refuse';
    if (managerId === null) {
      await tx.delete(reportingLines).where(eq(reportingLines.memberId, memberId));
      return 'ok';
    }
    // Deux rattachements simultanés pourraient fermer une boucle sans que l'un voie l'autre : un à la fois.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`organigramme:${ctx.tenantId}`}))`,
    );
    const { rows } = await tx.execute(sql`
      with recursive under (id, depth) as (
        select ${memberId}::uuid, 0
        union
        select r.member_id, u.depth + 1 from reporting_lines r
        join under u on r.manager_id = u.id
        where u.depth < ${MAX_DEPTH}
      )
      select 1 from under where id = ${managerId}::uuid limit 1`);
    if (rows.length > 0) return 'boucle';
    await tx
      .insert(reportingLines)
      .values({ tenantId: ctx.tenantId, memberId, managerId })
      .onConflictDoUpdate({ target: reportingLines.memberId, set: { managerId } });
    return 'ok';
  });
}
