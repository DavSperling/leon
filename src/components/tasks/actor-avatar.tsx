import { Bot } from 'lucide-react';
import { actorLabel } from '@/server/memory/labels';
import type { ActivityItem } from '@/server/tasks/activity';
import { Avatar } from './avatar';

// Une personne a ses initiales, un agent une icône : l'étiquette de l'image dit qui c'est.
export function ActorAvatar({ item }: { item: ActivityItem }) {
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
