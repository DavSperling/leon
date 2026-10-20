'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { ConnectionPanel } from '@/components/connection-panel';
import { ToolLogo } from '@/components/tool-logo';
import { formatNumber, formatRelative } from '@/lib/format';
import {
  FAMILY_LABELS,
  PROVIDER_FAMILIES_ORDER,
  type ProviderFamily,
  readsOf,
} from '@/lib/providers';
import { cn } from '@/lib/utils';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

type Health = 'active' | 'paused' | 'error';

const HEALTH: Record<Health, { label: string; dot: string; pill: string }> = {
  active: { label: 'Actif', dot: 'bg-success', pill: 'bg-success-soft text-success' },
  paused: { label: 'En pause', dot: 'bg-muted-foreground', pill: 'bg-muted text-foreground-2' },
  error: {
    label: 'En erreur',
    dot: 'bg-destructive',
    pill: 'bg-destructive-soft text-destructive',
  },
};

const healthOf = (view: ConnectionView): Health => (view.creatorLeft ? 'error' : view.status);

// L'état d'un outil branché plusieurs fois : la pire de ses connexions, sinon l'une active.
function toolHealth(connections: ConnectionView[]): Health {
  const states = connections.map(healthOf);
  if (states.includes('error')) return 'error';
  return states.includes('active') ? 'active' : 'paused';
}

function HealthPill({ health }: { health: Health }) {
  const { label, dot, pill } = HEALTH[health];
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap',
        pill,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

function Beta({ entry }: { entry: CatalogItem }) {
  if (!entry.available || entry.triedForReal) return null;
  return (
    <span
      title="Connecteur pas encore essayé sur un vrai compte"
      className="rounded-md border px-1.5 text-[11px] leading-[18px] font-medium text-muted-foreground"
    >
      Bêta
    </span>
  );
}

// L'initiale d'une personne, d'une teinte pâle stable : on reconnaît qui a branché quoi.
function Person({ name }: { name: string }) {
  const hue = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 11);
  return (
    <span
      title={name}
      className="flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-card"
      style={{ backgroundColor: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.4 0.1 ${hue})` }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Ce que la mémoire garde d'un outil : ses sources et la plus récente (tallyByKind).
export type Kept = { sourceCount: number; lastTurnAt: Date | null };

type ToolProps = {
  entry: CatalogItem;
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
};

function PluggedCard({
  entry,
  connections,
  viewerId,
  canConnect,
  now,
  kept,
}: ToolProps & { now: Date; kept: Kept | undefined }) {
  const people = [
    ...new Map(connections.map((view) => [view.createdBy.id, view.createdBy])).values(),
  ];
  const first = people[0];
  return (
    <li className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3.5">
        <ToolLogo id={entry.id} size={48} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] leading-6 font-semibold">{entry.label}</h3>
            <Beta entry={entry} />
          </div>
          <p
            className="truncate text-[12.5px] leading-[18px] text-muted-foreground"
            title={readsOf(entry.id, entry.family)}
          >
            {readsOf(entry.id, entry.family)}
          </p>
        </div>
        <HealthPill health={toolHealth(connections)} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-muted px-4 py-3">
        <div>
          <dt className="text-[12px] text-muted-foreground">Sources gardées</dt>
          <dd className="mt-0.5 text-[18px] leading-6 font-semibold tabular-nums">
            {formatNumber(kept?.sourceCount ?? 0)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted-foreground">Plus récente</dt>
          <dd className="mt-0.5 text-[14px] leading-6 tabular-nums">
            {kept?.lastTurnAt ? formatRelative(kept.lastTurnAt, now) : '—'}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex -space-x-1.5">
            {people.slice(0, 3).map((person) => (
              <Person key={person.id} name={person.name} />
            ))}
          </span>
          <span className="truncate text-[12.5px] text-muted-foreground">
            {connections.length > 1
              ? `${connections.length} connexions`
              : first && `Par ${first.id === viewerId ? 'vous' : first.name}`}
          </span>
        </div>
        <ConnectionPanel
          entry={entry}
          connections={connections}
          viewerId={viewerId}
          canConnect={canConnect}
        />
      </div>
    </li>
  );
}

function CatalogCard({ entry, connections, viewerId, canConnect }: ToolProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-3.5 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-input hover:shadow-sm',
        !entry.available && 'bg-transparent hover:border-border hover:shadow-none',
      )}
    >
      <ToolLogo id={entry.id} size={44} className={cn(!entry.available && 'opacity-60')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] leading-5 font-semibold">{entry.label}</h3>
          <Beta entry={entry} />
        </div>
        <p className="truncate text-[12.5px] leading-[18px] text-muted-foreground">
          {entry.available ? readsOf(entry.id, entry.family) : 'Bientôt'}
        </p>
      </div>
      {entry.available && (
        <ConnectionPanel
          entry={entry}
          connections={connections}
          viewerId={viewerId}
          canConnect={canConnect}
        />
      )}
    </li>
  );
}

// En tête : tout ce qui est branché d'un coup d'œil, logos empilés, éléments lus et états.
function Summary({
  plugged,
  byProvider,
  kept,
}: {
  plugged: CatalogItem[];
  byProvider: Map<string, ConnectionView[]>;
  kept: Record<string, Kept>;
}) {
  const sources = plugged.reduce((sum, entry) => sum + (kept[entry.id]?.sourceCount ?? 0), 0);
  const count = (health: Health) =>
    plugged.filter((entry) => toolHealth(byProvider.get(entry.id) ?? []) === health).length;
  return (
    <section
      aria-label="Résumé des connexions"
      className="flex items-center gap-8 rounded-2xl border bg-card px-7 py-6 shadow-xs"
    >
      <span className="flex -space-x-2">
        {plugged.slice(0, 6).map((entry) => (
          <ToolLogo key={entry.id} id={entry.id} size={42} className="ring-3 ring-card" />
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[30px] leading-9">
          {plugged.length} {plugged.length > 1 ? 'outils branchés' : 'outil branché'}
        </p>
        <p className="mt-0.5 text-[14px] text-muted-foreground tabular-nums">
          {formatNumber(sources)} sources gardées par Leon
        </p>
      </div>
      <ul className="flex gap-6">
        {(['active', 'paused', 'error'] as const).map((health) => (
          <li key={health} className="text-right">
            <p className="text-[22px] leading-7 font-semibold tabular-nums">{count(health)}</p>
            <p className="flex items-center justify-end gap-1.5 text-[12.5px] text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn('size-1.5 rounded-full', HEALTH[health].dot)}
              />
              {HEALTH[health].label}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function groupByProvider(connections: ConnectionView[]): Map<string, ConnectionView[]> {
  const groups = new Map<string, ConnectionView[]>();
  for (const view of connections)
    groups.set(view.provider, [...(groups.get(view.provider) ?? []), view]);
  return groups;
}

// Le portefeuille d'outils : le résumé, ceux qui sont branchés, puis tout le catalogue, à chercher ou à
// filtrer par famille.
export function ConnectionsCatalog({
  catalog,
  connections,
  viewerId,
  canConnect,
  kept,
}: {
  catalog: CatalogItem[];
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  kept: Record<string, Kept>;
}) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<ProviderFamily | 'tous'>('tous');
  const now = new Date();
  const byProvider = groupByProvider(connections);
  const props = (entry: CatalogItem) => ({
    entry,
    connections: byProvider.get(entry.id) ?? [],
    viewerId,
    canConnect,
  });
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
    <div className="space-y-12">
      {plugged.length > 0 && <Summary plugged={plugged} byProvider={byProvider} kept={kept} />}

      <section aria-labelledby="vos-outils">
        <h2 id="vos-outils" className="font-heading text-[26px] leading-8">
          Vos outils
        </h2>
        {plugged.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed px-6 py-5 text-[14px] leading-5 text-muted-foreground">
            Aucun outil branché. Choisissez-en un ci-dessous : Leon lira ce qu’il contient.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-4">
            {plugged.map((entry) => (
              <PluggedCard key={entry.id} {...props(entry)} now={now} kept={kept[entry.id]} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ajouter">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 id="ajouter" className="font-heading text-[26px] leading-8">
              Ajouter un outil
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground tabular-nums">
              {catalog.filter((entry) => entry.available).length} outils prêts à brancher
            </p>
          </div>
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
              className="h-10 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-[14px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
            />
          </label>
        </div>
        <fieldset className="m-0 mt-5 flex flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">Familles d’outils</legend>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={family === tab}
              onClick={() => setFamily(tab)}
              className={cn(
                'h-8 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                family === tab
                  ? 'border-foreground bg-foreground text-background'
                  : 'bg-card text-foreground-2 hover:border-input hover:text-foreground',
              )}
            >
              {tab === 'tous' ? 'Tous' : FAMILY_LABELS[tab]}
            </button>
          ))}
        </fieldset>
        {shown.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed px-6 py-5 text-[14px] leading-5 text-muted-foreground">
            Aucun outil ne correspond. Essayez un autre nom, ou la famille « Tous ».
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-3 gap-3">
            {shown.map((entry) => (
              <CatalogCard key={entry.id} {...props(entry)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
