'use client';

import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState } from 'react';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import { Thing, ThingGrid, toneOf } from '@/components/verre';
import { cn, nb } from '@/lib/verre';

// « Essayez de demander » : trois questions en tuiles. Un clic ouvre la discussion et Leon y répond tout de suite
// (comme le champ : une discussion gardée, une réponse du modèle). Toutes les tuiles se figent pendant l'envoi : un
// double clic ne crée pas deux discussions.
// Le trait qui passe sous la question pointée : rose, vert, bleu, dans l'ordre des trois traits du champ.
const STROKES = ['before:bg-m1', 'before:bg-m2', 'before:bg-m3'] as const;
// Devant chaque question, un des trois traits du champ, à sa longueur : la liste est signée comme lui.
const BULLETS = [
  'w-[22px] bg-[var(--stroke-1)]',
  'w-[14px] bg-[var(--stroke-2)]',
  'w-[18px] bg-[var(--stroke-3)]',
] as const;

export function AskTiles({
  questions,
  stacked,
}: {
  questions: string[];
  /** Sous le champ d'une nouvelle discussion : l'une sous l'autre, dans la colonne du fil. */
  stacked?: boolean;
}) {
  const t = useTranslations('discussions');
  const [state, action, pending] = useActionState<NewDiscussionState, FormData>(
    newDiscussionAction,
    { error: null },
  );
  const ask = (question: string) => {
    if (pending) return;
    const data = new FormData();
    data.set('question', question);
    startTransition(() => action(data));
  };
  return (
    <div aria-busy={pending || undefined}>
      {stacked ? (
        // sous le champ : des lignes posées sur le bureau, pas trois champs de plus ; le surligneur passe sous la
        // question qu'on pointe, dans les trois couleurs des traits du champ
        <ul className="border-t border-line">
          {questions.map((question, i) => (
            <li key={question} className="border-b border-line">
              <button
                type="button"
                onClick={() => ask(question)}
                disabled={pending}
                className="group/ask flex min-h-12 w-full items-center gap-4 py-2.5 text-left text-lead text-fg transition-opacity duration-150 disabled:opacity-60"
              >
                <span aria-hidden="true" className="flex w-[22px] shrink-0 -rotate-[5deg]">
                  <i
                    className={cn(
                      'h-[5px] origin-left rounded-[2px] transition-transform duration-[220ms] ease-out group-hover/ask:scale-x-[1.25] group-focus-visible/ask:scale-x-[1.25]',
                      BULLETS[i % 3],
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span
                    className={cn(
                      'relative z-0 before:absolute before:-inset-x-1 before:inset-y-0 before:-z-10 before:origin-left before:scale-x-0 before:rounded-mark before:transition-transform before:duration-[220ms] before:ease-out group-hover/ask:before:scale-x-100 group-focus-visible/ask:before:scale-x-100',
                      STROKES[i % 3],
                    )}
                  >
                    {nb(question)}
                  </span>
                </span>
                <ArrowUp
                  aria-hidden="true"
                  strokeWidth={1.8}
                  className="size-4 shrink-0 rotate-45 text-fg opacity-0 transition-[opacity,translate] duration-150 group-hover/ask:translate-x-0.5 group-hover/ask:-translate-y-0.5 group-hover/ask:opacity-100 group-focus-visible/ask:opacity-100 max-shell:hidden"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ThingGrid cols={3}>
          {questions.map((question, i) => (
            <Thing
              key={question}
              onClick={() => ask(question)}
              disabled={pending}
              wrap
              chevron={false}
              // les trois traits du champ où l'on demande : rose, vert, bleu, sous la question qu'on pointe
              hl={toneOf((i % 3) + 1)}
              name={nb(question)}
            />
          ))}
        </ThingGrid>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {nb(state.error)}
        </p>
      )}
      {pending && (
        <p role="status" className="sr-only">
          {t('busy')}
        </p>
      )}
    </div>
  );
}
