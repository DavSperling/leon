import { UserRound } from 'lucide-react';

type AvatarProps = { person: { name: string; initials: string } | null };

// Les initiales ne suffisent pas à nommer quelqu'un : le nom complet est l'étiquette de l'image.
export function Avatar({ person }: AvatarProps) {
  if (!person) {
    return (
      <span
        role="img"
        aria-label="Sans assigné"
        title="Sans assigné"
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground"
      >
        <UserRound size={12} strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={person.name}
      title={person.name}
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-medium text-primary"
    >
      {person.initials}
    </span>
  );
}
