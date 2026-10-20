'use client';

import { ChevronDown, ExternalLink, TriangleAlert } from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  ADMIN_CONSENT_MESSAGE,
  DEFAULT_SINCE,
  oauthStartPath,
  otherOwnersNote,
  panelMode,
  SINCE_LABELS,
  SINCE_VALUES,
  type SinceDays,
} from '@/lib/connection-form';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

const sinceOf = (value: FormDataEntryValue | null): SinceDays =>
  SINCE_VALUES.find((candidate) => candidate === value) ?? DEFAULT_SINCE;

// Le choix de la période, commun au bouton et à la clé collée.
function SinceSelect({ idPrefix, disabled }: { idPrefix: string; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-since`}>Lire ce qui date de</Label>
      <select
        id={`${idPrefix}-since`}
        name="since"
        defaultValue={DEFAULT_SINCE}
        disabled={disabled}
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
  );
}

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
      <SinceSelect idPrefix={idPrefix} disabled={pending} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Test en cours…' : 'Tester et brancher'}
      </Button>
      <FormMessage result={result} />
    </form>
  );
}

// « Se connecter avec… » : une navigation vers l'éditeur (formulaire POST), pas une action serveur.
// Les champs non secrets et la période partent avec ; les jetons, eux, ne passent jamais ici.
function OAuthForm({ entry }: { entry: CatalogItem }) {
  const idPrefix = useId();
  const fields = entry.fields.filter((field) => entry.oauthPreFields.includes(field.name));
  return (
    <form method="post" action={oauthStartPath(entry.id)} className="space-y-4">
      {entry.oauthHelp && <p className="text-sm leading-6 text-foreground-2">{entry.oauthHelp}</p>}
      {fields.map((field) => (
        <FieldInput key={field.name} field={field} idPrefix={idPrefix} />
      ))}
      <SinceSelect idPrefix={idPrefix} />
      <Button type="submit" size="sm">
        Se connecter avec {entry.label}
      </Button>
      {entry.adminConsentUrl && (
        <p className="text-[13px] leading-[18px] text-foreground-2">
          {ADMIN_CONSENT_MESSAGE}{' '}
          <a
            href={entry.adminConsentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Lien d'accord pour l'administrateur
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
          </a>
        </p>
      )}
    </form>
  );
}

// La clé collée, en secours sous le bouton.
function KeyFallback({ entry }: { entry: CatalogItem }) {
  return (
    <Collapsible className="space-y-4">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-auto p-0">
          ou coller une clé
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden="true"
            className="transition-transform group-aria-expanded/button:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ConnectForm entry={entry} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// Le bouton d'abord, la clé en secours ; la clé seule quand l'appli n'est pas configurée.
function AddConnection({ entry }: { entry: CatalogItem }) {
  const mode = panelMode(entry);
  if (mode === 'none') {
    return (
      <p className="text-sm leading-6 text-foreground-2">
        L'appli {entry.label} n'est pas encore configurée sur ce serveur.
      </p>
    );
  }
  if (mode === 'key') return <ConnectForm entry={entry} />;
  return (
    <div className="space-y-4">
      <OAuthForm entry={entry} />
      {mode === 'oauth+key' && <KeyFallback entry={entry} />}
    </div>
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
            oauthReady={entry.oauthReady}
          />
        ))}
        {!canConnect && (
          <p className="text-sm leading-6 text-foreground-2">
            Les connecteurs ne sont pas configurés sur ce serveur : ajoutez LEON_CONNECTORS_KEY
            (voir .env.example), puis redémarrez Leon.
          </p>
        )}
        {canConnect && (connections.length === 0 || adding) && <AddConnection entry={entry} />}
        {canConnect && connections.length > 0 && !adding && (
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setAdding(true)}>
            Brancher une autre connexion
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
