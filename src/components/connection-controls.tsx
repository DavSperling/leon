'use client';

import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  deleteConnectionAction,
  replaceKeyAction,
  setPausedAction,
  syncNowAction,
} from '@/app/(app)/connexions/actions';
import { FieldInput, FormMessage, useKeyForm, valuesOf } from '@/components/connection-fields';
import { ConnectionStatus } from '@/components/connection-status';
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
import { formatDate } from '@/lib/format';
import type { CatalogField } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

const UNREACHABLE = 'Impossible de joindre le serveur. Réessayez.';

// Une action de gestion : un message de réussite ou d'échec, jamais d'exception à l'écran.
function useManage() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean }>, done: string, failed: string) =>
    startTransition(async () => {
      try {
        const { ok } = await action();
        if (ok) toast.success(done);
        else toast.error(failed);
      } catch {
        toast.error(UNREACHABLE);
      }
    });
  return { pending, run };
}

function ReplaceKeyForm({ id, secrets }: { id: string; secrets: CatalogField[] }) {
  const idPrefix = useId();
  const { result, pending, onSubmit } = useKeyForm((data) =>
    replaceKeyAction({ id, fields: valuesOf(data, secrets) }),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-lg border bg-muted/40 p-4">
      {secrets.map((field) => (
        <FieldInput key={field.name} field={field} idPrefix={idPrefix} disabled={pending} />
      ))}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Test en cours…' : 'Tester et remplacer'}
      </Button>
      <FormMessage result={result} />
    </form>
  );
}

type DeleteProps = {
  view: ConnectionView;
  tool: string;
  pending: boolean;
  onConfirm: () => void;
};

function DeleteButton({ view, tool, pending, onConfirm }: DeleteProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          Supprimer
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer «&nbsp;{view.label}&nbsp;» ?</AlertDialogTitle>
          <AlertDialogDescription>
            Leon ne lira plus {tool} avec cette clé, qui est effacée. Les sources déjà captées
            restent dans la mémoire.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Une connexion existante : son état, ses boutons, et le remplacement de la clé. La clé n'est
// jamais réaffichée, seulement ses quatre derniers caractères.
export function ConnectionControls({
  view,
  tool,
  secrets,
  canConnect,
}: {
  view: ConnectionView;
  tool: string;
  secrets: CatalogField[];
  canConnect: boolean;
}) {
  const [replacing, setReplacing] = useState(false);
  const { pending, run } = useManage();
  const paused = view.status === 'paused';
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="space-y-1">
        <p className="font-medium break-words">{view.label}</p>
        <ConnectionStatus view={view} now={new Date()} />
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Clé ••••{view.secretHint} · branché par {view.createdBy.name} le{' '}
          {formatDate(view.createdAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || paused}
          onClick={() =>
            run(
              () => syncNowAction(view.id),
              'Synchronisation demandée : elle démarre dans la minute.',
              "Impossible : la connexion n'existe plus ou est en pause.",
            )
          }
        >
          Synchroniser maintenant
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => setPausedAction(view.id, !paused),
              paused ? 'Connexion reprise.' : 'Connexion mise en pause.',
              "Cette connexion n'existe plus.",
            )
          }
        >
          {paused ? 'Reprendre' : 'Mettre en pause'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canConnect}
          aria-expanded={replacing}
          onClick={() => setReplacing((open) => !open)}
        >
          Remplacer la clé
        </Button>
        <DeleteButton
          view={view}
          tool={tool}
          pending={pending}
          onConfirm={() =>
            run(
              () => deleteConnectionAction(view.id),
              'Connexion supprimée.',
              "Cette connexion n'existe plus.",
            )
          }
        />
      </div>
      {replacing && canConnect && <ReplaceKeyForm id={view.id} secrets={secrets} />}
    </div>
  );
}
