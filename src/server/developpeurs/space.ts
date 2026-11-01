import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { readBranchState } from '@/server/passation/state';

// L'espace Développeurs (spec du 01/11/2026) : les dépôts de l'équipe, leurs sessions Claude Code partagées et leurs
// dernières notes de passation, et à part les sessions privées du lecteur. Tout se lit sous ses droits : la sécurité
// par ligne ne lui montre que les sessions partagées et les siennes.

// shortcut: les 500 sessions les plus récentes seulement ; paginer quand une équipe en aura plus.
const SESSIONS_MAX = 500;

export type DevSession = {
  id: string;
  title: string | null;
  at: string;
  ownerUserId: string;
  ownerName: string | null;
  project: string;
  shared: boolean;
};
export type DevRepo = {
  project: string;
  sessions: DevSession[];
  notes: string | null;
  // Les sessions du lecteur sur ce dépôt sont partagées (le dépôt n'est pas dans ses depots_prives).
  mineShared: boolean;
};
export type DeveloperSpace = { repos: DevRepo[]; privateSessions: DevSession[] };

// Un membre qui code : il a au moins une session Claude Code ou une note de passation.
export async function isDeveloper(ctx: TenantContext): Promise<boolean> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from sources
        where owner_user_id = ${ctx.userId} and kind in ('claude_code', 'passation')
      ) as ok`);
    return rows[0]?.ok === true;
  });
}

// null pour un membre qui ne code pas : la page lui répond 404.
export async function developerSpace(ctx: TenantContext): Promise<DeveloperSpace | null> {
  if (!(await isDeveloper(ctx))) return null;
  const { sessions, noted, hidden } = await withTenant(ctx, async (tx) => {
    const sessions = await tx.execute<DevSession>(sql`
      select s.id, s.title, coalesce(s.last_turn_at, s.created_at)::text as at,
             s.owner_user_id as "ownerUserId", u.name as "ownerName",
             s.metadata ->> 'project' as project, s.acl @> array[s.tenant_id] as shared
      from sources s
      left join "user" u on u.id = s.owner_user_id
      where s.kind = 'claude_code' and s.metadata ->> 'project' like 'github.com/%'
      order by coalesce(s.last_turn_at, s.created_at) desc
      limit ${SESSIONS_MAX}`);
    const noted = await tx.execute<{ project: string }>(sql`
      select distinct metadata ->> 'project' as project from sources where kind = 'passation'`);
    const hidden = await tx.execute<{ project: string }>(sql`
      select project from depots_prives where user_id = ${ctx.userId}`);
    return { sessions: sessions.rows, noted: noted.rows, hidden: hidden.rows };
  });
  const hiddenProjects = new Set(hidden.map((row) => row.project));
  const shared = sessions.filter((session) => session.shared);
  const projects = [
    ...new Set([
      ...shared.map((session) => session.project),
      ...noted.map((row) => row.project),
      ...hiddenProjects,
    ]),
  ].sort();
  // Un dépôt après l'autre : une transaction chacun, jamais toutes les connexions du pool à la fois.
  const repos: DevRepo[] = [];
  for (const project of projects) {
    repos.push({
      project,
      sessions: shared.filter((session) => session.project === project),
      notes: await readBranchState(ctx, project, null),
      mineShared: !hiddenProjects.has(project),
    });
  }
  // La sécurité par ligne ne montre au lecteur que ses propres sessions privées.
  return { repos, privateSessions: sessions.filter((session) => !session.shared) };
}
