import type { ReactNode } from 'react';
import { ConnectionPanel } from '@/components/connection-panel';
import { ConnectionStatus } from '@/components/connection-status';
import { otherOwnersNote } from '@/lib/connection-form';
import { FAMILY_LABELS, PROVIDER_FAMILIES_ORDER } from '@/lib/providers';
import type { CatalogItem } from '@/server/connectors/catalog';
import type { ConnectionView } from '@/server/connectors/connections';

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs leading-4 font-medium text-muted-foreground">
      {children}
    </span>
  );
}

type RowProps = {
  entry: CatalogItem;
  connections: ConnectionView[];
  viewerId: string;
  canConnect: boolean;
  now: Date;
};

function ToolRow({ entry, connections, viewerId, canConnect, now }: RowProps) {
  const others = otherOwnersNote(connections, viewerId);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border/70 px-5 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14px] leading-5 font-medium">{entry.label}</span>
          {!entry.available && <Tag>Bientôt</Tag>}
          {entry.available && !entry.triedForReal && (
            <span className="text-[12px] leading-4 text-muted-foreground">non essayé en réel</span>
          )}
        </div>
        {connections.length === 0 && (
          <p className="text-[13px] leading-[18px] text-muted-foreground">Non branché</p>
        )}
        {connections.map((view) => (
          <div key={view.id}>
            <p className="text-[13px] leading-[18px] break-words text-foreground-2">{view.label}</p>
            <ConnectionStatus view={view} now={now} />
          </div>
        ))}
        {others && <p className="text-[13px] leading-[18px] text-muted-foreground">{others}</p>}
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

function groupByProvider(connections: ConnectionView[]): Map<string, ConnectionView[]> {
  const groups = new Map<string, ConnectionView[]>();
  for (const view of connections)
    groups.set(view.provider, [...(groups.get(view.provider) ?? []), view]);
  return groups;
}

// Le catalogue par famille, avec l'état de chaque outil.
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
  const now = new Date();
  const byProvider = groupByProvider(connections);
  // Une famille par rangée : son nom et son compte à gauche, ses outils à droite.
  return PROVIDER_FAMILIES_ORDER.map((family) => {
    const entries = catalog.filter((entry) => entry.family === family);
    const plugged = entries.filter((entry) => byProvider.has(entry.id)).length;
    return (
      <section
        key={family}
        aria-labelledby={`famille-${family}`}
        className="grid grid-cols-[240px_minmax(0,1fr)] gap-10 border-t pt-8 first-of-type:border-t-0 first-of-type:pt-0"
      >
        <div className="pt-3">
          <h2 id={`famille-${family}`} className="text-[16px] leading-6 font-medium">
            {FAMILY_LABELS[family]}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-muted-foreground tabular-nums">
            {plugged === 0
              ? 'Aucun outil branché'
              : `${plugged} sur ${entries.length} ${plugged > 1 ? 'branchés' : 'branché'}`}
          </p>
        </div>
        <ul className="overflow-hidden rounded-lg border bg-card">
          {entries.map((entry) => (
            <ToolRow
              key={entry.id}
              entry={entry}
              connections={byProvider.get(entry.id) ?? []}
              viewerId={viewerId}
              canConnect={canConnect}
              now={now}
            />
          ))}
        </ul>
      </section>
    );
  });
}
