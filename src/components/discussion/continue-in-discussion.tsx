'use client';

import { MessagesSquare } from 'lucide-react';
import { useState, useTransition } from 'react';
import { continueInDiscussionAction } from '@/app/(app)/discussions/actions';
import { Button } from '@/components/verre';

// « Continuer en discussion » (décision 2 de la spec) : une discussion qui part de la requête et des résultats
// affichés, où Leon répond tout de suite.
export function ContinueInDiscussion({ query, sourceIds }: { query: string; sourceIds: string[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      // La discussion s'ouvre (redirection) ; une erreur revient en message fixe.
      const result = await continueInDiscussionAction(query, sourceIds);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" size="sm" icon={MessagesSquare} onClick={start} loading={pending}>
        Continuer en discussion
      </Button>
      {error && (
        <p role="alert" className="text-label text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
