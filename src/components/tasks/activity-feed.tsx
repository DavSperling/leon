import { formatDateTime, formatRelative } from '@/lib/format';
import { actorLabel } from '@/server/memory/labels';
import type { ActivityItem } from '@/server/tasks/activity';
import type { Person } from '@/server/tasks/task-row';
import { ActorAvatar } from './actor-avatar';
import { eventText } from './event-text';

function When({ date, now }: { date: Date; now: Date }) {
  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateTime(date)}
      className="shrink-0 text-xs text-muted-foreground"
    >
      {formatRelative(date, now)}
    </time>
  );
}

type ItemProps = { item: ActivityItem; names: ReadonlyMap<string, string>; now: Date };

// Un commentaire : une carte, avec son texte (Markdown, affiché tel quel pour l'instant).
function CommentItem({ item, now }: Omit<ItemProps, 'names'>) {
  return (
    <li className="rounded-lg border bg-card text-sm">
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        <ActorAvatar item={item} />
        <span className="min-w-0 flex-1 truncate font-medium">{actorLabel(item)}</span>
        <When date={item.createdAt} now={now} />
      </div>
      <p className="px-3 pt-1.5 pb-2.5 pl-[2.625rem] leading-6 break-words whitespace-pre-wrap">
        {item.body}
      </p>
    </li>
  );
}

// Un événement : une ligne discrète, « Amos a changé le statut : À faire → En cours ».
function EventItem({ item, names, now }: ItemProps) {
  return (
    <li className="flex items-center gap-2.5 text-[13px] leading-5 text-muted-foreground">
      <ActorAvatar item={item} />
      <p className="min-w-0 flex-1 break-words">
        <span className="font-medium text-foreground-2">{actorLabel(item)}</span>{' '}
        {eventText(item, names)}
      </p>
      <When date={item.createdAt} now={now} />
    </li>
  );
}

type ActivityFeedProps = { items: ActivityItem[]; members: Person[]; now: Date };

// Les événements et les commentaires d'une tâche, mêlés dans l'ordre où ils ont eu lieu.
export function ActivityFeed({ items, members, now }: ActivityFeedProps) {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return (
    <ol aria-label="Historique" className="space-y-3">
      {items.map((item) =>
        item.kind === 'comment' && item.body !== null ? (
          <CommentItem key={item.id} item={item} now={now} />
        ) : (
          <EventItem key={item.id} item={item} names={names} now={now} />
        ),
      )}
    </ol>
  );
}
