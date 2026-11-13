'use client';

import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/verre';
import type { OAuthNotice } from '@/lib/connection-form';
import { cn, nb } from '@/lib/verre';

/** Le retour de l'éditeur (`?branche=` ou `?erreur=`, lu par oauthNotice côté serveur) : sous le titre de Connexions
 *  quand il ne nomme aucun outil (sinon il est dit dans le panneau de l'outil), et en tête de l'étape Vos outils.
 *  Rendu par le serveur : lisible avant l'hydratation, et sans JavaScript. */
export function ReturnNotice({
  notice,
  consentUrl,
  className,
}: {
  notice: OAuthNotice | null;
  consentUrl: string | null;
  className?: string;
}) {
  const t = useTranslations('connections');
  if (!notice) return null;
  return (
    <Notice
      tone={notice.tone}
      live={notice.tone === 'success' ? 'status' : 'alert'}
      className={cn('mb-6', className)}
    >
      {nb(notice.text)}
      {notice.adminConsent && consentUrl && (
        <>
          {' '}
          <a
            href={consentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
          >
            {t('adminConsent')}
            <ArrowUpRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
            <span className="sr-only">{t('newTab')}</span>
          </a>
        </>
      )}
    </Notice>
  );
}
