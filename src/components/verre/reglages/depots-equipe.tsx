'use client';

import { FolderGit2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useOptimistic, useTransition } from 'react';
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
import { nb } from '@/lib/verre/nb';
import type { DepotEquipe } from '@/server/connectors/github/depots-equipe';
import { SECTION } from './reglages';

const ROW =
  'relative flex min-h-[52px] items-center rounded-field px-3 py-2 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line';

type AddState = { depot: string; error?: string };

/**
 * Section « Dépôts d'équipe », pour un propriétaire ou un administrateur : les dépôts lus par ses propres connexions
 * GitHub et ceux déjà cochés (lus par la page), à cocher ou décocher, et la saisie d'un autre dépôt.
 */
export function DepotsEquipeSection({ depots }: { depots: DepotEquipe[] }) {
  const t = useTranslations('settings');
  // la case suit le clic tout de suite ; un refus la remet comme la page la relit
  const [shown, setShown] = useOptimistic(depots, (list, { depot, coche }: DepotEquipe) =>
    list.map((d) => (d.depot === depot ? { ...d, coche } : d)),
  );
  const [, startTransition] = useTransition();

  const toggle = (depot: string, coche: boolean) =>
    startTransition(async () => {
      setShown({ depot, coche });
      try {
        const result = await setDepotEquipeAction(depot, coche);
        if ('error' in result) toast.error(result.error);
      } catch {
        toast.error(t('depotFailed'));
      }
    });

  const [added, addAction, adding] = useActionState(
    async (_: AddState, data: FormData): Promise<AddState> => {
      const depot = String(data.get('depot') ?? '');
      try {
        const result = await setDepotEquipeAction(depot, true);
        return 'error' in result ? { depot, error: result.error } : { depot: '' };
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
        {!depots.some((d) => d.coche) && <Notice tone="warning">{t('depotsNone')}</Notice>}
        {shown.length > 0 ? (
          <GlassCard className="p-1.5">
            <ul aria-label={t('depotsList')} className="grid grid-cols-[minmax(0,1fr)]">
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
          <Field label={t('depotAdd')} error={added.error}>
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
