'use client';

import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState, useTransition } from 'react';
import { createLabelAction } from '@/app/(taches)/taches/actions';
import { deleteLabelAction, updateLabelAction } from '@/app/(taches)/taches/reglages/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LABEL_NAME_MAX_CHARS } from '@/lib/tasks/limits';
import { nextColor } from '@/lib/tasks/palette';
import type { LabelRow } from '@/server/tasks/labels';
import { LabelDot } from '../label-chip';
import { ColorField } from './color-field';
import { CommitInput } from './commit-input';
import { SettingSection } from './setting-section';
import { succeeded } from './succeeded';

function DeleteLabel({ label }: { label: LabelRow }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Supprimer l’étiquette ${label.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer l’étiquette « {label.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Elle est retirée de toutes les tâches qui la portent. Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void succeeded(deleteLabelAction(label.id))}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LabelLine({ label }: { label: LabelRow }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <ColorField
        label={`Couleur de l’étiquette ${label.name}`}
        value={label.color}
        onChange={(color) => void succeeded(updateLabelAction(label.id, { color }))}
      >
        <LabelDot color={label.color} className="size-3" />
      </ColorField>
      <CommitInput
        aria-label={`Nom de l’étiquette ${label.name}`}
        value={label.name}
        maxLength={LABEL_NAME_MAX_CHARS}
        autoComplete="off"
        onCommit={(name) => succeeded(updateLabelAction(label.id, { name }))}
        className="min-w-0 flex-1"
      />
      <DeleteLabel label={label} />
    </li>
  );
}

// La couleur est la première de la palette que aucune étiquette n'utilise ; elle se change ensuite.
function NewLabel({ labels }: { labels: LabelRow[] }) {
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const color = nextColor(labels.map((label) => label.color));
      const created = await succeeded(createLabelAction({ name, color }));
      if (created) setName('');
    });
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2">
      <Input
        aria-label="Nom de la nouvelle étiquette"
        value={name}
        placeholder="Nouvelle étiquette"
        maxLength={LABEL_NAME_MAX_CHARS}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        className="h-8 min-w-0 flex-1"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending || name.trim() === ''}>
        <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        Ajouter
      </Button>
    </form>
  );
}

export function LabelSettings({ labels }: { labels: LabelRow[] }) {
  return (
    <SettingSection
      id="etiquettes"
      title="Étiquettes"
      description="Communes à tous les projets de l’organisation."
    >
      {labels.length > 0 && (
        <ul className="divide-y">
          {labels.map((label) => (
            <LabelLine key={label.id} label={label} />
          ))}
        </ul>
      )}
      <NewLabel labels={labels} />
    </SettingSection>
  );
}
