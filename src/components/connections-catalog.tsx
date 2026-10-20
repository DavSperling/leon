'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { ConnectionPanel } from '@/components/connection-panel';
import { ConnectionStatus } from '@/components/connection-status';
import { otherOwnersNote } from '@/lib/connection-form';
import { FAMILY_LABELS, PROVIDER_FAMILIES_ORDER, type ProviderFamily } from '@/lib/providers';
import { cn } from '@/lib/utils';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

// Ce que Leon lit dans chaque famille d'outils : la ligne sous le nom de l'outil.
const FAMILY_READS: Record<ProviderFamily, string> = {
  dev: 'Tickets, pull requests et pages',
  reunions: 'Comptes rendus et transcriptions',
  projet: 'Tâches, projets et documents',
  crm: 'Contacts, entreprises et notes',
  support: 'Conversations clients',
  mails: 'Mails et agenda, privés à leur boîte',
};

// Une tuile à l'initiale de l'outil, d'une teinte pâle propre à lui : on le reconnaît d'une carte à l'autre.
function ToolMark({ entry }: { entry: CatalogItem }) {
  const hue = [...entry.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-semibold"
      style={{ backgroundColor: `oklch(0.94 0.04 ${hue})`, color: `oklch(0.38 0.09 ${hue})` }}
    >
      {entry.label.charAt(0)}
    </span>
  );
}

// Plusieurs connexions (une par boîte mail, par espace) : leur nombre, et celles en erreur, sur une ligne. Le
// détail de chacune est dans « Gérer ».
function Summary({ connections }: { connections: ConnectionView[] }) {
  const failing = connections.filter((view) => view.status === 'error' || view.creatorLeft).length;
  return (
    <p className="text-[12.5px] leading-[18px] text-foreground-2 tabular-nums">
      {connections.length} connexions
      {failing > 0 && (
        <span className="text-destructive">
          {' · '}
          {failing} en erreur
        </span>
      )}
    </p>
  );
}

type CardProps = {
  entry: CatalogItem;
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  now: Date;
};

function ToolCard({ entry, connections, viewerId, canConnect, now }: CardProps) {
  const others = otherOwnersNote(connections, viewerId);
  return (
    <li
      className={cn(
        'flex flex-col rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] hover:border-input hover:shadow-sm',
        !entry.available && 'bg-muted/60 shadow-none hover:border-border hover:shadow-none',
      )}
    >
      <div className="flex items-start gap-3">
        <ToolMark entry={entry} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] leading-5 font-semibold">{entry.label}</h3>
          <p className="mt-0.5 text-[12.5px] leading-[18px] text-muted-foreground">
            {FAMILY_READS[entry.family]}
          </p>
        </div>
      </div>
      <div className="mt-3 min-h-[18px] flex-1 space-y-1">
        {connections.length === 0 && entry.available && (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">Non branché</p>
        )}
        {connections.length === 1 && connections[0] && (
          <ConnectionStatus view={connections[0]} now={now} />
        )}
        {connections.length > 1 && <Summary connections={connections} />}
        {others && <p className="text-[12.5px] leading-[18px] text-muted-foreground">{others}</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[12px] leading-4 text-muted-foreground">
          {!entry.available ? 'Bientôt' : !entry.triedForReal ? 'Non essayé en réel' : ''}
        </span>
        {entry.available && (
          <ConnectionPanel
            entry={entry}
            connections={connections}
            viewerId={viewerId}
            canConnect={canConnect}
          />
        )}
      </div>
    </li>
  );
}

function groupByProvider(connections: ConnectionView[]): Map<string, ConnectionView[]> {
  const groups = new Map<string, ConnectionView[]>();
  for (const view of connections)
    groups.set(view.provider, [...(groups.get(view.provider) ?? []), view]);
  return groups;
}

// Le portefeuille d'outils : ceux qui sont branchés en tête, puis tout le catalogue, à chercher ou à filtrer
// par famille.
export function ConnectionsCatalog({
  catalog,
  connections,
  viewerId,
  canConnect,
}: {
  catalog: CatalogItem[];
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
}) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<ProviderFamily | 'tous'>('tous');
  const now = new Date();
  const byProvider = groupByProvider(connections);
  const card = (entry: CatalogItem) => (
    <ToolCard
      key={entry.id}
      entry={entry}
      connections={byProvider.get(entry.id) ?? []}
      viewerId={viewerId}
      canConnect={canConnect}
      now={now}
    />
  );
  const plugged = catalog.filter((entry) => byProvider.has(entry.id));
  const needle = query.trim().toLocaleLowerCase('fr');
  const shown = catalog
    .filter((entry) => !byProvider.has(entry.id))
    .filter((entry) => family === 'tous' || entry.family === family)
    .filter((entry) => needle === '' || entry.label.toLocaleLowerCase('fr').includes(needle))
    // Les outils prêts d'abord, « bientôt » à la fin.
    .sort((a, b) => Number(b.available) - Number(a.available));
  const tabs: Array<ProviderFamily | 'tous'> = ['tous', ...PROVIDER_FAMILIES_ORDER];

  return (
    <div className="space-y-10">
      <section aria-labelledby="vos-outils">
        <div className="flex items-baseline justify-between">
          <h2 id="vos-outils" className="text-[16px] leading-6 font-semibold">
            Vos outils
          </h2>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {plugged.length} {plugged.length > 1 ? 'branchés' : 'branché'}
          </span>
        </div>
        {plugged.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed px-5 py-4 text-[14px] leading-5 text-muted-foreground">
            Aucun outil branché. Choisissez-en un ci-dessous : Leon lira ce qu’il contient.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-4">{plugged.map(card)}</ul>
        )}
      </section>

      <section aria-labelledby="ajouter">
        <div className="flex items-center justify-between gap-6">
          <h2 id="ajouter" className="text-[16px] leading-6 font-semibold">
            Ajouter un outil
          </h2>
          <label className="relative w-72">
            <span className="sr-only">Chercher un outil</span>
            <Search
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher un outil…"
              className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-[14px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
            />
          </label>
        </div>
        <div role="group" aria-label="Familles d’outils" className="mt-4 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={family === tab}
              onClick={() => setFamily(tab)}
              className={cn(
                'h-8 cursor-pointer rounded-full border px-3 text-[13px] font-medium transition-colors',
                family === tab
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-foreground-2 hover:border-input hover:text-foreground',
              )}
            >
              {tab === 'tous' ? 'Tous' : FAMILY_LABELS[tab]}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed px-5 py-4 text-[14px] leading-5 text-muted-foreground">
            Aucun outil ne correspond. Essayez un autre nom, ou la famille « Tous ».
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-4 gap-4">{shown.map(card)}</ul>
        )}
      </section>
    </div>
  );
}
