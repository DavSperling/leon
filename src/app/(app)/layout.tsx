import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/verre/shell';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { ONBOARDING_PATH, requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { channelHealth, staleChannels } from '@/server/memory/sources';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  // L'étape 1 de l'onboarding d'abord : tant qu'elle n'est pas validée, rien d'autre ne s'affiche.
  const member = await readOnboardingMember(ctx);
  if (member && member.onboardedAt === null) redirect(ONBOARDING_PATH);
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
