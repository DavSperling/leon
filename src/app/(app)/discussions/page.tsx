import { ChevronRight, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NewDiscussionForm } from '@/components/discussion/new-discussion-form';
import { EmptyState } from '@/components/empty-state';
import { formatRelative } from '@/lib/format';
import { requireUserContext } from '@/server/auth/session';
import { listDiscussions } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';

export const metadata: Metadata = { title: 'Discussions' };

// Les discussions de l'utilisateur, la plus récente d'abord, et une nouvelle question. Elles ne sont visibles que
// de lui (la base le garantit).
export default async function DiscussionsPage() {
  const ctx = await requireUserContext();
  const discussions = await listDiscussions(ctx);
  const modelAvailable = getLlm(env) !== null;
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-8 px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">Discussions</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Posez une question : Leon cherche, lit et répond en citant ses sources, ou dit qu’il ne
          sait pas.
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-[14px] text-muted-foreground">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" />
          Vos discussions ne sont visibles que de vous.
        </p>
      </header>

      {!modelAvailable && (
        <p
          role="status"
          className="rounded-lg bg-warning-soft px-4 py-2.5 text-[15px] text-warning"
        >
          Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La recherche,
          elle, marche.
        </p>
      )}

      <NewDiscussionForm disabled={!modelAvailable} />

      <section aria-labelledby="mes-discussions" className="space-y-3">
        <h2 id="mes-discussions" className="text-[15px] font-medium">
          Vos discussions
        </h2>
        {discussions.length === 0 ? (
          <EmptyState
            reason="Aucune discussion pour l’instant."
            nextStep="Posez une question ci-dessus, ou continuez une recherche en discussion depuis la page Recherche."
          />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {discussions.map((discussion) => (
              <li key={discussion.id}>
                <Link
                  href={`/discussions/${discussion.id}`}
                  className="flex min-h-14 items-center gap-4 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-6 font-medium">
                    {discussion.title}
                  </span>
                  <time
                    dateTime={discussion.updatedAt.toISOString()}
                    className="shrink-0 text-[14px] text-muted-foreground tabular-nums"
                  >
                    {formatRelative(discussion.updatedAt, now)}
                  </time>
                  <ChevronRight
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
