import type { ReactNode } from 'react';
import { AppShell } from '@/components/verre/shell';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const profile = await getViewerProfile(ctx);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      // branché sur staleChannels(await channelHealth(ctx), new Date()) juste après (tâche 5)
      stale={[]}
    >
      {children}
    </AppShell>
  );
}
