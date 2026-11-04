import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CodeLine, CopyButton, PageHeader, Section } from '@/components/verre';
import { AboutSettings } from '@/components/verre/reglages/about';
import { AssistantsSection } from '@/components/verre/reglages/assistants';
import { ComputersSection } from '@/components/verre/reglages/computers';
import {
  DeleteAccountSection,
  DeleteOrganizationSection,
} from '@/components/verre/reglages/delete-account';
import { DepotsEquipeSection } from '@/components/verre/reglages/depots-equipe';
import { MembersSection } from '@/components/verre/reglages/members';
import { PreferencesSettings } from '@/components/verre/reglages/preferences';
import { INLINE, SECTION, Step } from '@/components/verre/reglages/reglages';
import {
  PasswordSettings,
  ProfileSettings,
  SecuritySettings,
} from '@/components/verre/reglages/security-settings';
import { SettingsTabs } from '@/components/verre/reglages/settings-tabs';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { nb } from '@/lib/verre/nb';
import { COMPUTER_TOKEN_PREFIX, listApiTokens } from '@/server/auth/api-tokens';
import { deletionInfo } from '@/server/auth/delete-account';
import { canInvite, getMembership, listMembers } from '@/server/auth/members';
import { getSession, requireUserContext } from '@/server/auth/session';
import { ABOUT_MAX_CHARS, readAbout } from '@/server/briefing/about';
import { claudeCodeInstructions, installCommand } from '@/server/cli/install-command';
import { listDepotsEquipe } from '@/server/connectors/github/depots-equipe';
import { env } from '@/server/env';
import { RESOURCE } from '@/server/oauth/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('settings'))('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const s = await getTranslations('security');
  const claude = await getTranslations('claudeCode');
  const ctx = await requireUserContext();
  const [allTokens, members, mayInvite, session, membership, about, deletion, depotsEquipe] =
    await Promise.all([
      listApiTokens(ctx),
      listMembers(ctx),
      canInvite(ctx),
      getSession(),
      getMembership(ctx),
      readAbout(ctx.userId),
      deletionInfo(ctx),
      listDepotsEquipe(ctx),
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
  const assistants = live.filter((token) => token.kind === 'assistant');
  const serverUrl = env.BETTER_AUTH_URL;
  // La demande à coller dans Claude Code : il construit l'extension et la charge dans Chrome ; le jeton reste à
  // l'utilisateur, qui le colle lui-même.
  const extensionPrompt = t('extensionPrompt', { serverUrl });

  return (
    // 1008 px : la colonne des onglets (200), son écart (48) et le contenu (760, comme les autres pages)
    <div className="mx-auto max-w-[1008px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} className="mb-10" />

      <SettingsTabs
        panels={{
          profil: (
            <>
              <Section
                title={s('profileTitle')}
                description={s('profileDescription')}
                className={SECTION}
              >
                <ProfileSettings
                  name={session?.user.name ?? ''}
                  email={session?.user.email ?? ''}
                  membership={membership}
                />
              </Section>
              <AboutSettings about={about ?? ''} max={ABOUT_MAX_CHARS} />
              <PreferencesSettings />
              <DeleteAccountSection info={deletion} twoFactor={twoFactor} />
            </>
          ),
          securite: (
            <Section title={s('title')} description={s('description')} className={SECTION}>
              <div className="grid gap-12">
                <PasswordSettings />
                <SecuritySettings enabled={twoFactor} />
              </div>
            </Section>
          ),
          equipe: (
            <>
              <MembersSection members={members} canInvite={mayInvite} />
              {mayInvite && <DepotsEquipeSection {...depotsEquipe} />}
              {deletion.isOwner && (
                <DeleteOrganizationSection info={deletion} twoFactor={twoFactor} />
              )}
            </>
          ),
          integrations: (
            <>
              <ComputersSection
                computers={computers}
                command={installCommand()}
                instructions={claudeCodeInstructions(claude)}
              />

              <TokensSection tokens={tokens} />

              <AssistantsSection address={RESOURCE} assistants={assistants} />

              <Section
                id="extension"
                title={t('extensionTitle')}
                description={t('extensionDescription')}
                actions={<CopyButton value={extensionPrompt} label={t('askClaude')} />}
                className={SECTION}
              >
                <ol className="grid gap-3.5">
                  <Step n={1}>
                    {t('step1')} <code className={INLINE}>pnpm ext:build</code>.
                  </Step>
                  <Step n={2}>
                    {t('step2')} <code className={INLINE}>chrome://extensions</code>,{' '}
                    {t('developerMode')} {nb(t('loadUnpacked'))} {t('chooseFolder')}{' '}
                    <code className={INLINE}>extension/.output/chrome-mv3</code>.
                  </Step>
                  <Step n={3}>
                    {t('step3')}{' '}
                    <a
                      href="#jetons"
                      className="text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent"
                    >
                      {t('tokenCreatedAbove')}
                    </a>
                    .
                  </Step>
                </ol>
                <p className="mt-6 mb-2.5 text-body text-fg-2">
                  {t('serverAddress')}
                  <code className={INLINE}>WXT_PUBLIC_LEON_URL</code>
                  {nb(t('serverAddressEnd'))}
                </p>
                <CodeLine code={serverUrl} />
              </Section>
            </>
          ),
        }}
      />
    </div>
  );
}
