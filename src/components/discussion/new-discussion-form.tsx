'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import { Button, Field, GlassCard, Textarea, useThinking } from '@/components/verre';
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
    <GlassCard variant="raised" signal className="p-4 sm:p-5">
      <form ref={form} action={action}>
        <Field
          label={<span className="text-body text-fg">Nouvelle discussion</span>}
          aside={
            count >= DISCUSSION_MESSAGE_MAX_CHARS * 0.9 && (
              <span
                className={cn(
                  'font-mono text-meta tracking-normal',
                  count >= DISCUSSION_MESSAGE_MAX_CHARS ? 'text-destructive' : 'text-muted',
                )}
              >
                {formatNumber(count)} / {formatNumber(DISCUSSION_MESSAGE_MAX_CHARS)}
              </span>
            )
          }
        >
          <Textarea
            name="question"
            rows={3}
            autoGrow
            maxRows={10}
            maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
                form.current?.requestSubmit();
            }}
            disabled={disabled}
            // et non disabled : le focus reste dans le champ pendant l'envoi
            readOnly={pending}
            aria-invalid={state.error ? true : undefined}
            aria-describedby="nouvelle-question-note"
            placeholder={nb(
              'Par exemple : qu’a-t-on décidé avec ACME sur le renouvellement du contrat ?',
            )}
            className="min-h-[92px] text-lead"
          />
        </Field>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {state.error ? (
            <p id="nouvelle-question-note" role="alert" className="text-ui text-destructive">
              {nb(state.error)}
            </p>
          ) : (
            // le sous-titre de la page le dit déjà : lu, pas affiché
            <p id="nouvelle-question-note" className="sr-only">
              Leon cherche, lit et répond en citant ses sources.
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon={MessageSquarePlus}
            loading={pending}
            disabled={disabled}
            className="ml-auto max-sm:w-full"
          >
            Demander à Leon
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}
