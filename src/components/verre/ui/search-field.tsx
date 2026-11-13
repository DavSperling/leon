'use client';

import { type ComponentProps, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { mergeRefs } from '@/lib/verre/refs';
import { Kbd } from './kbd';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Ce qu'on cherche ici (« Rechercher un outil ») : le nom accessible, et le texte du champ vide. */
  label: string;
  /** La touche « / » y met le focus (oui par défaut ; une seule recherche par écran). */
  slash?: boolean;
};

const typing = (el: Element | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Le champ qui filtre les choses d'une section : une pastille de 36 px, à droite du titre de la section. Filtrer reste à l'appelant (onChange). */
export function SearchField({
  label,
  slash = true,
  id,
  className,
  placeholder,
  ref: outerRef,
  ...props
}: SearchFieldProps) {
  const auto = useId();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!slash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // pas pendant qu'on écrit, ni sous un calque ouvert (panneau, fenêtre, palette)
      if (typing(document.activeElement) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [slash]);
  return (
    <div className={cn('relative w-[280px] max-shell:w-full', className)}>
      <label htmlFor={id ?? auto} className="sr-only">
        {label}
      </label>
      <input
        ref={mergeRefs(ref, outerRef)}
        id={id ?? auto}
        type="search"
        placeholder={placeholder ?? label}
        autoComplete="off"
        spellCheck={false}
        className="peer h-9 w-full rounded-full border border-line bg-sheet pr-10 pl-4 text-ui text-fg transition-[border-color] duration-150 placeholder:text-muted hover:border-fg-2 focus-visible:border-fg max-shell:h-11 pointer-coarse:text-[16px]"
        {...props}
      />
      {slash && (
        <Kbd className="pointer-events-none absolute top-1.5 right-[7px] peer-focus-visible:hidden peer-[:not(:placeholder-shown)]:hidden max-shell:hidden">
          /
        </Kbd>
      )}
    </div>
  );
}
