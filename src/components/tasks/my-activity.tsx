import { Bot } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { formatRelative } from '@/lib/format';
import type { ActivityItem } from '@/server/tasks/activity';
import type { Person } from '@/server/tasks/task-row';
import { Avatar } from './avatar';
import { actorLabel, eventText } from './event-text';
import { ListBreadcrumb } from './list-breadcrumb';
import { MyTasksTabs } from './my-tasks-tabs';
import { TaskTitle } from './task-title';

function ActorAvatar({ item }: { item: ActivityItem }) {
  if (item.actorKind === 'user') {
    return <Avatar person={item.actor ?? { name: actorLabel(item), initials: '?' }} />;
  }
  return (
    <span
      role="img"
      aria-label={actorLabel(item)}
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground"
    >
      <Bot size={12} strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

type ItemProps = { item: ActivityItem; names: ReadonlyMap<string, string>; now: Date };

function ActivityRow({ item, names, now }: ItemProps) {
  return (
    <li className="flex items-start gap-3 px-5 py-2.5 text-sm">
      <div className="pt-px">
        <ActorAvatar item={item} />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p>
          <span className="font-medium">{actorLabel(item)}</span> {eventText(item, names)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <Link href={`/taches/${item.taskRef}`} className="hover:text-foreground hover:underline">
            <span className="font-mono">{item.taskRef}</span> <TaskTitle title={item.taskTitle} />
          </Link>
        </p>
        {item.body && (
          <p className="line-clamp-2 text-xs whitespace-pre-line text-foreground-2">{item.body}</p>
        )}
      </div>
      <time
        dateTime={item.createdAt.toISOString()}
        className="shrink-0 pt-px text-xs text-muted-foreground"
      >
        {formatRelative(item.createdAt, now)}
      </time>
    </li>
  );
}

type MyActivityProps = { items: ActivityItem[]; members: Person[]; now: Date };

// L'onglet Activité de « Mes tâches » : les derniers événements sur les tâches qui me sont assignées
// ou que j'ai créées, du plus récent au plus ancien. Les filtres et l'affichage de la liste n'y
// servent à rien : l'en-tête n'a que le fil d'Ariane et les onglets.
export function MyActivity({ items, members, now }: MyActivityProps) {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-card">
        <div className="flex min-h-12 items-center px-5 py-2">
          <ListBreadcrumb title="Mes tâches" />
        </div>
        <MyTasksTabs active="activity" />
      </div>
      {items.length === 0 ? (
        <div className="px-5">
          <EmptyState
            reason="Aucune activité."
            nextStep="Les changements des tâches qui vous sont assignées ou que vous avez créées apparaissent ici."
          />
        </div>
      ) : (
        <ul aria-label="Activité récente" className="divide-y pb-10">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} names={names} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
