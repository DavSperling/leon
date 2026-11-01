'use client';

import { Code, EyeOff, Share2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setRepoSharingAction, setSessionSharingAction } from '@/app/(app)/developpeurs/actions';
import { Button, EmptyState, GlassCard, PageHeader, Section, Switch } from '@/components/verre';
import { formatRelative } from '@/lib/format';
import { nb } from '@/lib/verre';
import type { DeveloperSpace, DevSession } from '@/server/developpeurs/space';

// Une session : auteur et date ; pour les siennes, « Rendre privée » ou « Partager ».
function SessionItem({ session, viewerId }: { session: DevSession; viewerId: string }) {
  const t = useTranslations('developers');
  const locale = useLocale();
  const title = session.title || t('untitled');
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-fg" title={title}>
          {nb(title)}
        </p>
        <p className="mt-0.5 text-label text-muted">
          {nb(
            t('by', {
              name: session.ownerName ?? t('formerMember'),
              when: formatRelative(new Date(session.at), new Date(), locale),
            }),
          )}
        </p>
      </div>
      {session.ownerUserId === viewerId && (
        <form action={setSessionSharingAction}>
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="partage" value={session.shared ? '0' : '1'} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            icon={session.shared ? EyeOff : Share2}
            aria-label={t(session.shared ? 'makePrivateLabel' : 'shareLabel', { title })}
          >
            {t(session.shared ? 'makePrivate' : 'share')}
          </Button>
        </form>
      )}
    </li>
  );
}

// « Mes sessions sur ce dépôt : partagées / privées » : passées et futures.
function RepoSwitch({ project, shared }: { project: string; shared: boolean }) {
  const t = useTranslations('developers');
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={shared}
      disabled={pending}
      label={t('repoSwitch', { repo: project })}
      onCheckedChange={(on) =>
        start(async () => {
          const data = new FormData();
          data.set('project', project);
          data.set('partage', on ? '1' : '0');
          await setRepoSharingAction(data);
        })
      }
    />
  );
}

export function Developpeurs({ space, viewerId }: { space: DeveloperSpace; viewerId: string }) {
  const t = useTranslations('developers');
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Section title={t('reposSection')} className="mt-0">
        {space.repos.length === 0 ? (
          <EmptyState icon={Code} title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <div className="grid gap-4">
            {space.repos.map((repo) => (
              <GlassCard key={repo.project} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-ui font-semibold text-fg">
                    {nb(repo.project.replace(/^github\.com\//, ''))}
                  </h3>
                  {repo.project.startsWith('github.com/') && (
                    <RepoSwitch project={repo.project} shared={repo.mineShared} />
                  )}
                </div>
                {repo.sessions.length === 0 ? (
                  <p className="mt-3 text-label text-muted">{t('noSessions')}</p>
                ) : (
                  <ul className="mt-2">
                    {repo.sessions.map((session) => (
                      <SessionItem key={session.id} session={session} viewerId={viewerId} />
                    ))}
                  </ul>
                )}
                {repo.notes && (
                  <>
                    <p className="mt-4 text-label font-semibold text-fg-2">{t('notes')}</p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-label text-fg-2">
                      {repo.notes}
                    </pre>
                  </>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </Section>
      {space.privateSessions.length > 0 && (
        <Section title={t('privateSection')} description={t('privateDescription')}>
          <GlassCard className="px-4">
            <ul>
              {space.privateSessions.map((session) => (
                <SessionItem key={session.id} session={session} viewerId={viewerId} />
              ))}
            </ul>
          </GlassCard>
        </Section>
      )}
    </div>
  );
}
