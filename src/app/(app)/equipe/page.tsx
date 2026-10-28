import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Team } from '@/components/verre/equipe';
import { listReports, reportActivity } from '@/server/auth/organisation';
import { requireUserContext } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('team'))('title') };
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ personne?: string | string[] }>;
}) {
  const ctx = await requireUserContext();
  const reports = await listReports(ctx);
  const { personne } = await searchParams;
  const selected = reports.find((report) => report.memberId === personne) ?? reports[0] ?? null;
  const activity = selected ? await reportActivity(ctx, selected) : null;
  return <Team reports={reports} selected={selected} activity={activity} />;
}
