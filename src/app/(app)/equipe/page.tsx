import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Team } from '@/components/verre/equipe';
import { directoryState } from '@/server/auth/annuaire';
import { listGroups } from '@/server/auth/groupes';
import { canInvite, getMembership, listInvitations, listMembers } from '@/server/auth/members';
import { listReports, managersSeeAll, reportActivity } from '@/server/auth/organisation';
import { requireUserContext } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('team'))('title') };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// L'équipe : l'organigramme, tout le monde, les groupes. ?personne=<membre> ouvre sa fiche (et, pour une personne sous
// le lecteur, son activité) ; ?annuaire=… et ?error=… : le retour de Google ou de Microsoft après « Importer
// l'organigramme » (annuaire.ts).
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    personne?: string | string[];
    annuaire?: string | string[];
    error?: string | string[];
  }>;
}) {
  const ctx = await requireUserContext();
  const [members, reports, seeAllAllowed, admin, invitations, membership] = await Promise.all([
    listMembers(ctx),
    listReports(ctx),
    managersSeeAll(ctx),
    canInvite(ctx),
    listInvitations(ctx),
    getMembership(ctx),
  ]);
  const params = await searchParams;
  const personne = one(params.personne) ?? null;
  const report = reports.find((r) => r.memberId === personne);
  const [activity, groups, directory] = await Promise.all([
    report
      ? reportActivity(ctx, report).then(({ hits }) => ({ forId: report.memberId, hits }))
      : null,
    admin ? listGroups(ctx) : [],
    admin ? directoryState(ctx, one(params.annuaire), one(params.error)) : null,
  ]);
  return (
    <Team
      members={members}
      invitations={invitations}
      reports={reports}
      activity={activity}
      seeAllAllowed={seeAllAllowed}
      admin={admin}
      groups={groups}
      directory={directory}
      workspace={membership?.organizationName ?? ''}
      personne={personne}
    />
  );
}
