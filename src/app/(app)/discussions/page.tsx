import { Lock, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { NewDiscussionForm } from '@/components/discussion/new-discussion-form';
import { EmptyState, Notice, PageHeader, Section } from '@/components/verre';
import { DiscussionRows } from '@/components/verre/discussions/list';
import { formatRelative } from '@/lib/format';
import { isDepartment } from '@/lib/onboarding';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import { listDiscussions } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('discussions'))('title') };
}

// Les discussions de l'utilisateur, la plus récente d'abord, et une nouvelle question. Elles ne sont visibles que
// de lui (la base le garantit).
export default async function DiscussionsPage() {
  const t = await getTranslations('discussions');
  const locale = await getLocale();
  const ctx = await requireUserContext();
  const [discussions, member] = await Promise.all([
    listDiscussions(ctx),
    readOnboardingMember(ctx),
  ]);
  // Deux questions du service de la personne, tant qu'elle n'a encore rien demandé.
  const department = member?.department;
  let examples: string[] | undefined;
  if (discussions.length === 0 && department && isDepartment(department)) {
    const asks = await getTranslations('onboarding');
    examples = [asks(`asks.${department}.one`), asks(`asks.${department}.two`)];
  }
  const modelAvailable = getLlm(env) !== null;
  const now = new Date();

  return (
    <div className="mx-auto max-w-[760px]">
      {/* La question au centre, comme l'accueil d'un assistant, assez haut pour que les discussions passées
          commencent dans le premier écran. */}
      <div className="pt-[clamp(24px,14dvh,160px)]">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          meta={
            <span className="inline-flex items-center gap-1.5">
              <Lock aria-hidden="true" />
              {t('private')}
            </span>
          }
          className="justify-center text-center [&>div]:mx-auto [&>div>div]:justify-center"
        />
        <div className="grid gap-5">
          {!modelAvailable && (
            <Notice tone="warning" live="status">
              {t('modelUnavailable')}
            </Notice>
          )}
          <NewDiscussionForm disabled={!modelAvailable} examples={examples} />
        </div>
      </div>

      <Section id="vos-discussions" title={t('yourDiscussions')} className="mt-14">
        {discussions.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={t('emptyTitle')}
            description={
              <>
                {t('emptyBefore')}{' '}
                <Link
                  href="/"
                  className="font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline"
                >
                  {t('search')}
                </Link>
                {t('emptyAfter')}
              </>
            }
          />
        ) : (
          <DiscussionRows
            rows={discussions.map((d) => ({
              id: d.id,
              title: d.title,
              updatedAt: d.updatedAt.toISOString(),
              when: formatRelative(d.updatedAt, now, locale),
            }))}
          />
        )}
      </Section>
    </div>
  );
}
