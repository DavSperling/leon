import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { CommandSearch } from '@/components/command-search';
import { TreeView } from '@/components/tree-view';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { buildBriefing } from '@/server/memory/briefing';
import { listCardTree } from '@/server/memory/tree';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const [profile, briefing, tree] = await Promise.all([
    getViewerProfile(ctx),
    buildBriefing(ctx),
    listCardTree(ctx),
  ]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      reviewCount={briefing.reviewCount}
      search={<CommandSearch />}
      tree={<TreeView tree={tree} />}
    >
      {children}
    </AppShell>
  );
}
