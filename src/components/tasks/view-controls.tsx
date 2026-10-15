'use client';

import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { updateViewAction } from '@/app/(taches)/taches/view-actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { viewHref } from '@/lib/tasks/task-links';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { OpenView } from './list-context';
import { safely } from './safely';
import { useViewNavigation } from './use-view-navigation';
import type { ViewDialogKind } from './view-dialogs';

type ViewControlsProps = {
  view: OpenView | null;
  config: ViewConfig;
  reference: ViewConfig; // ce que la liste montre sans réglage : la vue ouverte, ou son contexte
  base: ViewConfig;
  modified: boolean; // l'affichage diffère de `reference`
  onDialog: (kind: ViewDialogKind) => void;
};

// Les actions du menu ⋯ sont réservées à l'auteur. Le menu n'est pas modal : le dialogue qui
// s'ouvre ensuite reprend le focus sans laisser la page figée.
function ViewMenu({ onDialog }: { onDialog: (kind: ViewDialogKind) => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Actions de la vue">
          <Ellipsis size={16} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => onDialog('rename')}>
          <Pencil strokeWidth={1.5} aria-hidden="true" />
          Renommer
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onDialog('delete')}>
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// « Réinitialiser » et « Enregistrer » n'apparaissent que si l'affichage diffère ; « Enregistrer »
// met à jour la vue ouverte (son auteur seul), « Enregistrer sous » en crée une autre.
export function ViewControls({
  view,
  config,
  reference,
  base,
  modified,
  onDialog,
}: ViewControlsProps) {
  const navigate = useViewNavigation(base);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const save = (id: string) =>
    startTransition(async () => {
      const result = await safely(updateViewAction(id, { config }));
      if (!result.ok) return void toast.error(result.error);
      toast.success('Vue enregistrée.');
      router.replace(viewHref(id));
    });

  return (
    <div className="ml-auto flex items-center gap-1">
      {modified && (
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate(reference)}>
            Réinitialiser
          </Button>
          {view?.owned && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => save(view.id)}>
              Enregistrer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onDialog('save-as')}>
            Enregistrer sous
          </Button>
        </>
      )}
      {view?.owned && <ViewMenu onDialog={onDialog} />}
    </div>
  );
}
