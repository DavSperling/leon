import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { CommandSearch } from '@/components/command-search';
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
      search={<CommandSearch />}
    >
      {children}
    </AppShell>
  );
}
