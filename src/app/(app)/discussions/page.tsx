import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NewDiscussionForm } from '@/components/discussion/new-discussion-form';
import { PAGE, PageHeader } from '@/components/page-header';
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
    <div className={PAGE}>
      <PageHeader
        title="Discussions"
        description="Posez une question : Leon cherche, lit et répond en citant ses sources, ou dit qu’il ne sait pas."
      >
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" />
          Visibles de vous seul
        </span>
      </PageHeader>

      {!modelAvailable && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[14px] text-warning"
        >
          Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La recherche,
          elle, marche.
        </p>
      )}

      {/* La question à gauche, ce qu'on a déjà demandé à droite : reprendre ou poser, sans descendre. */}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-10">
        <NewDiscussionForm disabled={!modelAvailable} />

        <section aria-labelledby="mes-discussions" className="rounded-lg border bg-card">
          <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-2">
            <h2 id="mes-discussions" className="text-[16px] leading-6 font-medium">
              Vos discussions
            </h2>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {discussions.length}
            </span>
          </div>
          {discussions.length === 0 ? (
            <p className="px-5 pb-5 text-[14px] leading-5 text-muted-foreground">
              Aucune discussion pour l’instant. Posez une question, ou continuez une recherche en
              discussion depuis la page Recherche.
            </p>
          ) : (
            <ul className="pb-1">
              {discussions.map((discussion) => (
                <li key={discussion.id} className="border-t border-border/70">
                  <Link
                    href={`/discussions/${discussion.id}`}
                    className="flex min-h-11 items-center gap-4 px-5 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-5">
                      {discussion.title}
                    </span>
                    <time
                      dateTime={discussion.updatedAt.toISOString()}
                      className="shrink-0 text-[13px] text-muted-foreground tabular-nums"
                    >
                      {formatRelative(discussion.updatedAt, now)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
