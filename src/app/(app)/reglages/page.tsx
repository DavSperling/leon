import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { API_PATHS } from '@/capture/api-contract';
import { CodeLine, CopyButton, PageHeader, Section } from '@/components/verre';
import { LanguageSettings } from '@/components/verre/reglages/language';
import { MembersSection } from '@/components/verre/reglages/members';
import { CommandBlock, INLINE, SECTION, Step } from '@/components/verre/reglages/reglages';
import { ProfileSettings, SecuritySettings } from '@/components/verre/reglages/security-settings';
import { SettingsTabs } from '@/components/verre/reglages/settings-tabs';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { nb } from '@/lib/verre/nb';
import { listApiTokens } from '@/server/auth/api-tokens';
import { canInvite, listMembers } from '@/server/auth/members';
import { getSession, requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('settings'))('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const s = await getTranslations('security');
  const ctx = await requireUserContext();
  const [allTokens, members, mayInvite, session] = await Promise.all([
    listApiTokens(ctx),
    listMembers(ctx),
    canInvite(ctx),
    getSession(),
  ]);
  const tokens = allTokens
    .filter((token) => !token.revokedAt)
    .map(({ revokedAt: _, ...token }) => token);
  const serverUrl = env.BETTER_AUTH_URL;
  const mcpUrl = new URL(API_PATHS.mcp, serverUrl).toString();
  // La demande à coller dans Claude Code : il construit l'extension et la charge dans Chrome ; le jeton reste à
  // l'utilisateur, qui le colle lui-même.
  const extensionPrompt = t('extensionPrompt', { serverUrl });
  const placeholder = `<${t('tokenPlaceholder')}>`;
  const command = `claude mcp add --transport http leon ${mcpUrl} --header "Authorization: Bearer ${placeholder}"`;

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
                />
              </Section>
              <LanguageSettings />
            </>
          ),
          securite: (
            <Section title={s('title')} description={s('description')} className={SECTION}>
              <SecuritySettings enabled={Boolean(session?.user.twoFactorEnabled)} />
            </Section>
          ),
          equipe: <MembersSection members={members} canInvite={mayInvite} />,
          integrations: (
            <>
              <TokensSection tokens={tokens} />

              <Section
                id="claude-code"
                title={t('claudeTitle')}
                description={t('claudeDescription')}
                className={SECTION}
              >
                <CommandBlock command={command} placeholder={placeholder} />
              </Section>

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
