'use client';

import { ArrowRight, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { SEARCH_INPUT_ID, searchHref } from '@/components/search/url-state';
import { Beam, IconButton, useThinking } from '@/components/verre';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { cn, useMinWidth } from '@/lib/verre';

/** Le champ qui a le focus attend une saisie : « / » ne doit pas l'interrompre. */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    el.getAttribute('role') === 'combobox');

/**
 * Barre de recherche : un formulaire ordinaire (`/?q=…`) ; sans JavaScript, il marche encore. Avec, la recherche se fait
 * sans recharger la page, et le faisceau tourne autour tant que Leon travaille (recherche, puis réponse). « / » y ramène
 * le curseur depuis n'importe où dans la page.
 */
export function SearchBar({ query, home }: { query: string; home: boolean }) {
  const router = useRouter();
  const t = useTranslations('search');
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  const { thinking, setThinking } = useThinking();
  const roomy = useMinWidth(form, 480); // barre étroite : un indicatif court, jamais coupé au milieu d'un mot

  // L'adresse change sans que la barre soit remontée (puce de filtre, « précédent ») : la saisie suit.
  useEffect(() => setValue(query), [query]);
  useEffect(() => setThinking(pending), [pending, setThinking]);

  // Accueil : le curseur est déjà dans la barre (après la transition de page, qui met d'abord le focus sur <main>).
  useEffect(() => {
    if (!home) return;
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }));
    return () => clearTimeout(t);
  }, [home]);

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
      <Beam active={pending || thinking} className="rounded-box">
        <form
          ref={form}
          action="/"
          onSubmit={submit}
          className={cn(
            'relative flex items-center gap-3 rounded-box border border-line-strong bg-glass-2 pr-2 pl-[18px] shadow-hi transition-[border-color,box-shadow] duration-300',
            'h-[60px] focus-within:border-accent-line focus-within:shadow-[inset_0_1px_0_var(--hi),0_0_0_3px_var(--accent-soft)] max-sm:gap-2 max-sm:pl-3.5',
          )}
        >
          <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
            {t('searchEverything')}
          </label>
          <Search
            aria-hidden="true"
            strokeWidth={1.6}
            className="size-[18px] shrink-0 text-muted"
          />
          <input
            ref={input}
            id={SEARCH_INPUT_ID}
            name="q"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={QUERY_MAX_CHARS}
            placeholder={roomy ? `${t('searchEverything')}…` : t('placeholder')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-keyshortcuts="/"
            aria-busy={pending || undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.015em] text-ellipsis text-fg outline-none placeholder:font-normal focus-visible:outline-none max-sm:text-[15px]"
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
              className="pop-in text-muted"
            />
          )}
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center gap-2.5 rounded-full bg-accent px-4 text-ui font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.3)] transition-[filter,scale] duration-200 ease-out hover:brightness-[1.06] active:scale-[.96] max-sm:w-10 max-sm:justify-center max-sm:p-0"
          >
            <span className="max-sm:sr-only">{t('submit')}</span>
            <ArrowRight aria-hidden="true" strokeWidth={2} className="size-4 sm:hidden" />
          </button>
        </form>
      </Beam>
    </search>
  );
}
