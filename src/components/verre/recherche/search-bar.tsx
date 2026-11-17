'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { SEARCH_INPUT_ID, searchHref } from '@/components/search/url-state';
import { Button, IconButton, Strokes } from '@/components/verre';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { useMinWidth } from '@/lib/verre';

/** Le champ qui a le focus attend une saisie : « / » ne doit pas l'interrompre. */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    el.getAttribute('role') === 'combobox');

/**
 * Le champ de la page des résultats (la seule place où chercher sur cet écran : la barre du haut n'y est pas). C'est la
 * même barre, à la même place, signée des mêmes trois traits : elle garde les mots qu'on vient d'y écrire. Un
 * formulaire ordinaire (`/?q=…`) ; sans JavaScript, il marche encore. Avec, la recherche se fait sans recharger la page.
 * « / » y ramène le curseur depuis n'importe où dans la page.
 */
export function SearchBar({ query }: { query: string }) {
  const router = useRouter();
  const t = useTranslations('search');
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  const roomy = useMinWidth(form, 480); // barre étroite : un indicatif court, jamais coupé au milieu d'un mot

  // L'adresse change sans que la barre soit remontée (puce de filtre, « précédent ») : la saisie suit.
  useEffect(() => setValue(query), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (typing(e.target) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(() => router.push(searchHref({ q: value })));
  };

  return (
    <search aria-label={t('memoryLabel')}>
      <form
        ref={form}
        action="/"
        onSubmit={submit}
        className="group flex h-[52px] items-center gap-3.5 rounded-card border border-line bg-sheet pr-2 pl-[18px] shadow-sheet transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-lift focus-within:border-fg-2 focus-within:shadow-lift max-shell:h-12 max-sm:gap-2.5 max-sm:pl-3.5"
      >
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          {t('searchEverything')}
        </label>
        <Strokes />
        <input
          ref={input}
          id={SEARCH_INPUT_ID}
          // le champ de l'écran : ⌘K y vient (app-shell.tsx)
          data-ask=""
          name="q"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={QUERY_MAX_CHARS}
          placeholder={roomy ? `${t('searchEverything')}…` : t('placeholder')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-keyshortcuts="/ Meta+K Control+K"
          aria-busy={pending || undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-lead text-ellipsis text-fg outline-none placeholder:text-muted focus-visible:outline-none max-shell:text-base"
        />
        {value !== '' && (
          <IconButton
            icon={X}
            label={t('clear')}
            size="sm"
            tooltip={false}
            onClick={() => {
              setValue('');
              input.current?.focus();
            }}
            className="text-icon"
          />
        )}
        <Button type="submit" variant="quiet" size="sm" className="shrink-0">
          {t('submit')}
        </Button>
      </form>
    </search>
  );
}
