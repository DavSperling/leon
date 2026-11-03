'use client';

import { ArrowUpRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/verre';
import type { OAuthNotice } from '@/lib/connection-form';
import { nb, rise } from '@/lib/verre';

/** Le retour de l'éditeur (`?branche=` ou `?erreur=`, lu par oauthNotice côté serveur), en tête de Connexions et de l'étape Vos outils. */
export function ReturnNotice({
  notice,
  consentUrl,
}: {
  notice: OAuthNotice | null;
  consentUrl: string | null;
}) {
  const t = useTranslations('connections');
  return (
    // initial={false} : l'avis rendu par le serveur (retour de l'éditeur) est visible avant l'hydratation
    <AnimatePresence mode="wait" initial={false}>
      {notice && (
        <motion.div
          key={notice.text}
          variants={rise}
          initial="initial"
          animate="animate"
          exit="exit"
          className="mb-6"
        >
          <Notice tone={notice.tone} live={notice.tone === 'success' ? 'status' : 'alert'}>
            {nb(notice.text)}
            {notice.adminConsent && consentUrl && (
              <>
                {' '}
                <a
                  href={consentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-fg underline decoration-destructive-line underline-offset-4 hover:decoration-destructive"
                >
                  {t('adminConsent')}
                  <ArrowUpRight
                    aria-hidden="true"
                    strokeWidth={1.8}
                    className="ml-0.5 inline size-3.5 align-[-2px]"
                  />
                  <span className="sr-only">{t('newTab')}</span>
                </a>
              </>
            )}
          </Notice>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
