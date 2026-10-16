import type { ReactNode } from 'react';

type SettingSectionProps = {
  id: string;
  title: string;
  description: string;
  aside?: ReactNode; // à droite du titre
  children: ReactNode;
};

// Une section des réglages : un titre et sa phrase d'explication, puis un cadre de lignes.
export function SettingSection({ id, title, description, aside, children }: SettingSectionProps) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h2 id={id} className="text-base font-medium">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {aside}
      </div>
      <div className="divide-y overflow-hidden rounded-lg border bg-card">{children}</div>
    </section>
  );
}
