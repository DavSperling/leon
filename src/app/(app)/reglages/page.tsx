import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  DeleteAccountSection,
  DeleteOrganizationSection,
} from '@/components/verre/reglages/delete-account';
import { IntegrationsSettings } from '@/components/verre/reglages/integrations';
import { ProfileSettings } from '@/components/verre/reglages/profile';
import { SecuritySettings } from '@/components/verre/reglages/security-settings';
import { SettingsTabs } from '@/components/verre/reglages/settings-tabs';
import { WorkspaceSettings } from '@/components/verre/reglages/workspace';
import { COMPUTER_TOKEN_PREFIX, listApiTokens } from '@/server/auth/api-tokens';
import { deletionInfo } from '@/server/auth/delete-account';
import { canInvite, getMembership, listMembers } from '@/server/auth/members';
import { managersSeeAll } from '@/server/auth/organisation';
import { getSession, requireUserContext } from '@/server/auth/session';
import { readSsoSetup } from '@/server/auth/sso';
import { ABOUT_MAX_CHARS, readAbout } from '@/server/briefing/about';
import { claudeCodeInstructions, installCommand } from '@/server/cli/install-command';
import { listDepotsEquipe } from '@/server/connectors/github/depots-equipe';
import { env } from '@/server/env';
import { RESOURCE } from '@/server/oauth/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('settings'))('title') };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ annuaire?: string | string[]; error?: string | string[] }>;
}) {
  // ?annuaire=… et ?error=… : le retour de Google ou de Microsoft après « Importer l'organigramme », qui vit
  // maintenant dans l'écran Équipe : le retour y est remis tel quel.
  const { annuaire, error } = await searchParams;
  if (one(annuaire)) {
    const query = new URLSearchParams({ annuaire: one(annuaire) as string });
    if (one(error)) query.set('error', one(error) as string);
    redirect(`/equipe?${query}`);
  }
  const t = await getTranslations('settings');
  const claude = await getTranslations('claudeCode');
  const ctx = await requireUserContext();
  const [
    allTokens,
    members,
    mayInvite,
    session,
    membership,
    about,
    deletion,
    depotsEquipe,
    sso,
    seeAll,
  ] = await Promise.all([
    listApiTokens(ctx),
    listMembers(ctx),
    canInvite(ctx),
    getSession(),
    getMembership(ctx),
    readAbout(ctx.userId),
    deletionInfo(ctx),
    listDepotsEquipe(ctx),
    readSsoSetup(ctx),
    managersSeeAll(ctx),
  ]);
  const twoFactor = Boolean(session?.user.twoFactorEnabled);
  const live = allTokens
    .filter((token) => !token.revokedAt)
    .map(({ revokedAt: _, ...token }) => token);
  // Trois listes, une par sorte de jeton : les ordinateurs connectés par `leon login` (sous leur nom sans le préfixe),
  // les assistants branchés par OAuth, et les jetons personnels (les autres).
  const tokens = live.filter((token) => token.kind === 'manuel');
  const computers = live
    .filter((token) => token.kind === 'ordinateur')
    .map((token) => ({ ...token, name: token.name.slice(COMPUTER_TOKEN_PREFIX.length) }));
  // Un assistant dont le renouvellement est échu ne se reconnectera plus : il n'est pas listé.
  const now = new Date();
  const assistants = live.filter(
    (token) => token.kind === 'assistant' && token.refreshExpiresAt && token.refreshExpiresAt > now,
  );
  const serverUrl = env.BETTER_AUTH_URL;
  const owners = members
    .filter((m) => !m.former && m.role.split(',').includes('owner'))
    .map(({ name }) => ({ name }));

  return (
    // Trois des quatre colonnes de l'application : une feuille de champs reste lisible, les cartes ont la taille de
    // celles de Connexions ; jamais moins que la largeur de trois cartes.
    <div className="max-w-[max(calc(75%-3px),876px)]">
      <SettingsTabs
        title={t('title')}
        panels={{
          profil: (
            <>
              <ProfileSettings
                name={session?.user.name ?? ''}
                email={session?.user.email ?? ''}
                image={session?.user.image}
                membership={membership}
                about={about ?? ''}
                aboutMax={ABOUT_MAX_CHARS}
              />
              <DeleteAccountSection info={deletion} twoFactor={twoFactor} />
            </>
          ),
          securite: <SecuritySettings enabled={twoFactor} />,
          integrations: (
            <IntegrationsSettings
              computers={computers}
              assistants={assistants}
              tokens={tokens}
              command={installCommand()}
              instructions={claudeCodeInstructions(claude)}
              address={RESOURCE}
              serverUrl={serverUrl}
              // La demande à coller dans Claude Code : il construit l'extension et la charge dans Chrome ; le jeton
              // reste à l'utilisateur, qui le colle lui-même.
              extensionPrompt={t('extensionPrompt', { serverUrl })}
            />
          ),
          equipe: (
            <WorkspaceSettings
              organizationName={deletion.organizationName}
              owners={owners}
              admin={mayInvite}
              sso={sso}
              managersSeeAll={seeAll}
              depots={depotsEquipe}
            >
              {deletion.isOwner && (
                <DeleteOrganizationSection info={deletion} twoFactor={twoFactor} />
              )}
            </WorkspaceSettings>
          ),
        }}
      />
    </div>
  );
}
