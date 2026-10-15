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
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-5 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[15px] font-medium">{entry.label}</span>
          {!entry.available && <Tag>Bientôt</Tag>}
          {entry.available && !entry.triedForReal && <Tag>Non essayé en réel</Tag>}
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
  return PROVIDER_FAMILIES_ORDER.map((family) => (
    <section key={family} aria-labelledby={`famille-${family}`} className="space-y-3">
      <h2 id={`famille-${family}`} className="text-2xl leading-8 font-semibold tracking-tight">
        {FAMILY_LABELS[family]}
      </h2>
      <ul className="overflow-hidden rounded-xl border">
        {catalog
          .filter((entry) => entry.family === family)
          .map((entry) => (
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
  ));
}
