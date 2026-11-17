'use client';

import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps, FormEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import { Strokes, Textarea } from '@/components/verre';
import { DISCUSSION_MESSAGE_MAX_CHARS } from '@/lib/discussion-events';
import { cn } from '@/lib/verre';

// Le champ où l'on demande à Leon : la seule place pour demander sur l'écran d'une discussion. Une feuille signée des
// trois traits, le champ qui grandit avec le texte, et « Demander », un rond d'encre dès qu'il y a une question. Entrée envoie, Maj + Entrée passe à
// la ligne, jamais pendant la composition d'un caractère accentué.

/** Entrée envoie (sauf Maj + Entrée, et pendant une composition IME). */
export const sendsOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing;

type ComposerBoxProps = Omit<ComponentProps<'textarea'>, 'ref'> & {
  id: string;
  label: string;
  /** Une nouvelle discussion : le grand champ sous le titre. Sinon, le champ collé au pied du fil. */
  big?: boolean;
  /** Leon répond : le bouton le dit et ne fait rien (aria-disabled garde le focus). */
  busy?: boolean;
  /** Rien à envoyer : le bouton est désactivé. */
  empty?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** À gauche du bouton : le compteur, près de la limite. */
  aside?: ReactNode;
  /** Le grand champ seulement, après les trois traits : les logos des outils que Leon lit. */
  tools?: ReactNode;
};

export function ComposerBox({
  id,
  label,
  big,
  busy,
  empty,
  disabled,
  textareaRef,
  aside,
  tools,
  className,
  ...field
}: ComposerBoxProps) {
  const t = useTranslations('discussions');
  // les trois traits signent le champ où l'on demande à Leon, et lui seul ; ils se retracent quand on le pointe
  const strokes = (
    <Strokes className={cn('transition-opacity duration-150', !big && 'mb-2 max-shell:mb-3')} />
  );
  // un rond et sa flèche : un contour discret tant que le champ est vide, d'encre dès qu'il y a une question
  const send = (
    <button
      type="submit"
      aria-label={busy ? t('busy') : t('ask')}
      title={t('ask')}
      aria-disabled={busy || undefined}
      disabled={disabled || (!busy && empty)}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-transparent bg-ink text-on-ink transition-[background-color,border-color,color,scale] duration-150 hover:bg-accent-hover active:scale-95 disabled:border-line-strong disabled:bg-transparent disabled:text-muted disabled:active:scale-100 aria-disabled:opacity-60 max-shell:size-11"
    >
      <ArrowUp aria-hidden="true" strokeWidth={1.8} className="size-[18px]" />
    </button>
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: toute la feuille mène au champ, qui porte seul le rôle et le focus
    <div
      // un clic sur la feuille, à côté des mots, met le curseur dans le champ
      onMouseDown={(event) => {
        if (disabled || (event.target as HTMLElement).closest('textarea, button, a')) return;
        event.preventDefault();
        event.currentTarget.querySelector('textarea')?.focus();
      }}
      className={cn(
        'group flex cursor-text rounded-card border border-line bg-sheet shadow-lift transition-[border-color] duration-150 hover:border-line-strong focus-within:border-fg-2 has-[textarea:focus]:hover:border-fg-2',
        big ? 'min-h-[136px] flex-col gap-1 px-5 pt-4 pb-3' : 'items-end gap-3.5 py-2 pr-2 pl-4',
        disabled && 'cursor-default [&_.strokes]:opacity-40',
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {!big && strokes}
      <Textarea
        ref={textareaRef}
        id={id}
        // le champ de l'écran : ⌘K y vient (app-shell.tsx)
        data-ask=""
        aria-keyshortcuts="Meta+K Control+K"
        rows={big ? 2 : 1}
        autoGrow
        maxRows={big ? 10 : 8}
        maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
        disabled={disabled}
        className={cn(
          // le focus se lit sur la feuille entière (son bord s'encre) : pas de second cadre autour des mots
          'min-h-9 flex-1 rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none outline-none hover:border-0 focus-visible:shadow-none focus-visible:ring-0 focus-visible:outline-none disabled:opacity-70',
          big
            ? 'min-h-[60px] text-answer leading-7 max-shell:text-[17px]'
            : 'self-stretch text-lead leading-6 max-shell:text-base',
        )}
        {...field}
      />
      {big ? (
        <div className="flex items-end gap-3">
          <span className="mr-auto flex h-9 items-center gap-3.5">
            {strokes}
            {tools}
          </span>
          {aside}
          {send}
        </div>
      ) : (
        <>
          {aside}
          {send}
        </>
      )}
    </div>
  );
}

/**
 * Le champ au pied d'une discussion, collé en bas : ce qui s'y dit (un refus, une réponse qui n'a pas pu venir) est
 * posé dessous, dans le même bloc collé, pour rester toujours visible.
 */
export function Composer({
  value,
  setValue,
  disabled,
  busy,
  onSend,
  below,
}: {
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
  busy: boolean;
  onSend: (message: string) => void;
  below?: ReactNode;
}) {
  const t = useTranslations('discussions');
  const empty = value.trim() === '';

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (disabled || busy || empty) return;
    onSend(value.trim());
    setValue('');
  }

  return (
    <div className="fil-foot sticky bottom-0 z-10 mt-auto bg-desk pt-5 pb-[max(20px,env(safe-area-inset-bottom))] max-shell:pb-[max(12px,env(safe-area-inset-bottom))]">
      <form onSubmit={submit}>
        <ComposerBox
          id="question-discussion"
          label={t('composerLabel')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (sendsOnEnter(event)) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          busy={busy}
          empty={empty}
          placeholder={disabled ? t('disabledPlaceholder') : t('newQuestionPlaceholder')}
        />
      </form>
      {below && <div className="mt-2.5">{below}</div>}
    </div>
  );
}
