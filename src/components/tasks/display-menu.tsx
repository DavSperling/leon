'use client';

import { Columns3, List, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  VIEW_GROUPINGS,
  VIEW_LAYOUTS,
  VIEW_ORDERINGS,
  VIEW_PROPERTIES,
  type ViewGrouping,
  type ViewLayout,
  type ViewOrdering,
  type ViewProperty,
} from '@/lib/enums';
import {
  VIEW_GROUPING_LABELS,
  VIEW_LAYOUT_LABELS,
  VIEW_ORDERING_LABELS,
  VIEW_PROPERTY_LABELS,
} from '@/lib/tasks/labels';
import { sameConfig, type ViewConfig } from '@/lib/tasks/view-config';
import { cn } from '@/lib/utils';

const LAYOUT_ICONS = { list: List, board: Columns3 } as const satisfies Record<ViewLayout, unknown>;

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm text-foreground-2">
        {label}
      </label>
      {children}
    </div>
  );
}

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
};

// Un `select` natif : liste courte, clavier et lecteurs d'écran pris en charge sans rien ajouter.
function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.target.value);
          if (next) onChange(next);
        }}
        className="h-8 w-40 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </Row>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}

function LayoutChoice({
  value,
  onChange,
}: {
  value: ViewLayout;
  onChange: (v: ViewLayout) => void;
}) {
  return (
    <fieldset className="grid min-w-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      <legend className="sr-only">Disposition</legend>
      {VIEW_LAYOUTS.map((layout) => {
        const Icon = LAYOUT_ICONS[layout];
        return (
          <button
            key={layout}
            type="button"
            aria-pressed={value === layout}
            onClick={() => onChange(layout)}
            className={cn(
              'flex h-7 items-center justify-center gap-1.5 rounded-md text-sm text-foreground-2 transition-colors hover:text-foreground',
              value === layout && 'bg-card font-medium text-foreground shadow-xs',
            )}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            {VIEW_LAYOUT_LABELS[layout]}
          </button>
        );
      })}
    </fieldset>
  );
}

type PropertyPillsProps = {
  selected: ViewProperty[];
  onChange: (properties: ViewProperty[]) => void;
};

// Les propriétés restent rangées dans l'ordre de VIEW_PROPERTIES, comme l'URL les écrit.
function PropertyPills({ selected, onChange }: PropertyPillsProps) {
  return (
    <ul aria-label="Propriétés affichées" className="flex flex-wrap gap-1.5">
      {VIEW_PROPERTIES.map((property) => {
        const on = selected.includes(property);
        return (
          <li key={property}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  VIEW_PROPERTIES.filter((p) => (p === property ? !on : selected.includes(p))),
                )
              }
              className={cn(
                'h-6 rounded-full border px-2.5 text-xs transition-colors',
                on
                  ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {VIEW_PROPERTY_LABELS[property]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type DisplayMenuProps = {
  config: ViewConfig;
  base: ViewConfig;
  isTeamDefault: boolean; // l'affichage actuel est déjà celui que l'équipe voit par défaut
  onChange: (patch: Partial<ViewConfig>) => void;
  onSetTeamDefault: () => void;
};

export function DisplayMenu({
  config,
  base,
  isTeamDefault,
  onChange,
  onSetTeamDefault,
}: DisplayMenuProps) {
  const [open, setOpen] = useState(false);
  // « Réinitialiser » ramène l'affichage à celui de la base ; les filtres restent.
  const modified = !sameConfig({ ...config, filters: base.filters }, base);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
          Affichage
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="space-y-2 p-3">
          <LayoutChoice value={config.layout} onChange={(layout) => onChange({ layout })} />
          <SelectField<ViewGrouping>
            label="Regrouper par"
            value={config.groupBy}
            options={VIEW_GROUPINGS}
            labels={VIEW_GROUPING_LABELS}
            onChange={(groupBy) => onChange({ groupBy })}
          />
          <SelectField<ViewOrdering>
            label="Trier par"
            value={config.orderBy}
            options={VIEW_ORDERINGS}
            labels={VIEW_ORDERING_LABELS}
            onChange={(orderBy) => onChange({ orderBy })}
          />
        </div>
        <div className="space-y-1 border-t p-3">
          <SwitchField
            label="Sous-tâches"
            checked={config.showSubtasks}
            onChange={(showSubtasks) => onChange({ showSubtasks })}
          />
          <SwitchField
            label="Groupes vides"
            checked={config.showEmptyGroups}
            onChange={(showEmptyGroups) => onChange({ showEmptyGroups })}
          />
        </div>
        <div className="space-y-2 border-t p-3">
          <p className="text-xs font-medium text-muted-foreground">Propriétés</p>
          <PropertyPills
            selected={config.properties}
            onChange={(properties) => onChange({ properties })}
          />
        </div>
        <div className="flex flex-col items-start border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!modified}
            onClick={() => onChange({ ...base, filters: config.filters })}
          >
            Réinitialiser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isTeamDefault}
            onClick={() => {
              setOpen(false);
              onSetTeamDefault();
            }}
          >
            {isTeamDefault ? 'Défaut de l’équipe' : 'Définir par défaut pour l’équipe'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
