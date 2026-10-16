'use client';

import { type FormEvent, useId, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VIEW_NAME_MAX_CHARS } from '@/lib/tasks/limits';

type Outcome = { ok: true } | { ok: false; error: string };

type ViewNameDialogProps = {
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  asksScope?: boolean; // personnelle ou d'équipe ; sinon la vue est d'équipe d'avance ou existe déjà
  onSubmit: (input: { name: string; team: boolean }) => Promise<Outcome>;
  onClose: () => void;
};

type ScopeFieldProps = { team: boolean; onChange: (team: boolean) => void };

function ScopeField({ team, onChange }: ScopeFieldProps) {
  const name = useId();
  const choices = [
    { team: false, label: 'Personnelle', hint: 'Visible de vous seul.' },
    { team: true, label: 'D’équipe', hint: 'Visible de toute l’organisation.' },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Portée</legend>
      {choices.map((choice) => (
        <label key={choice.label} className="flex min-h-6 items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            checked={team === choice.team}
            onChange={() => onChange(choice.team)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            {choice.label}
            <span className="block text-xs text-muted-foreground">{choice.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// Un nom, et au besoin la portée de la vue. Le contenu est démonté à la fermeture : chaque
// ouverture repart de zéro. Une erreur du serveur s'affiche dans le dialogue, qui reste ouvert.
export function ViewNameDialog({
  title,
  description,
  submitLabel,
  initialName = '',
  asksScope = false,
  onSubmit,
  onClose,
}: ViewNameDialogProps) {
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [team, setTeam] = useState(!asksScope);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await onSubmit({ name: name.trim(), team });
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>Nom de la vue</Label>
            <Input
              id={inputId}
              value={name}
              maxLength={VIEW_NAME_MAX_CHARS}
              autoComplete="off"
              aria-invalid={error !== null}
              onChange={(event) => setName(event.target.value)}
              className="bg-card"
            />
          </div>
          {asksScope && <ScopeField team={team} onChange={setTeam} />}
          {error && (
            <p role="alert" className="text-[13px] leading-[18px] text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={pending || name.trim() === ''}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
