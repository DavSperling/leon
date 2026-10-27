'use client';

import { ExternalLink, GitBranch, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { decideActionAction } from '@/app/(app)/discussions/actions';
import { Button } from '@/components/verre';
import { type ActionView, actionName, actionWarnings } from '@/lib/actions';

// Une action que Leon a proposée pendant sa réponse (lot 7 de la spec GitHub) : ce qu'elle fera exactement (le dépôt,
// les valeurs, le diff d'un fichier), et les deux boutons. Rien n'est fait avant le clic ; la confirmation l'exécute
// avec le compte GitHub de l'utilisateur, puis la carte montre le résultat. Une action déjà décidée (autre onglet,
// page rechargée) s'affiche telle qu'elle est.

type Decision = 'confirmer' | 'annuler';

// Les paramètres que la carte montre en ligne, dans cet ordre ; `body` et `diff` ont leur bloc.
const DETAILS = [
  'asked',
  'title',
  'current',
  'name',
  'state',
  'method',
  'event',
  'reviewers',
  'labels',
  'assignees',
  'message',
  'head',
  'base',
  'draft',
  'failed',
  'lines',
] as const;
const TRANSLATED = ['state', 'method', 'event', 'draft', 'failed'];
const LISTS = ['reviewers', 'labels', 'assignees']; // séparées par « , » dans les paramètres
const DIFF_TONE = { '+': 'text-success', '-': 'text-destructive' } as const;

export function ActionCard({ action }: { action: ActionView }) {
  const t = useTranslations('discussionView.action');
  const [view, setView] = useState(action);
  const [pending, setPending] = useState<Decision | null>(null);
  const [lost, setLost] = useState(false);
  const { kind, params } = view;
  const name = actionName(kind);

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
  // Un commit se lit en 7 caractères ; une liste vide se dit.
  const shown = { ...params, sha: params.sha?.slice(0, 7) ?? '' };
  const details = DETAILS.filter((key) => key in params).map((key) => {
    const value = params[key] ?? '';
    let text = value;
    if (TRANSLATED.includes(key)) text = t(`values.${value}` as 'values.open');
    else if (LISTS.includes(key))
      text = value === '' ? t('values.none') : value.split(',').join(', ');
    return [key, text] as const;
  });

  const warnings = actionWarnings(kind, params);

  // Les lignes d'un diff n'ont pas d'identité : leur rang tient lieu de clé.
  const diffLines = (params.diff ?? '').split('\n').map((line, key) => ({ key, line }));

  return (
    <section
      aria-label={t('label')}
      className="mt-3 rounded-field bg-glass-3 px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]"
    >
      <p className="flex gap-2.5 text-ui text-fg">
        <GitBranch aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-accent" />
        <span className="break-words">{t(`kinds.${name}`, shown)}</span>
      </p>
      {details.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label">
          {details.map(([key, text]) => (
            <div key={key} className="contents">
              <dt className="text-muted">{t(`details.${key}`)}</dt>
              <dd className="break-words text-fg-2">{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {'body' in params && (
        <blockquote className="mt-2 max-h-48 overflow-auto border-l-2 border-line-strong pl-3 text-label whitespace-pre-wrap text-fg-2">
          {params.body || <span className="text-muted">{t('emptyBody')}</span>}
        </blockquote>
      )}
      {kind === 'github.ecrire_fichier' && params.diff === '' && (
        <p className="mt-2 text-label text-muted">{t('newlineOnly')}</p>
      )}
      {params.diff && (
        <>
          <p className="mt-2 text-label text-muted">{t('details.diff')}</p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-field bg-ink px-3 py-2 font-mono text-[12px] leading-5 text-fg-2">
            {diffLines.map(({ key, line }) => (
              <span
                key={key}
                className={`block whitespace-pre ${DIFF_TONE[line[0] as '+' | '-'] ?? ''}`}
              >
                {line}
              </span>
            ))}
          </pre>
        </>
      )}
      {view.status === 'proposee' &&
        warnings.map((warning) => (
          <p key={warning} className="mt-2 flex gap-2 text-label text-warning">
            <TriangleAlert aria-hidden="true" className="mt-[1px] size-3.5 shrink-0" />
            {t(warning)}
          </p>
        ))}
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
            {t(`confirm.${name}`)}
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
