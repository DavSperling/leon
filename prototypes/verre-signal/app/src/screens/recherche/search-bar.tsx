import { ArrowRight, Search, X } from 'lucide-react';
import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { Beam, IconButton } from '@/components';
import { cn, useMinWidth } from '@/lib';

export const SEARCH_INPUT_ID = 'barre-de-recherche';
const MAX = 300;

/** Le champ qui a le focus attend une saisie : « / » ne doit pas l'interrompre. */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute('role') === 'combobox');

/**
 * Barre de recherche : un formulaire ordinaire (`/?q=…`), de même hauteur sur l'accueil et au-dessus des résultats (elle
 * glisse de l'un à l'autre) ; le faisceau tourne autour pendant que Leon travaille. « / » y ramène le curseur depuis n'importe où dans la page.
 */
export function SearchBar({ query, large, searching, working, onSubmit, inputRef }: {
  query: string;
  /** accueil : le curseur y est d'emblée */
  large: boolean;
  /** la recherche elle-même (aria-busy ; l'icône reste immobile, le faisceau et le statut de la réponse suffisent) */
  searching: boolean;
  /** Leon cherche, lit ou rédige (faisceau) */
  working: boolean;
  onSubmit: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState(query);
  const form = useRef<HTMLFormElement>(null);
  const roomy = useMinWidth(form, 480); // barre étroite : un indicatif court, jamais coupé au milieu d'un mot

  // L'adresse change sans que la barre soit remontée (puce de filtre, « précédent ») : la saisie suit.
  useEffect(() => setValue(query), [query]);

  // Accueil : le curseur est déjà dans la barre (après la transition de page, qui met d'abord le focus sur <main>).
  useEffect(() => {
    if (!large) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }));
    return () => clearTimeout(t);
  }, [large, inputRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return; // palette ou feuille ouverte : le raccourci est à elles
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputRef]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <search aria-label="Recherche dans la mémoire de l’équipe">
      <Beam active={working} className="rounded-box">
        <form
          ref={form}
          action="/"
          onSubmit={submit}
          className={cn(
            'relative flex items-center gap-3 rounded-box border border-line-strong bg-glass-2 pr-2 pl-[18px] shadow-hi transition-[border-color,box-shadow] duration-300',
            'h-[60px] focus-within:border-accent-line focus-within:shadow-[inset_0_1px_0_var(--hi),0_0_0_3px_var(--accent-soft)] max-sm:gap-2 max-sm:pl-3.5',
          )}
        >
          <label htmlFor={SEARCH_INPUT_ID} className="sr-only">Rechercher dans tout ce que Leon a gardé</label>
          <Search aria-hidden="true" strokeWidth={1.6} className="size-[18px] shrink-0 text-muted" />
          <input
            ref={inputRef}
            id={SEARCH_INPUT_ID}
            name="q"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MAX}
            placeholder={roomy ? 'Rechercher dans tout ce que Leon a gardé…' : 'Rechercher…'}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-keyshortcuts="/"
            aria-busy={searching || undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.015em] text-ellipsis text-fg outline-none placeholder:font-normal focus-visible:outline-none max-sm:text-[15px]"
          />
          {value !== '' && (
            <IconButton
              icon={X}
              label="Effacer la recherche"
              size="sm"
              tooltip={false}
              onClick={() => (setValue(''), inputRef.current?.focus())}
              className="pop-in text-muted"
            />
          )}
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center gap-2.5 rounded-full bg-accent px-4 text-ui font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.3)] transition-[filter,scale] duration-200 ease-out hover:brightness-[1.06] active:scale-[.96] max-sm:w-10 max-sm:justify-center max-sm:p-0"
          >
            <span className="max-sm:sr-only">Rechercher</span>
            <ArrowRight aria-hidden="true" strokeWidth={2} className="size-4 sm:hidden" />
          </button>
        </form>
      </Beam>
    </search>
  );
}
