'use client';

import { LoaderCircle, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { SEARCH_INPUT_ID, searchHref } from './url-state';

// La barre de recherche. Un formulaire ordinaire (`/?q=…`) : sans JavaScript, il marche encore ; avec, la
// recherche se fait sans recharger la page, et la barre dit qu'elle travaille.
export function SearchBar({
  initialQuery,
  autoFocus,
}: {
  initialQuery: string;
  // Page d'accueil sans requête : le curseur est déjà dans la barre.
  autoFocus: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  // L'adresse change sans que la barre soit remontée (une puce de filtre, le bouton « précédent ») : la saisie suit.
  useEffect(() => setValue(initialQuery), [initialQuery]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => router.push(searchHref({ q: value })));
  }

  return (
    <search aria-label="Recherche dans la mémoire de l’équipe">
      <form action="/" onSubmit={submit} className="relative">
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          Rechercher dans tout ce que Leon a gardé
        </label>
        {pending ? (
          <LoaderCircle
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : (
          <Search
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <input
          ref={input}
          id={SEARCH_INPUT_ID}
          name="q"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={QUERY_MAX_CHARS}
          placeholder="Rechercher dans tout ce que Leon a gardé…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-busy={pending}
          className="h-12 w-full rounded-lg border border-input bg-card pr-40 pl-11 text-[16px] transition-[border-color] outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-foreground/10"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
          {value !== '' && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => {
                setValue('');
                input.current?.focus();
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
          <Button type="submit" className="h-9 shrink-0 rounded-md px-4 text-[14px]">
            Rechercher
          </Button>
        </div>
      </form>
    </search>
  );
}
