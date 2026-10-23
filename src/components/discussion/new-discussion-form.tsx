'use client';

import { ArrowUp } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import { GlassCard, IconButton, Textarea, useThinking } from '@/components/verre';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';
import { cn, formatNumber, nb } from '@/lib/verre';

// Une nouvelle discussion : une question, puis la page de la discussion, où Leon y répond tout de suite.
export function NewDiscussionForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<NewDiscussionState, FormData>(
    newDiscussionAction,
    { error: null },
  );
  const [question, setQuestion] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const { setThinking } = useThinking();
  useEffect(() => setThinking(pending), [pending, setThinking]);
  const count = question.length;

  return (
    <GlassCard
      variant="raised"
      signal
      className="p-2 transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line"
    >
      <form ref={form} action={action}>
        <label htmlFor="nouvelle-question" className="sr-only">
          Nouvelle discussion : votre question à Leon
        </label>
        <Textarea
          id="nouvelle-question"
          name="question"
          rows={2}
          autoGrow
          maxRows={10}
          maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
          required
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Entrée envoie, Maj + Entrée passe à la ligne, comme dans le fil d'une discussion.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          disabled={disabled}
          // et non disabled : le focus reste dans le champ pendant l'envoi
          readOnly={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="nouvelle-question-note"
          placeholder={nb('Comment Leon peut-il vous aider ?')}
          className="border-0 bg-transparent px-2.5 py-2 text-lead shadow-none hover:border-0 focus-visible:shadow-none disabled:opacity-70"
        />
        <div className="flex items-center justify-end gap-3 px-1">
          {state.error ? (
            <p
              id="nouvelle-question-note"
              role="alert"
              className="mr-auto px-1.5 text-ui text-destructive"
            >
              {nb(state.error)}
            </p>
          ) : (
            // le sous-titre de la page le dit déjà : lu, pas affiché
            <p id="nouvelle-question-note" className="sr-only">
              Leon cherche, lit et répond en citant ses sources.
            </p>
          )}
          {count >= DISCUSSION_MESSAGE_MAX_CHARS * 0.9 && (
            <span
              className={cn(
                'font-mono text-meta tracking-normal',
                count >= DISCUSSION_MESSAGE_MAX_CHARS ? 'text-destructive' : 'text-muted',
              )}
            >
              {formatNumber(count)} / {formatNumber(DISCUSSION_MESSAGE_MAX_CHARS)}
            </span>
          )}
          <IconButton
            type="submit"
            icon={ArrowUp}
            label={pending ? 'Leon répond…' : 'Demander à Leon'}
            variant="primary"
            size="lg"
            aria-disabled={pending || undefined}
            disabled={disabled || (!pending && question.trim() === '')}
            tooltip={false}
            className="size-10 rounded-field aria-disabled:opacity-50 [&_svg]:size-[18px]"
          />
        </div>
      </form>
    </GlassCard>
  );
}
