'use client';

import { Bot, Copy, GitBranch, Trash2 } from 'lucide-react';
import { type ComponentProps, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteTaskAction } from '@/app/(taches)/taches/[ref]/actions';
import { copyText } from '@/components/copy-text';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { branchName } from '@/lib/tasks/ref';
import { safely } from './safely';

function ActionButton(props: ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start" {...props} />
  );
}

const glyph = (Icon: typeof Copy) => <Icon size={14} strokeWidth={1.5} aria-hidden="true" />;

type DeleteProps = { task: { id: string; ref: string }; listQuery: string };

// La suppression demande confirmation. Une fois la tâche supprimée, l'action mène à la liste.
function DeleteTask({ task, listQuery }: DeleteProps) {
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      const result = await safely(deleteTaskAction(task.id, listQuery));
      // Une redirection ne rend rien : seule une erreur revient.
      if (result?.error) toast.error(result.error);
    });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <ActionButton disabled={pending} className="text-destructive hover:text-destructive">
          {glyph(Trash2)}
          Supprimer
        </ActionButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {task.ref} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les commentaires et l&apos;historique de cette tâche sont supprimés avec elle. Ses
            sous-tâches restent, sans parent. Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            {glyph(Trash2)}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type TaskActionsProps = {
  task: { id: string; ref: string; title: string };
  firstName: string; // celui de la personne qui copie : le préfixe de la branche
  agentMarkdown: string; // la tâche en Markdown, comme la lit l'outil MCP task_get
  listQuery: string;
};

// Copier l'identifiant, le nom de branche, la tâche pour un agent ; supprimer.
export function TaskActions({ task, firstName, agentMarkdown, listQuery }: TaskActionsProps) {
  return (
    <div className="-mx-2.5 space-y-0.5">
      <ActionButton onClick={() => copyText(task.ref, 'Identifiant copié.')}>
        {glyph(Copy)}
        Copier l&apos;identifiant
      </ActionButton>
      <ActionButton
        onClick={() =>
          copyText(branchName(task.ref, task.title, firstName), 'Nom de branche copié.')
        }
      >
        {glyph(GitBranch)}
        Copier le nom de branche
      </ActionButton>
      <ActionButton onClick={() => copyText(agentMarkdown, 'Tâche copiée pour un agent.')}>
        {glyph(Bot)}
        Copier pour un agent
      </ActionButton>
      <DeleteTask task={task} listQuery={listQuery} />
    </div>
  );
}
