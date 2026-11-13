import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/verre/shell';
import { isAdmin } from '@/server/admin/stats';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { ONBOARDING_PATH, requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { channelHealth, staleChannels } from '@/server/memory/sources';
import { readSidebar } from '@/server/shell/shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  // L'étape 1 de l'onboarding d'abord : tant qu'elle n'est pas validée, rien d'autre ne s'affiche.
  const member = await readOnboardingMember(ctx);
  if (member && member.onboardedAt === null) redirect(ONBOARDING_PATH);
  // La barre latérale lit ici ses discussions récentes et ses outils à reconnecter : une action qui les change
  // revalide le layout (Next le garde monté d'une page à l'autre).
  const [profile, channels, side] = await Promise.all([
    getViewerProfile(ctx),
    channelHealth(ctx),
    readSidebar(ctx),
  ]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      userImage={side.image}
      // l'entrée Admin du menu : seulement pour un admin de Leon (LEON_ADMINS), comme la page /admin
      admin={isAdmin(profile.email)}
      recents={side.recents}
      reconnect={side.reconnect}
      stale={staleChannels(channels, new Date())}
    >
      {children}
    </AppShell>
  );
}
