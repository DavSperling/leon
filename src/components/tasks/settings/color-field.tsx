'use client';

import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLOR_NAMES, COLOR_PALETTE, colorName } from '@/lib/tasks/palette';
import { cn } from '@/lib/utils';

type ColorFieldProps = {
  label: string; // « Couleur du statut Backlog »
  value: string;
  onChange: (color: string) => void;
  children: ReactNode; // l'aperçu de la couleur : l'icône du statut, le point de l'étiquette
};

// Le déclencheur montre la couleur posée ; le menu propose la palette, chaque pastille nommée.
export function ColorField({ label, value, onChange, children }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${label} : ${colorName(value)}`}>
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        <fieldset className="grid min-w-0 grid-cols-6 gap-1">
          <legend className="sr-only">{label}</legend>
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={COLOR_NAMES[color]}
              aria-pressed={color === value}
              onClick={() => {
                setOpen(false);
                if (color !== value) onChange(color);
              }}
              className="flex size-7 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-4 rounded-full',
                  color === value && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
                )}
                style={{ backgroundColor: color }}
              />
            </button>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
