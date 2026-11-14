'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import { ToolLogo } from '@/components/verre';
import { ComposerBox, sendsOnEnter } from '@/components/verre/discussions/composer';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn, formatNumber, nb } from '@/lib/verre';

// Une nouvelle discussion : une question dans le grand champ, puis la page de la discussion, où Leon y répond tout de
// suite. Ce qui refuse la question se dit sous le champ.
export function NewDiscussionForm({
  disabled,
  reads = [],
}: {
  disabled: boolean;
  /** Les outils que Leon lit pour cette personne : leurs logos signent le champ, à côté des trois traits. */
  reads?: ProviderId[];
}) {
  const locale = useLocale();
  const t = useTranslations('discussions');
  const [state, action, pending] = useActionState<NewDiscussionState, FormData>(
    newDiscussionAction,
    { error: null },
  );
  const [question, setQuestion] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const count = question.length;

  return (
    <form ref={form} action={action}>
      <ComposerBox
        big
        id="nouvelle-question"
        name="question"
        label={t('newQuestionLabel')}
        required
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          // Entrée envoie, Maj + Entrée passe à la ligne, comme dans le fil d'une discussion.
          if (sendsOnEnter(event)) {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
        disabled={disabled}
        // et non disabled : le focus reste dans le champ pendant l'envoi
        readOnly={pending}
        busy={pending}
        empty={question.trim() === ''}
        aria-invalid={state.error ? true : undefined}
        aria-describedby="nouvelle-question-note"
        // le titre de la page pose déjà la question : le champ dit ce qu'on y écrit
        placeholder={nb(disabled ? t('disabledPlaceholder') : t('composerLabel'))}
        tools={
          !disabled &&
          reads.length > 0 && (
            // d'où viendra la réponse : les outils branchés, en image ; un clic mène à Connexions
            <Link
              href="/connexions"
              aria-label={nb(
                t('reads', {
                  tools: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
                    reads.map((kind) => PROVIDER_LABELS[kind]),
                  ),
                }),
              )}
              className="group/reads -my-1 flex items-center gap-2 rounded-item border-l border-line py-1 pr-1.5 pl-3.5 transition-colors duration-150 hover:bg-hover"
            >
              {reads.map((kind) => (
                <span key={kind} title={PROVIDER_LABELS[kind]} className="flex">
                  <ToolLogo kind={kind} size={18} />
                </span>
              ))}
            </Link>
          )
        }
        aside={
          count >= DISCUSSION_MESSAGE_MAX_CHARS * 0.9 && (
            <span
              className={cn(
                'mb-2 shrink-0 text-label tabular-nums',
                count >= DISCUSSION_MESSAGE_MAX_CHARS ? 'text-destructive' : 'text-muted',
              )}
            >
              {formatNumber(count, locale)} / {formatNumber(DISCUSSION_MESSAGE_MAX_CHARS, locale)}
            </span>
          )
        }
      />
      {state.error ? (
        <p
          id="nouvelle-question-note"
          role="alert"
          className="mt-2 ml-[18px] text-ui text-destructive"
        >
          {nb(state.error)}
        </p>
      ) : (
        <p id="nouvelle-question-note" className="sr-only">
          {t('srDescription')}
        </p>
      )}
    </form>
  );
}
