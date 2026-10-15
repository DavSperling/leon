'use client';

import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { deleteStatusAction } from '@/app/(taches)/taches/reglages/actions';
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
import { Label } from '@/components/ui/label';
import type { StatusRow } from '@/server/tasks/statuses';
import { NativeSelect } from './native-select';
import { succeeded } from './succeeded';

const ONLY_ONE_MESSAGE = 'Chaque catégorie garde au moins un statut.';

type DeleteStatusProps = {
  status: StatusRow;
  others: StatusRow[]; // les autres statuts du projet : l'un d'eux reçoit les tâches
  onlyOne: boolean; // seul de sa catégorie
};

// Les tâches du statut supprimé passent au statut de repli, par défaut un statut de la même catégorie.
export function DeleteStatus({ status, others, onlyOne }: DeleteStatusProps) {
  const selectId = useId();
  const [target, setTarget] = useState('');
  const fallback = others.find((other) => other.category === status.category) ?? others[0];
  const chosen = others.some((other) => other.id === target) ? target : (fallback?.id ?? '');
  return (
    <AlertDialog>
      {/* Un bouton désactivé n'affiche pas d'infobulle : elle est sur son enveloppe. */}
      <span title={onlyOne ? ONLY_ONE_MESSAGE : undefined}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Supprimer le statut ${status.label}`}
            disabled={onlyOne || chosen === ''}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </AlertDialogTrigger>
      </span>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le statut « {status.label} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les tâches qui l’ont passent au statut choisi ci-dessous. Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={selectId}>Déplacer les tâches vers</Label>
          <NativeSelect
            id={selectId}
            value={chosen}
            onChange={(event) => setTarget(event.target.value)}
            className="w-full"
          >
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void succeeded(deleteStatusAction(status.id, chosen))}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
