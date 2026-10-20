import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lien vers l'original d'une source d'outil. L'adresse est déjà limitée à http et https par le serveur (safeUrl).
export function SourceLink({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline',
        className,
      )}
    >
      Ouvrir dans {label}
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
    </a>
  );
}
