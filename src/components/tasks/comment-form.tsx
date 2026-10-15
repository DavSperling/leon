'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { addCommentAction } from '@/app/(taches)/taches/[ref]/actions';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { COMMENT_MAX_CHARS } from '@/lib/tasks/limits';
import { safely } from './safely';

// Le commentaire (Markdown, dans l'éditeur riche) : ⌘Entrée ou le bouton l'envoie ; une erreur le
// garde pour réessayer. Après l'envoi, l'éditeur repart à neuf (sa clé change).
export function CommentForm({ taskId }: { taskId: string }) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(0);
  const [pending, startTransition] = useTransition();
  const empty = body.trim() === '';

  const submit = () => {
    if (pending || empty) return;
    startTransition(async () => {
      const result = await safely(addCommentAction(taskId, body));
      if (!result.ok) return void toast.error(result.error);
      setBody('');
      setSent((count) => count + 1);
    });
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <MarkdownEditor
        key={sent}
        value=""
        label="Commentaire"
        placeholder="Écrire un commentaire…"
        maxLength={COMMENT_MAX_CHARS}
        onChange={setBody}
        onSubmit={submit}
        className="max-h-60 min-h-16 overflow-y-auto border-input bg-transparent text-sm shadow-xs dark:bg-input/30"
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
