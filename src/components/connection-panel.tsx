'use client';

import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { connectAction } from '@/app/(app)/connexions/actions';
import { ConnectionControls } from '@/components/connection-controls';
import {
  FieldInput,
  FormMessage,
  SELECT_CLASS,
  useKeyForm,
  valuesOf,
} from '@/components/connection-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_SINCE,
  otherOwnersNote,
  SINCE_LABELS,
  SINCE_VALUES,
  type SinceDays,
} from '@/lib/connection-form';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

const sinceOf = (value: FormDataEntryValue | null): SinceDays =>
  SINCE_VALUES.find((candidate) => candidate === value) ?? DEFAULT_SINCE;

// « Tester et brancher » : la connexion n'est enregistrée qu'après un test réussi.
function ConnectForm({ entry }: { entry: CatalogItem }) {
  const idPrefix = useId();
  const { result, pending, onSubmit } = useKeyForm((data) =>
    connectAction({
      provider: entry.id,
      fields: valuesOf(data, entry.fields),
      since: sinceOf(data.get('since')),
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm leading-6 text-foreground-2">
        {entry.keyHelp}{' '}
        <a
          href={entry.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Où trouver la clé
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
        </a>
      </p>
      {entry.fields.map((field) => (
        <FieldInput key={field.name} field={field} idPrefix={idPrefix} disabled={pending} />
      ))}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-since`}>Lire ce qui date de</Label>
        <select
          id={`${idPrefix}-since`}
          name="since"
          defaultValue={DEFAULT_SINCE}
          disabled={pending}
          className={SELECT_CLASS}
        >
          {SINCE_VALUES.map((value) => (
            <option key={value} value={value}>
              {SINCE_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Borne le premier passage, donc son coût.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Test en cours…' : 'Tester et brancher'}
      </Button>
      <FormMessage result={result} />
    </form>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warning">
      <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}

// Le panneau d'un outil : ses connexions (état, boutons) puis le formulaire pour en brancher une.
export function ConnectionPanel({
  entry,
  connections,
  viewerId,
  canConnect,
}: {
  entry: CatalogItem;
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
}) {
  // Le formulaire reste affiché après un succès : on y lit « Connecté : … ».
  const [adding, setAdding] = useState(connections.length === 0);
  const others = otherOwnersNote(connections, viewerId);
  const secrets = entry.fields.filter((field) => field.kind === 'secret');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant={connections.length > 0 ? 'outline' : 'default'}>
          {connections.length > 0 ? 'Gérer' : 'Brancher'}
          <span className="sr-only"> {entry.label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry.label}</DialogTitle>
          <DialogDescription>
            Ce que Leon lit dans {entry.label} est visible de toute l'équipe.
          </DialogDescription>
        </DialogHeader>
        {entry.warning && <Notice text={entry.warning} />}
        {others && <Notice text={`${others} Évitez de brancher deux fois le même espace.`} />}
        {connections.map((view) => (
          <ConnectionControls
            key={view.id}
            view={view}
            tool={entry.label}
            secrets={secrets}
            canConnect={canConnect}
          />
        ))}
        {!canConnect && (
          <p className="text-sm leading-6 text-foreground-2">
            Les connecteurs ne sont pas configurés sur ce serveur : ajoutez LEON_CONNECTORS_KEY
            (voir .env.example), puis redémarrez Leon.
          </p>
        )}
        {canConnect && (connections.length === 0 || adding) && <ConnectForm entry={entry} />}
        {canConnect && connections.length > 0 && !adding && (
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setAdding(true)}>
            Brancher une autre connexion
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
