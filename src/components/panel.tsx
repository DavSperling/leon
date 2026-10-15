import type { ReactNode } from 'react';

type PanelProps = {
  label: string; // nom de la région pour les lecteurs d'écran
  title: string;
  children: ReactNode;
};

// Colonne de gauche du panneau blanc : un titre, puis un corps qui défile (arbre des fiches,
// navigation des tâches).
export function Panel({ label, title, children }: PanelProps) {
  return (
    <aside aria-label={label} className="flex w-[300px] shrink-0 flex-col border-r">
      <p className="px-6 pt-5 pb-3 text-base text-muted-foreground">{title}</p>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
    </aside>
  );
}
