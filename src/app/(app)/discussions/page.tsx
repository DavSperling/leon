import { Lock, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NewDiscussionForm } from '@/components/discussion/new-discussion-form';
import { EmptyState, Notice, PageHeader, Section } from '@/components/verre';
import { DiscussionRows } from '@/components/verre/discussions/list';
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
    <div className="mx-auto max-w-[760px]">
      {/* La question au centre de l'écran, comme l'accueil d'un assistant ; les discussions passées en dessous. */}
      <div className="flex min-h-[calc(100dvh-160px)] flex-col justify-center">
        <PageHeader
          title="Discussions"
          subtitle="Posez une question : Leon cherche, lit et répond en citant ses sources, ou dit qu’il ne sait pas."
          meta={
            <span className="inline-flex items-center gap-1.5">
              <Lock aria-hidden="true" />
              Vos discussions ne sont visibles que de vous.
            </span>
          }
          className="justify-center text-center [&>div]:mx-auto [&>div>div]:justify-center"
        />
        <div className="grid gap-5">
          {!modelAvailable && (
            <Notice tone="warning" live="status">
              Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La
              recherche, elle, marche.
            </Notice>
          )}
          <NewDiscussionForm disabled={!modelAvailable} />
        </div>
      </div>

      <Section id="vos-discussions" title="Vos discussions" className="mt-12">
        {discussions.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Aucune discussion pour l’instant."
            description={
              <>
                Posez une question ci-dessus, ou continuez une recherche en discussion depuis la
                page{' '}
                <Link
                  href="/"
                  className="font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline"
                >
                  Recherche
                </Link>
                .
              </>
            }
          />
        ) : (
          <DiscussionRows
            rows={discussions.map((d) => ({
              id: d.id,
              title: d.title,
              updatedAt: d.updatedAt.toISOString(),
              when: formatRelative(d.updatedAt, now),
            }))}
          />
        )}
      </Section>
    </div>
  );
}
