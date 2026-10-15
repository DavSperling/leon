'use client';

import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { type FormEvent, useState, useTransition } from 'react';
import {
  createStatusAction,
  moveStatusAction,
  updateStatusAction,
} from '@/app/(taches)/taches/reglages/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TASK_STATUS_CATEGORIES, type TaskStatusCategory } from '@/lib/enums';
import { STATUS_CATEGORY_LABELS } from '@/lib/tasks/labels';
import { STATUS_LABEL_MAX_CHARS } from '@/lib/tasks/limits';
import { nextColor } from '@/lib/tasks/palette';
import type { ProjectRow } from '@/server/tasks/projects';
import type { StatusRow } from '@/server/tasks/statuses';
import { StatusIcon } from '../status-icon';
import { ViewTabs } from '../view-tabs';
import { ColorField } from './color-field';
import { CommitInput } from './commit-input';
import { DeleteStatus } from './delete-status';
import { NativeSelect } from './native-select';
import { SettingSection } from './setting-section';
import { succeeded } from './succeeded';

type CategorySelectProps = {
  label: string;
  value: TaskStatusCategory;
  onChange: (category: TaskStatusCategory) => void;
  className?: string;
};

function CategorySelect({ label, value, onChange, className }: CategorySelectProps) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = TASK_STATUS_CATEGORIES.find((category) => category === event.target.value);
        if (next) onChange(next);
      }}
      className={className}
    >
      {TASK_STATUS_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {STATUS_CATEGORY_LABELS[category]}
        </option>
      ))}
    </NativeSelect>
  );
}

type StatusLineProps = {
  status: StatusRow;
  others: StatusRow[]; // les autres statuts du projet, rangés comme la liste
  first: boolean; // premier de sa catégorie
  last: boolean;
  onlyOne: boolean; // seul de sa catégorie : le serveur le protège
};

// Les changements se font un à un : les boutons attendent la réponse du serveur.
function StatusLine({ status, others, first, last, onlyOne }: StatusLineProps) {
  const [pending, startTransition] = useTransition();
  const update = (patch: Parameters<typeof updateStatusAction>[1]) =>
    startTransition(async () => void (await succeeded(updateStatusAction(status.id, patch))));
  const move = (direction: 'up' | 'down') =>
    startTransition(async () => void (await succeeded(moveStatusAction(status.id, direction))));
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <ColorField
        label={`Couleur du statut ${status.label}`}
        value={status.color}
        onChange={(color) => update({ color })}
      >
        <StatusIcon category={status.category} color={status.color} />
      </ColorField>
      <CommitInput
        aria-label={`Libellé du statut ${status.label}`}
        value={status.label}
        maxLength={STATUS_LABEL_MAX_CHARS}
        autoComplete="off"
        onCommit={(label) => succeeded(updateStatusAction(status.id, { label }))}
        className="min-w-40 flex-1"
      />
      <CategorySelect
        label={`Catégorie du statut ${status.label}`}
        value={status.category}
        onChange={(category) => update({ category })}
        className="w-32"
      />
      <div className="flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Monter le statut ${status.label}`}
          disabled={first || pending}
          onClick={() => move('up')}
        >
          <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Descendre le statut ${status.label}`}
          disabled={last || pending}
          onClick={() => move('down')}
        >
          <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
        <DeleteStatus status={status} others={others} onlyOne={onlyOne} />
      </div>
    </li>
  );
}

// Un statut s'ajoute à la fin de sa catégorie, avec la première couleur de la palette qu'aucun statut n'a.
function NewStatus({ projectId, statuses }: { projectId: string; statuses: StatusRow[] }) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<TaskStatusCategory>('started');
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const color = nextColor(statuses.map((status) => status.color));
      const created = await succeeded(createStatusAction({ projectId, label, color, category }));
      if (created) setLabel('');
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input
        aria-label="Libellé du nouveau statut"
        value={label}
        placeholder="Nouveau statut"
        maxLength={STATUS_LABEL_MAX_CHARS}
        autoComplete="off"
        onChange={(event) => setLabel(event.target.value)}
        className="h-8 min-w-40 flex-1"
      />
      <CategorySelect
        label="Catégorie du nouveau statut"
        value={category}
        onChange={setCategory}
        className="w-32"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending || label.trim() === ''}>
        <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        Ajouter
      </Button>
    </form>
  );
}

function CategoryGroup({
  category,
  statuses,
}: {
  category: TaskStatusCategory;
  statuses: StatusRow[];
}) {
  const group = statuses.filter((status) => status.category === category);
  if (group.length === 0) return null;
  return (
    <div>
      <h3 className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {STATUS_CATEGORY_LABELS[category]}
      </h3>
      <ul className="divide-y">
        {group.map((status, index) => (
          <StatusLine
            key={status.id}
            status={status}
            others={statuses.filter((other) => other.id !== status.id)}
            first={index === 0}
            last={index === group.length - 1}
            onlyOne={group.length === 1}
          />
        ))}
      </ul>
    </div>
  );
}

type StatusSettingsProps = {
  projects: ProjectRow[];
  projectId: string; // le projet dont on règle les statuts
  statuses: StatusRow[]; // ceux de ce projet, rangés par catégorie puis par position
};

export function StatusSettings({ projects, projectId, statuses }: StatusSettingsProps) {
  const tabs = projects.map((project) => ({
    key: project.id,
    label: project.name,
    href: `/taches/reglages?projet=${project.id}`,
    current: project.id === projectId,
  }));
  return (
    <SettingSection
      id="statuts"
      title="Statuts"
      description="Chaque statut appartient à une catégorie : les filtres portent sur la catégorie, renommer un statut ne casse rien."
      aside={projects.length > 1 ? <ViewTabs label="Projet des statuts" tabs={tabs} /> : null}
    >
      {TASK_STATUS_CATEGORIES.map((category) => (
        <CategoryGroup key={category} category={category} statuses={statuses} />
      ))}
      <NewStatus projectId={projectId} statuses={statuses} />
    </SettingSection>
  );
}
