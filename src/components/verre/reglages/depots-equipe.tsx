'use client';

import { FolderGit2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useOptimistic, useState, useTransition } from 'react';
import { setDepotEquipeAction } from '@/app/(app)/reglages/actions';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  GlassCard,
  Input,
  Notice,
  Section,
  toast,
} from '@/components/verre';
import { cn } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { DepotEquipe } from '@/server/connectors/github/depots-equipe';
import { SECTION } from './reglages';

const ROW =
  'relative flex min-h-[52px] items-center rounded-field px-3 py-2 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line';

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

/**
 * Section « Dépôts d'équipe », pour un propriétaire ou un administrateur : les dépôts lus par ses propres connexions
 * GitHub et ceux déjà cochés (lus par la page), à cocher ou décocher, et la saisie d'un autre dépôt. Le bandeau
 * « aucun dépôt » ne paraît que si un membre de l'équipe a branché GitHub (`githubBranche`).
 */
export function DepotsEquipeSection({
  depots,
  githubBranche,
}: {
  depots: DepotEquipe[];
  githubBranche: boolean;
}) {
  const t = useTranslations('settings');
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
        // le dépôt arrive à sa place dans la liste, parfois hors de l'écran : on le dit
        toast.success(t('depotAdded'));
        return { depot: '' };
      } catch {
        return { depot, error: t('depotFailed') };
      }
    },
    { depot: '' },
  );

  return (
    <Section
      id="depots-equipe"
      title={t('depotsTitle')}
      description={nb(t('depotsDescription'))}
      className={SECTION}
    >
      <div className="grid gap-4">
        {githubBranche && !depots.some((d) => d.coche) && (
          <Notice tone="warning">{t('depotsNone')}</Notice>
        )}
        {shown.length > 0 ? (
          <GlassCard className="p-1.5">
            <ul
              aria-label={t('depotsList')}
              aria-busy={pending || undefined}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)] transition-opacity duration-300',
                pending && 'opacity-60',
              )}
            >
              {shown.map((d) => (
                <li key={d.depot} className={ROW}>
                  <Checkbox
                    checked={d.coche}
                    onCheckedChange={(coche) => toggle(d.depot, coche)}
                    label={<span className="[overflow-wrap:anywhere] text-fg">{d.depot}</span>}
                    className="min-w-0 flex-1"
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : (
          <EmptyState icon={FolderGit2} title={t('depotsEmpty')} className="py-8" />
        )}
        <form noValidate action={addAction} className="mt-2 grid max-w-md gap-4">
          <Field label={t('depotAdd')} help={t('depotHelp')} error={added.error}>
            <Input
              name="depot"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('depotPlaceholder')}
              defaultValue={added.depot}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={adding} className="w-fit">
            {adding ? t('sending') : t('depotAddSubmit')}
          </Button>
        </form>
      </div>
    </Section>
  );
}
