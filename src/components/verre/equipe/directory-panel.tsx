'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import {
  applyDirectoryImportAction,
  startDirectoryImportAction,
} from '@/app/(app)/reglages/actions';
import { Button, Notice, PanelClose, PanelNote, SidePanel, toast } from '@/components/verre';
import { nb } from '@/lib/verre';
import type { DirectoryProvider, DirectoryState } from '@/server/auth/annuaire';

const PROVIDERS = { google: 'directoryGoogle', microsoft: 'directoryMicrosoft' } as const;
const ERRORS = {
  droits: 'directoryRights',
  injoignable: 'directoryUnreachable',
  adresse: 'directoryAddress',
  refus: 'directoryRefused',
} as const;

/**
 * « Importer l'organigramme », pour un propriétaire ou un administrateur : un bouton par annuaire réglé sur le serveur
 * part chez Google ou Microsoft ; au retour (/equipe?annuaire=…), le même panneau montre les rattachements à changer,
 * puis « Appliquer ». Un rattachement fait à la main dans Leon n'est jamais changé.
 */
export function DirectoryPanel({
  state,
  open,
  onOpenChange,
}: {
  state: DirectoryState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const s = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const apply = (provider: DirectoryProvider) =>
    startTransition(async () => {
      const result = await applyDirectoryImportAction(provider).catch(() => null);
      if (result && 'count' in result) {
        toast(s('directoryApplied', { count: result.count }));
        onOpenChange(false);
      } else toast.error(nb(s(ERRORS[result?.error ?? 'injoignable'])));
    });
  const plan = state.plan;
  const changes = plan?.changes ?? [];

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={s('directoryTitle')}
      busy={pending}
      foot={
        plan && state.provider && changes.length > 0 ? (
          <>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => state.provider && apply(state.provider)}
            >
              {s('directoryApply', { count: changes.length })}
            </Button>
            <PanelClose asChild>
              <Button variant="quiet">{s('directoryCancel')}</Button>
            </PanelClose>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        {state.error && <Notice tone="error">{nb(s(ERRORS[state.error]))}</Notice>}
        {plan ? (
          changes.length === 0 ? (
            <p className="text-ui text-fg-2">{nb(s('directoryNothing'))}</p>
          ) : (
            <ul className="grid gap-1.5 text-ui text-fg">
              {changes.map((change) => (
                <li key={change.memberId}>
                  {nb(
                    change.managerName
                      ? s('directoryUnder', { name: change.name, manager: change.managerName })
                      : s('directoryNone', { name: change.name }),
                  )}
                  {change.beforeName && (
                    <span className="text-muted">
                      {' '}
                      {nb(s('directoryBefore', { manager: change.beforeName }))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          state.providers.length > 0 && (
            <form action={startDirectoryImportAction} className="grid gap-2">
              {state.providers.map((provider) => (
                <Button key={provider} type="submit" name="provider" value={provider}>
                  {s(PROVIDERS[provider])}
                </Button>
              ))}
            </form>
          )
        )}
        {plan && (plan.kept > 0 || plan.outside > 0) && (
          <p className="text-label text-muted">
            {nb(
              `${s('directoryKept', { count: plan.kept })} ${s('directoryOutside', { count: plan.outside })}`.trim(),
            )}
          </p>
        )}
        <PanelNote>
          {nb(s('directoryDescription'))} {nb(s('directoryHelp'))}
        </PanelNote>
      </div>
    </SidePanel>
  );
}
