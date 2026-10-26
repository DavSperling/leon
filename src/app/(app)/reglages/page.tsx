import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { API_PATHS } from '@/capture/api-contract';
import { CodeLine, CopyButton, PageHeader, Section } from '@/components/verre';
import { LanguageSettings } from '@/components/verre/reglages/language';
import { MembersSection } from '@/components/verre/reglages/members';
import { CommandBlock, INLINE, SECTION, Step } from '@/components/verre/reglages/reglages';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { nb } from '@/lib/verre/nb';
import { listApiTokens } from '@/server/auth/api-tokens';
import { canInvite, listMembers } from '@/server/auth/members';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('settings'))('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const ctx = await requireUserContext();
  const [allTokens, members, mayInvite] = await Promise.all([
    listApiTokens(ctx),
    listMembers(ctx),
    canInvite(ctx),
  ]);
  const tokens = allTokens
    .filter((token) => !token.revokedAt)
    .map(({ revokedAt: _, ...token }) => token);
  const serverUrl = env.BETTER_AUTH_URL;
  const mcpUrl = new URL(API_PATHS.mcp, serverUrl).toString();
  // La demande à coller dans Claude Code : il construit l'extension et la charge dans Chrome ; le jeton reste à
  // l'utilisateur, qui le colle lui-même.
  const extensionPrompt = t('extensionPrompt', { serverUrl });
  const command = `claude mcp add --transport http leon ${mcpUrl} --header "Authorization: Bearer <votre jeton>"`;

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} className="mb-10" />

      <MembersSection members={members} canInvite={mayInvite} />

      <TokensSection tokens={tokens} />

      <LanguageSettings />

      <Section
        id="claude-code"
        title={t('claudeTitle')}
        description={t('claudeDescription')}
        className={SECTION}
      >
        <CommandBlock command={command} />
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
            {t('step2')} <code className={INLINE}>chrome://extensions</code>, {t('developerMode')}{' '}
            {nb(`“${t('loadUnpacked')}”`)} {t('chooseFolder')}{' '}
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
          {t('serverAddressEnd')}
        </p>
        <CodeLine code={serverUrl} />
      </Section>
    </div>
  );
}
