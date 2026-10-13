import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { buildBriefing } from '@/server/memory/briefing';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const [profile, briefing] = await Promise.all([getViewerProfile(ctx), buildBriefing(ctx)]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      reviewCount={briefing.reviewCount}
    >
      {children}
    </AppShell>
  );
}
