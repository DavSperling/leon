import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DiscussionThread } from '@/components/discussion/discussion-thread';
import { requireUserContext } from '@/server/auth/session';
import { withCitationDetails } from '@/server/discussion/citation-sources';
import { getDiscussion } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('thread'))('title') };
}

type Params = Promise<{ id: string }>;

// Une discussion de l'utilisateur. Celle d'un autre, ou une discussion inconnue, n'existe pas pour lui.
export default async function DiscussionPage({ params }: { params: Params }) {
  const ctx = await requireUserContext();
  const { id } = await params;
  const found = await getDiscussion(ctx, id);
  if (!found) notFound();
  // Chaque citation avec l'outil, qui voit la source et le passage cité, sous les droits du lecteur.
  const messages = await withCitationDetails(
    ctx,
    found.messages.map(({ id, role, content, citations, actions }) => ({
      id,
      role,
      content,
      citations,
      actions,
    })),
  );

  return (
    <DiscussionThread
      key={found.discussion.id}
      discussionId={found.discussion.id}
      title={found.discussion.title}
      createdAt={found.discussion.createdAt}
      initialMessages={messages}
      modelAvailable={getLlm(env) !== null}
      appOrigin={new URL(env.BETTER_AUTH_URL).origin}
    />
  );
}
