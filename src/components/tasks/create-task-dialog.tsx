'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createTaskAction } from '@/app/(taches)/taches/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { DESCRIPTION_MAX_CHARS, TITLE_MAX_CHARS } from '@/lib/tasks/limits';
import { initialDraft, type TaskDraft, type TaskPrefill } from './create-draft';
import { DraftPills } from './draft-pills';
import type { ListContext } from './list-context';
import { safely } from './safely';

type FormProps = {
  prefill: TaskPrefill;
  filterProjectId: string | null;
  context: ListContext;
  now: Date;
  onDone: () => void;
};

const toInput = (title: string, description: string, draft: TaskDraft) => ({
  title,
  descriptionMd: description,
  projectId: draft.projectId,
  parentId: draft.parent?.id,
  statusId: draft.statusId,
  priority: draft.priority,
  assigneeId: draft.assigneeId,
  dueDate: draft.dueDate,
  labelIds: draft.labels.map((label) => label.id),
});

type FooterProps = { pending: boolean; onCreateAndContinue: () => void };

function FormFooter({ pending, onCreateAndContinue }: FooterProps) {
  return (
    <DialogFooter className="items-center">
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="sm">
          Annuler
        </Button>
      </DialogClose>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={onCreateAndContinue}
      >
        Créer et continuer
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        aria-keyshortcuts="Meta+Enter Control+Enter"
      >
        {pending ? 'Création…' : 'Créer la tâche'}
        <Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘↵</Kbd>
      </Button>
    </DialogFooter>
  );
}

// Le contenu du dialogue est démonté à la fermeture : chaque ouverture repart du préremplissage.
function CreateTaskForm({ prefill, filterProjectId, context, now, onDone }: FormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState(() => initialDraft(prefill, filterProjectId, context));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleField = useRef<HTMLInputElement>(null);

  // « Créer et continuer » garde les propriétés (on enchaîne souvent des tâches proches) et vide le texte.
  const submit = (keepOpen: boolean) => {
    if (pending) return;
    if (title.trim() === '') {
      setError('Donnez un titre à la tâche.');
      titleField.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await safely(createTaskAction(toInput(title, description, draft)));
      if (!result.ok) return setError(result.error);
      toast.success(`${result.ref} créée`, {
        action: { label: 'Ouvrir', onClick: () => router.push(`/taches/${result.ref}`) },
      });
      setError(null);
      if (!keepOpen) return onDone();
      setTitle('');
      setDescription('');
      titleField.current?.focus();
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(false);
  };
  // Les menus des pastilles sont hors du formulaire dans le DOM : leurs touches ne comptent pas.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const inForm = event.currentTarget.contains(event.target as Node);
    if (inForm && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit(false);
    }
  };

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate className="grid gap-3">
      <div className="grid gap-2">
        <Input
          ref={titleField}
          value={title}
          maxLength={TITLE_MAX_CHARS}
          placeholder="Titre de la tâche"
          aria-label="Titre"
          aria-invalid={error !== null && title.trim() === ''}
          onChange={(event) => setTitle(event.target.value)}
          className="h-10 text-base font-medium"
        />
        <Textarea
          value={description}
          rows={4}
          maxLength={DESCRIPTION_MAX_CHARS}
          placeholder="Description (Markdown)"
          aria-label="Description"
          onChange={(event) => setDescription(event.target.value)}
          className="max-h-60 min-h-24 resize-none text-sm"
        />
      </div>
      <DraftPills draft={draft} setDraft={setDraft} context={context} now={now} />
      {error && (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {error}
        </p>
      )}
      <FormFooter pending={pending} onCreateAndContinue={() => submit(true)} />
    </form>
  );
}

type CreateTaskDialogProps = Omit<FormProps, 'onDone'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateTaskDialog({ open, onOpenChange, ...form }: CreateTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-4 p-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
          <DialogDescription className="sr-only">
            Titre, description et propriétés de la tâche à créer.
          </DialogDescription>
        </DialogHeader>
        <CreateTaskForm {...form} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
