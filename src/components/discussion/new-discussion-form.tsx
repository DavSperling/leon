'use client';

import { LoaderCircle, MessageSquarePlus } from 'lucide-react';
import { useActionState } from 'react';
import { type NewDiscussionState, newDiscussionAction } from '@/app/(app)/discussions/actions';
import { Button } from '@/components/ui/button';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';

// Une nouvelle discussion : une question, puis la page de la discussion, où Leon y répond tout de suite.
export function NewDiscussionForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<NewDiscussionState, FormData>(
    newDiscussionAction,
    { error: null },
  );
  return (
    <form action={action} className="rounded-xl border bg-card p-4 shadow-xs">
      <label htmlFor="nouvelle-question" className="text-[15px] font-medium">
        Nouvelle discussion
      </label>
      <textarea
        id="nouvelle-question"
        name="question"
        required
        maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
        rows={3}
        disabled={disabled || pending}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? 'nouvelle-question-erreur' : 'nouvelle-question-aide'}
        placeholder="Par exemple : qu’a-t-on décidé avec ACME sur le renouvellement du contrat ?"
        className="mt-2 field-sizing-content max-h-60 min-h-24 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {state.error ? (
          <p id="nouvelle-question-erreur" role="alert" className="text-[14px] text-destructive">
            {state.error}
          </p>
        ) : (
          <p id="nouvelle-question-aide" className="text-[14px] text-muted-foreground">
            Leon cherche, lit et répond en citant ses sources.
          </p>
        )}
        <Button
          type="submit"
          disabled={disabled || pending}
          className="h-10 gap-2 rounded-lg px-4 text-[15px]"
        >
          {pending ? (
            <LoaderCircle size={16} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
          ) : (
            <MessageSquarePlus size={16} strokeWidth={1.5} aria-hidden="true" />
          )}
          Demander à Leon
        </Button>
      </div>
    </form>
  );
}
