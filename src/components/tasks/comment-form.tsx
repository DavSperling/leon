'use client';

import { type FormEvent, useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addCommentAction } from '@/app/(taches)/taches/[ref]/actions';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { COMMENT_MAX_CHARS } from '@/lib/tasks/limits';
import { safely } from './safely';

// Le commentaire (Markdown) : ⌘Entrée ou le bouton l'envoie ; une erreur le garde pour réessayer.
export function CommentForm({ taskId }: { taskId: string }) {
  const id = useId();
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  const empty = body.trim() === '';

  const submit = () => {
    if (pending || empty) return;
    startTransition(async () => {
      const result = await safely(addCommentAction(taskId, body));
      if (result.ok) setBody('');
      else toast.error(result.error);
    });
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label htmlFor={id} className="sr-only">
        Commentaire
      </label>
      <Textarea
        id={id}
        value={body}
        maxLength={COMMENT_MAX_CHARS}
        rows={2}
        placeholder="Écrire un commentaire…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            // preventDefault : la page ne doit pas aussi revenir à la liste.
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="max-h-60 min-h-16 resize-none text-sm"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={pending || empty}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {pending ? 'Envoi…' : 'Commenter'}
          <Kbd className="bg-primary-foreground/20 text-primary-foreground">⌘↵</Kbd>
        </Button>
      </div>
    </form>
  );
}
