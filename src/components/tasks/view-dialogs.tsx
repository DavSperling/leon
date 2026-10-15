'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createViewAction,
  deleteViewAction,
  setTeamDefaultAction,
  updateViewAction,
} from '@/app/(taches)/taches/view-actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { viewHref } from '@/lib/tasks/task-links';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { OpenView } from './list-context';
import { safely } from './safely';
import { ViewNameDialog } from './view-name-dialog';

export type ViewDialogKind = 'save-as' | 'rename' | 'default' | 'delete';

type ViewDialogsProps = {
  kind: ViewDialogKind | null;
  view: OpenView | null; // la vue enregistrée ouverte
  config: ViewConfig;
  modified: boolean;
  onClose: () => void;
};

type ConfirmProps = { view: OpenView; onClose: () => void };

// Une vue d'équipe ouverte et intacte est déjà ce qu'il faut : il suffit de la choisir.
function ConfirmTeamDefault({ view, onClose }: ConfirmProps) {
  const confirm = async () => {
    const result = await safely(setTeamDefaultAction(view.id));
    if (result.ok) toast.success('Affichage par défaut de l’équipe défini.');
    else toast.error(result.error);
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Définir « {view.name} » par défaut ?</AlertDialogTitle>
          <AlertDialogDescription>
            Toute l’équipe verra cet affichage dans les tâches, tant qu’elle n’en choisit pas un
            autre.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>Définir par défaut</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmDelete({ view, onClose }: ConfirmProps) {
  const router = useRouter();
  const remove = async () => {
    const result = await safely(deleteViewAction(view.id));
    if (!result.ok) return void toast.error(result.error);
    toast.success('Vue supprimée.');
    router.push('/taches');
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {view.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            {view.team ? 'Toute l’équipe perd cette vue. ' : ''}Les tâches ne sont pas touchées.
            Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Les dialogues des vues enregistrées : un seul est ouvert à la fois, `kind` dit lequel. Une vue
// créée devient la vue ouverte.
export function ViewDialogs({ kind, view, config, modified, onClose }: ViewDialogsProps) {
  const router = useRouter();
  const create = async (name: string, team: boolean, makeDefault: boolean, done: string) => {
    const result = await safely(createViewAction({ name, config, team, makeDefault }));
    if (result.ok) {
      toast.success(done);
      router.push(viewHref(result.id));
    }
    return result;
  };
  const rename = async (id: string, name: string) => {
    const result = await safely(updateViewAction(id, { name }));
    if (result.ok) toast.success('Vue renommée.');
    return result;
  };

  if (kind === 'save-as') {
    return (
      <ViewNameDialog
        title="Enregistrer la vue"
        description="Elle garde l’affichage et les filtres actuels, et s’ouvre depuis les onglets et la navigation."
        submitLabel="Enregistrer"
        asksScope
        onSubmit={({ name, team }) => create(name, team, false, 'Vue enregistrée.')}
        onClose={onClose}
      />
    );
  }
  if (kind === 'default' && view?.team && !modified) {
    return <ConfirmTeamDefault view={view} onClose={onClose} />;
  }
  if (kind === 'default') {
    return (
      <ViewNameDialog
        title="Définir par défaut pour l’équipe"
        description="L’affichage actuel devient une vue d’équipe, que toute l’équipe voit dans les tâches tant qu’elle n’en choisit pas un autre."
        submitLabel="Définir par défaut"
        initialName="Affichage de l’équipe"
        onSubmit={({ name }) =>
          create(name, true, true, 'Affichage par défaut de l’équipe défini.')
        }
        onClose={onClose}
      />
    );
  }
  if (kind === 'rename' && view) {
    return (
      <ViewNameDialog
        title="Renommer la vue"
        description="Le nom s’affiche dans les onglets et la navigation."
        submitLabel="Renommer"
        initialName={view.name}
        onSubmit={({ name }) => rename(view.id, name)}
        onClose={onClose}
      />
    );
  }
  if (kind === 'delete' && view) return <ConfirmDelete view={view} onClose={onClose} />;
  return null;
}
