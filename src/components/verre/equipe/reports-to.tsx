'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useId, useState } from 'react';
import { Avatar, Popover, PopoverContent, PopoverTrigger } from '@/components/verre';
import { cn } from '@/lib/verre';

type Option = { id: string; name: string };

/**
 * « Rattaché à » : un choix qui se cherche (une équipe de 200 personnes ne tient pas dans une liste), « Personne »
 * d'abord. Le serveur garde ses refus (une boucle, le manager d'un propriétaire) : l'appelant les affiche.
 */
export function ReportsTo({
  value,
  people,
  onChange,
  disabled,
  busy,
  invalid,
  label,
  describedBy,
}: {
  value: string | null;
  /** Ceux qu'on peut choisir : membres présents, sans la personne elle-même. */
  people: Option[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** Le choix part : le bouton garde le focus mais ne s'ouvre plus. */
  busy?: boolean;
  invalid?: boolean;
  /** Nom accessible du bouton : « Rattaché à ». */
  label: string;
  describedBy?: string;
}) {
  const t = useTranslations('team');
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const current = people.find((p) => p.id === value) ?? null;
  const words = q.trim().toLocaleLowerCase();
  const options: (Option | null)[] = [
    ...(words ? [] : [null]),
    ...people.filter((p) => p.name.toLocaleLowerCase().includes(words)),
  ];
  const pick = (option: Option | null) => {
    setOpen(false);
    if ((option?.id ?? null) !== value) onChange(option?.id ?? null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option !== undefined) pick(option);
    }
  };
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && busy) return;
        setOpen(next);
        setQ('');
        setActive(0);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="flex h-10 w-full items-center gap-2.5 rounded-field border border-line-strong bg-sheet pr-2.5 pl-3 text-left text-body text-fg transition-[border-color] duration-150 hover:border-fg-2 aria-expanded:border-fg aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60 aria-busy:opacity-60 max-shell:h-11"
        >
          {current ? (
            <>
              <Avatar name={current.name} size={24} />
              <span className="min-w-0 flex-1 truncate">{current.name}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted">{t('nobody')}</span>
          )}
          <ChevronsUpDown aria-hidden="true" strokeWidth={1.6} className="size-4 text-icon" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-2">
        <input
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
          aria-label={t('searchPerson')}
          placeholder={t('searchPerson')}
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          className="mb-1.5 h-9 w-full rounded-field border border-line bg-sheet px-3 text-ui text-fg placeholder:text-muted focus-visible:border-fg pointer-coarse:text-[16px]"
        />
        <div id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
          {options.length === 0 && <p className="px-2.5 py-2 text-ui text-muted">{t('noMatch')}</p>}
          {options.map((option, i) => {
            const selected = (option?.id ?? null) === value;
            return (
              <button
                key={option?.id ?? 'personne'}
                id={optionId(i)}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(option)}
                className={cn(
                  'flex min-h-9 w-full items-center gap-2.5 rounded-item px-2.5 text-left text-ui text-fg',
                  i === active && 'bg-hover',
                  selected && 'font-medium',
                )}
              >
                {option ? (
                  <>
                    <Avatar name={option.name} size={24} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted">{t('nobody')}</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
