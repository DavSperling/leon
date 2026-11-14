'use client';

import { useTranslations } from 'next-intl';
import { CodeLine, CopyButton } from '@/components/verre';
import { nb } from '@/lib/verre/nb';
import { INLINE, Step } from './reglages';

/**
 * Le corps du panneau « Extension navigateur » (la tuile porte l'ancre #extension, visée par Connexions pour claude.ai
 * et ChatGPT) : la demande à coller dans Claude Code, ou les trois étapes à la main, puis l'adresse du serveur. La
 * troisième étape ouvre la création d'un jeton (`onToken`).
 */
export function ExtensionSetup({
  prompt,
  serverUrl,
  onToken,
}: {
  prompt: string;
  serverUrl: string;
  onToken: () => void;
}) {
  const t = useTranslations('settings');
  return (
    <div className="grid gap-6">
      <div>
        <p className="mb-3 text-ui leading-[1.55] text-fg-2">{t('extensionDescription')}</p>
        <CopyButton value={prompt} label={t('askClaude')} />
      </div>
      <ol className="grid gap-3.5 border-t border-line pt-5">
        <Step n={1}>
          {t('step1')} <code className={INLINE}>pnpm ext:build</code>.
        </Step>
        <Step n={2}>
          {t('step2')} <code className={INLINE}>chrome://extensions</code>, {t('developerMode')}{' '}
          {nb(t('loadUnpacked'))} {t('chooseFolder')}{' '}
          <code className={INLINE}>extension/.output/chrome-mv3</code>.
        </Step>
        <Step n={3}>
          {t('step3')}{' '}
          <button
            type="button"
            onClick={onToken}
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
          >
            {t('tokenLink')}
          </button>
          .
        </Step>
      </ol>
      <div className="border-t border-line pt-5">
        <p className="mb-2.5 text-ui text-fg-2">
          {t('serverAddress')}
          <code className={INLINE}>WXT_PUBLIC_LEON_URL</code>
          {nb(t('serverAddressEnd'))}
        </p>
        <CodeLine code={serverUrl} />
      </div>
    </div>
  );
}
