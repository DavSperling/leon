import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tâches' };

// Squelette : la liste, ses filtres et son affichage s'y ajoutent à la tâche suivante.
export default function TasksPage() {
  return (
    <header className="flex h-12 items-center border-b px-5">
      <h1 className="text-sm font-medium">Toutes les tâches</h1>
    </header>
  );
}
