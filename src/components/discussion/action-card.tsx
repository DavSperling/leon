'use client';

import { ExternalLink, GitBranch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { decideActionAction } from '@/app/(app)/discussions/actions';
import { Button } from '@/components/verre';
import type { ActionView } from '@/lib/actions';

// Une action que Leon a proposée pendant sa réponse (lot 7 de la spec GitHub) : ce qu'elle fera exactement, et les
// deux boutons. Rien n'est fait avant le clic ; la confirmation l'exécute avec le compte GitHub de l'utilisateur,
// puis la carte montre le résultat. Une action déjà décidée (autre onglet, page rechargée) s'affiche telle qu'elle est.

type Decision = 'confirmer' | 'annuler';

export function ActionCard({ action }: { action: ActionView }) {
  const t = useTranslations('discussionView.action');
  const [view, setView] = useState(action);
  const [pending, setPending] = useState<Decision | null>(null);
  const [lost, setLost] = useState(false);
  const { repo, branch, from, sha } = view.params;

  async function decide(decision: Decision) {
    setPending(decision);
    setLost(false);
    const next = await decideActionAction(view.id, decision).catch(() => null);
    setPending(null);
    if (next) setView(next);
    else setLost(true);
  }

  const status =
    view.status === 'proposee'
      ? t('waiting')
      : view.status === 'en-cours'
        ? t('running')
        : view.status === 'faite'
          ? t('done')
          : view.status === 'echouee'
            ? t(`errors.${view.result.error ?? 'echec'}`)
            : view.status === 'annulee'
              ? t('cancelled')
              : t('expired');

  return (
    <section
      aria-label={t('label')}
      className="mt-3 rounded-field bg-glass-3 px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <p className="flex gap-2.5 text-ui text-fg">
        <GitBranch aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-accent" />
        <span className="break-words">
          {t('branch', { branch, repo, from, sha: sha.slice(0, 7) })}
        </span>
      </p>
      {view.status === 'proposee' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={GitBranch}
            loading={pending === 'confirmer'}
            disabled={pending === 'annuler'}
            onClick={() => decide('confirmer')}
          >
            {t('confirm')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={pending === 'annuler'}
            disabled={pending === 'confirmer'}
            onClick={() => decide('annuler')}
          >
            {t('cancel')}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-ui text-fg-2">
        {lost ? t('lost') : status}
        {view.status === 'faite' && view.result.url && (
          <>
            {' '}
            <a
              href={view.result.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
            >
              {t('open')}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </>
        )}
      </p>
    </section>
  );
}
