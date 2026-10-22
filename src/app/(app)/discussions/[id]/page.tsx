import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DiscussionThread } from '@/components/discussion/discussion-thread';
import { requireUserContext } from '@/server/auth/session';
import { getDiscussion } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';

export const metadata: Metadata = { title: 'Discussion' };

type Params = Promise<{ id: string }>;

// Une discussion de l'utilisateur. Celle d'un autre, ou une discussion inconnue, n'existe pas pour lui.
export default async function DiscussionPage({ params }: { params: Params }) {
  const ctx = await requireUserContext();
  const { id } = await params;
  const found = await getDiscussion(ctx, id);
  if (!found) notFound();

  return (
    <DiscussionThread
      key={found.discussion.id}
      discussionId={found.discussion.id}
      title={found.discussion.title}
      initialMessages={found.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: message.citations,
      }))}
      modelAvailable={getLlm(env) !== null}
      appOrigin={new URL(env.BETTER_AUTH_URL).origin}
    />
  );
}
