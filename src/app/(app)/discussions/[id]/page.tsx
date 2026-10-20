import { ChevronLeft, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
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
    <div className="@container mx-auto w-full max-w-[1180px] px-10 pt-10 pb-10 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <nav aria-label="Fil d’Ariane">
        <Link
          href="/discussions"
          className="-ml-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[14px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          Discussions
        </Link>
      </nav>
      <header className="mt-3 mb-7 border-b pb-6 @[920px]:mr-[440px]">
        <h1 className="text-[26px] leading-[34px] font-semibold tracking-tight break-words">
          {found.discussion.title}
        </h1>
        <p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted-foreground">
          <Lock size={14} strokeWidth={1.5} aria-hidden="true" />
          Visible de vous seul · Leon ne lit que ce que vous avez le droit de voir.
        </p>
      </header>
      <DiscussionThread
        key={found.discussion.id}
        discussionId={found.discussion.id}
        initialMessages={found.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations,
        }))}
        modelAvailable={getLlm(env) !== null}
        appOrigin={new URL(env.BETTER_AUTH_URL).origin}
      />
    </div>
  );
}
