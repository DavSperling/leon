import type { ReactNode } from 'react';
import { AppShell } from '@/components/verre/shell';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { channelHealth, staleChannels } from '@/server/memory/sources';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const [profile, channels] = await Promise.all([getViewerProfile(ctx), channelHealth(ctx)]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      stale={staleChannels(channels, new Date())}
    >
      {children}
    </AppShell>
  );
}
