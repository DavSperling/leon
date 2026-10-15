'use client';

import { ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DUE_FILTERS, TASK_PRIORITIES, TASK_STATUS_CATEGORIES } from '@/lib/enums';
import { DUE_FILTER_LABELS, PRIORITY_LABELS, STATUS_CATEGORY_LABELS } from '@/lib/tasks/labels';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { FilterPatch, ListContext } from './list-context';

const ALL = 'all';

type Choice = { value: string; label: string };
type ChoiceSubProps = {
  label: string;
  value: string | null;
  choices: Choice[];
  onChange: (value: string | null) => void;
};

// Un critère à valeur unique : « Tous » le retire.
function ChoiceSub({ label, value, choices, onChange }: ChoiceSubProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
        <DropdownMenuRadioGroup
          aria-label={label}
          value={value ?? ALL}
          onValueChange={(next) => onChange(next === ALL ? null : next)}
        >
          {[{ value: ALL, label: 'Tous' }, ...choices].map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

type StatusSubProps = { selected: ViewConfig['filters']['statuses']; onChange: StatusChange };
type StatusChange = (statuses: ViewConfig['filters']['statuses']) => void;

// Les catégories se cochent ensemble : le menu reste ouvert, aucune coche veut dire « tous ».
function StatusSub({ selected, onChange }: StatusSubProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Statut</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {TASK_STATUS_CATEGORIES.map((category) => (
          <DropdownMenuCheckboxItem
            key={category}
            checked={selected.includes(category)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(
                TASK_STATUS_CATEGORIES.filter((other) =>
                  other === category ? checked === true : selected.includes(other),
                ),
              )
            }
          >
            {STATUS_CATEGORY_LABELS[category]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

type FilterMenuProps = {
  config: ViewConfig;
  context: ListContext;
  onChange: (patch: FilterPatch) => void;
};

export function FilterMenu({ config, context, onChange }: FilterMenuProps) {
  const f = config.filters;
  const named = (items: readonly { id: string; name: string }[]): Choice[] =>
    items.map(({ id, name }) => ({ value: id, label: name }));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <ListFilter size={16} strokeWidth={1.5} aria-hidden="true" />
          Filtrer
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Filtrer par</DropdownMenuLabel>
        <StatusSub selected={f.statuses} onChange={(statuses) => onChange({ statuses })} />
        <ChoiceSub
          label="Priorité"
          value={f.priority}
          choices={TASK_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
          onChange={(next) =>
            onChange({ priority: TASK_PRIORITIES.find((value) => value === next) ?? null })
          }
        />
        <ChoiceSub
          label="Assigné"
          value={f.assignee}
          choices={[
            { value: 'me', label: 'Moi' },
            { value: 'none', label: 'Sans assigné' },
            ...named(context.members),
          ]}
          onChange={(assignee) => onChange({ assignee })}
        />
        <ChoiceSub
          label="Créateur"
          value={f.creator}
          choices={[{ value: 'me', label: 'Moi' }]}
          onChange={(next) => onChange({ creator: next === 'me' ? 'me' : null })}
        />
        <ChoiceSub
          label="Étiquette"
          value={f.labelId}
          choices={named(context.labels)}
          onChange={(labelId) => onChange({ labelId })}
        />
        <ChoiceSub
          label="Projet"
          value={f.projectId}
          choices={named(context.projects)}
          onChange={(projectId) => onChange({ projectId })}
        />
        <ChoiceSub
          label="Échéance"
          value={f.due}
          choices={DUE_FILTERS.map((value) => ({ value, label: DUE_FILTER_LABELS[value] }))}
          onChange={(next) =>
            onChange({ due: DUE_FILTERS.find((value) => value === next) ?? null })
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
