'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useTransition } from 'react';
import {
  applyDirectoryImportAction,
  startDirectoryImportAction,
} from '@/app/(app)/reglages/actions';
import { Button, GlassCard, Notice, Section, toast } from '@/components/verre';
import { nb } from '@/lib/verre';
import type { DirectoryProvider, DirectoryState } from '@/server/auth/annuaire';
import { SECTION } from './reglages';

const PROVIDERS = { google: 'directoryGoogle', microsoft: 'directoryMicrosoft' } as const;
const ERRORS = {
  droits: 'directoryRights',
  injoignable: 'directoryUnreachable',
  adresse: 'directoryAddress',
  refus: 'directoryRefused',
} as const;

/**
 * « Importer l'organigramme », pour un propriétaire ou un administrateur : un bouton par annuaire réglé sur le serveur
 * part chez Google ou Microsoft ; au retour (/reglages?annuaire=…), l'aperçu des rattachements à changer, puis
 * « Appliquer ».
 */
export function DirectorySection({ state }: { state: DirectoryState }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLElement>(null);
  const shown = Boolean(state.plan || state.error);
  // Au retour, l'onglet Équipe s'ouvre en haut : l'aperçu est plus bas, sous la liste des membres.
  useEffect(() => {
    if (shown) root.current?.scrollIntoView({ block: 'start' });
  }, [shown]);

  const close = () => router.replace('/reglages#equipe');
  const apply = (provider: DirectoryProvider) =>
    startTransition(async () => {
      const result = await applyDirectoryImportAction(provider).catch(() => null);
      if (result && 'count' in result) {
        toast.success(t('directoryApplied', { count: result.count }));
        close();
      } else {
        toast.error(nb(t(ERRORS[result?.error ?? 'injoignable'])));
      }
    });

  return (
    <Section
      ref={root}
      id="organigramme"
      title={t('directoryTitle')}
      description={t('directoryDescription')}
      className={SECTION}
    >
      <GlassCard className="grid gap-4 p-4">
        <p className="text-label text-muted">{nb(t('directoryHelp'))}</p>
        <form action={startDirectoryImportAction} className="flex flex-wrap gap-2.5">
          {state.providers.map((provider) => (
            <Button key={provider} type="submit" name="provider" value={provider}>
              {t(PROVIDERS[provider])}
            </Button>
          ))}
        </form>
        {state.error && <Notice tone="error">{nb(t(ERRORS[state.error]))}</Notice>}
        {state.plan && state.provider && (
          <div className="grid gap-3">
            {state.plan.changes.length === 0 ? (
              <p className="text-body text-fg-2">{nb(t('directoryNothing'))}</p>
            ) : (
              <ul className="grid gap-1.5 text-body text-fg">
                {state.plan.changes.map((change) => (
                  <li key={change.memberId}>
                    {nb(
                      change.managerName
                        ? t('directoryUnder', { name: change.name, manager: change.managerName })
                        : t('directoryNone', { name: change.name }),
                    )}
                    {change.beforeName && (
                      <span className="text-muted">
                        {' '}
                        {nb(t('directoryBefore', { manager: change.beforeName }))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(state.plan.kept > 0 || state.plan.outside > 0) && (
              <p className="text-label text-muted">
                {nb(
                  `${t('directoryKept', { count: state.plan.kept })} ${t('directoryOutside', { count: state.plan.outside })}`.trim(),
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              {state.plan.changes.length > 0 && (
                <Button
                  variant="primary"
                  loading={pending}
                  onClick={() => state.provider && apply(state.provider)}
                >
                  {t('directoryApply', { count: state.plan.changes.length })}
                </Button>
              )}
              <Button variant="ghost" disabled={pending} onClick={close}>
                {t('directoryCancel')}
              </Button>
            </div>
          </div>
        )}
      </GlassCard>
    </Section>
  );
}
