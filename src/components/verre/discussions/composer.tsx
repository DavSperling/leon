'use client';

import { ArrowUp } from 'lucide-react';
import type { FormEvent, KeyboardEvent } from 'react';
import { IconButton, Textarea } from '@/components/verre';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';

// La saisie collée en bas du fil : une nouvelle question à Leon.
export function Composer({
  value,
  setValue,
  disabled,
  busy,
  onSend,
}: {
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const empty = value.trim() === '';

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (disabled || busy || empty) return;
    onSend(value.trim());
    setValue('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Entrée envoie, Maj + Entrée passe à la ligne ; jamais pendant la composition d'un caractère accentué.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <>
      <form
        onSubmit={submit}
        className="glass-float sticky bottom-[max(12px,env(safe-area-inset-bottom))] z-20 mt-6 rounded-box border border-line-strong p-2 shadow-float transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line focus-within:shadow-[var(--float-shadow),0_0_0_3px_var(--accent-soft)]"
      >
        <label htmlFor="question-discussion" className="sr-only">
          Votre question à Leon
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="question-discussion"
            autoGrow
            rows={1}
            maxRows={8}
            maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={
              disabled ? 'Leon ne peut pas répondre sur ce serveur' : 'Posez une autre question…'
            }
            className="min-h-11 border-0 bg-transparent px-2.5 py-[9px] text-lead shadow-none hover:border-0 focus-visible:shadow-none disabled:opacity-70"
          />
          <IconButton
            type="submit"
            icon={ArrowUp}
            label={busy ? 'Leon répond…' : 'Envoyer la question'}
            variant="primary"
            size="lg"
            // pendant la réponse : flèche immobile (la carte de Leon a déjà son indicateur) ; aria-disabled garde le focus
            aria-disabled={busy || undefined}
            disabled={disabled || (!busy && empty)}
            tooltip={false}
            className="size-11 rounded-field aria-disabled:opacity-50 aria-disabled:active:scale-100 [&_svg]:size-[18px]"
          />
        </div>
        <p className="px-2.5 pt-1 pb-0.5 text-label text-muted">
          <span className="pointer-coarse:hidden">
            Entrée pour envoyer, Maj + Entrée pour passer à la ligne.{' '}
          </span>
          Leon ne lit que ce que vous avez le droit de voir.
        </p>
      </form>
      {/* l'interstice sous la saisie collée : ce qui défile dessous y est flouté */}
      <div
        aria-hidden="true"
        className="pointer-events-none sticky bottom-0 z-10 h-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl"
      />
    </>
  );
}
