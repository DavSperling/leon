'use client';

import { FolderGit2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useOptimistic, useState, useTransition } from 'react';
import { setDepotEquipeAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Notice,
  PanelNote,
  SidePanel,
  toast,
} from '@/components/verre';
import { cn } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { DepotEquipe } from '@/server/connectors/github/depots-equipe';
import { Glyph } from './reglages';

type AddState = { depot: string; error?: string };

// Un dépôt décoché que la page ne relit plus (saisi à la main, ou coché par un autre administrateur) garde sa ligne,
// décochée, à sa place dans l'ordre de la page : sa case garde le focus, et on le recoche sans le ressaisir.
export const withUnchecked = (depots: DepotEquipe[], unchecked: string[]): DepotEquipe[] =>
  [
    ...depots,
    ...unchecked
      .filter((depot) => !depots.some((d) => d.depot === depot))
      .map((depot) => ({ depot, coche: false })),
  ].sort((a, b) => (a.depot < b.depot ? -1 : 1));

/** Aucun dépôt d'équipe alors qu'un membre a branché GitHub : ce qui a été relevé est privé à qui l'a branché. */
export const depotsMissing = ({ depots, githubBranche }: DepotsProps) =>
  githubBranche && !depots.some((d) => d.coche);

type DepotsProps = { depots: DepotEquipe[]; githubBranche: boolean };

/**
 * Le panneau « Dépôts d'équipe », pour un propriétaire ou un administrateur : les dépôts lus par ses propres
 * connexions GitHub et ceux déjà cochés (lus par la page), à cocher ou décocher, et la saisie d'un autre dépôt.
 */
export function RepositoriesPanel({
  depots,
  githubBranche,
  open,
  onOpenChange,
}: DepotsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('settings');
  const id = useId();
  const [unchecked, setUnchecked] = useState<string[]>([]);
  // la case suit le clic tout de suite ; un refus la remet comme la page la relit
  const [shown, setShown] = useOptimistic(
    withUnchecked(depots, unchecked),
    (list, { depot, coche }: DepotEquipe) =>
      list.map((d) => (d.depot === depot ? { ...d, coche } : d)),
  );
  const [pending, startTransition] = useTransition();

  const toggle = (depot: string, coche: boolean) => {
    if (!coche) setUnchecked((list) => (list.includes(depot) ? list : [...list, depot]));
    startTransition(async () => {
      setShown({ depot, coche });
      try {
        const result = await setDepotEquipeAction(depot, coche);
        if ('error' in result) toast.error(result.error);
      } catch {
        toast.error(t('depotFailed'));
      }
    });
  };

  const [added, addAction, adding] = useActionState(
    async (_: AddState, data: FormData): Promise<AddState> => {
      const depot = String(data.get('depot') ?? '');
      try {
        const result = await setDepotEquipeAction(depot, true);
        if ('error' in result) return { depot, error: result.error };
        // le dépôt arrive à sa place dans la liste, parfois hors de la vue : on le dit
        toast.success(t('depotAdded'));
        return { depot: '' };
      } catch {
        return { depot, error: t('depotFailed') };
      }
    },
    { depot: '' },
  );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      picture={<Glyph icon={FolderGit2} size={44} />}
      title={t('depotsTitle')}
      foot={
        <>
          <Button type="submit" form={`${id}-add`} loading={adding} loadingLabel={t('sending')}>
            {t('depotAddSubmit')}
          </Button>
          <Button variant="secondary" className="ml-auto" onClick={() => onOpenChange(false)}>
            {t('done')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {depotsMissing({ depots, githubBranche }) && (
          <Notice tone="warning">{t('depotsNone')}</Notice>
        )}
        {shown.length > 0 ? (
          <ul
            aria-label={t('depotsList')}
            aria-busy={pending || undefined}
            className={cn(
              'grid divide-y divide-line rounded-item border border-line px-3 transition-opacity duration-300',
              pending && 'opacity-60',
            )}
          >
            {shown.map((d) => (
              <li key={d.depot} className="flex min-h-[48px] items-center py-1.5">
                <Checkbox
                  checked={d.coche}
                  onCheckedChange={(coche) => toggle(d.depot, coche)}
                  label={<span className="[overflow-wrap:anywhere] text-fg">{d.depot}</span>}
                  className="min-w-0 flex-1"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t('depotsEmpty')} />
        )}
        <form id={`${id}-add`} noValidate action={addAction}>
          <Field label={t('depotAdd')} help={t('depotHelp')} error={added.error}>
            <Input
              name="depot"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('depotPlaceholder')}
              defaultValue={added.depot}
            />
          </Field>
        </form>
        <PanelNote>{nb(t('depotsDescription'))}</PanelNote>
      </div>
    </SidePanel>
  );
}
