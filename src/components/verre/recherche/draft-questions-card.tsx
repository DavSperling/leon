'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type TransitionStartFunction, useState, useTransition } from 'react';
import { answerQuestionsAction, discardBrouillonAction } from '@/app/(app)/settings/actions';
import { Button, Field, GlassCard, Notice, Textarea, toast } from '@/components/verre';
import { HOME_TITLE_ID } from '@/components/verre/discussions/about-suggestion-card';
import { SourceThing } from '@/components/verre/reglages/source-thing';
import { formatDate } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { HomeDemande } from '@/server/portrait/screen';

type Result = { ok: true } | { error: string };

// Une demande de Leon : le correspondant, la date du mail reçu, le fil lié à son outil, puis « Voulez-vous voir mes
// questions ? ». « Oui » les ouvre, un champ par question, qu'elle peut laisser vide ; « Non » écarte la demande, comme
// « Écarter » un brouillon. Rien ne part d'ici : ses réponses servent à écrire le brouillon, qu'elle relira.
function Demande({
  demande,
  max,
  onGone,
}: {
  demande: HomeDemande;
  max: number;
  onGone: () => void;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState(() => demande.questions.map(() => ''));
  const [failed, setFailed] = useState(false);
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const words = `demande-${demande.id}`;
  const ask = `demande-${demande.id}-voir`;
  const panel = `demande-${demande.id}-questions`;

  // `done` : le mot d'après, quand il y en a un. Une demande qui n'est plus ouverte (répondue ou écartée ailleurs) s'en
  // va aussi ; un appel qui échoue (réseau) est une erreur comme une autre, et la demande reste.
  const run = (start: TransitionStartFunction, call: () => Promise<Result>, done?: string) =>
    start(async () => {
      setFailed(false);
      const result = await call().catch((): Result => ({ error: 'echec' }));
      if ('error' in result && result.error !== 'introuvable') return setFailed(true);
      if ('error' in result) toast.error(t('gone'));
      else if (done) toast.success(done);
      onGone();
    });
  const send = () =>
    run(
      startSending,
      () => answerQuestionsAction({ id: demande.id, reponses: answers }),
      t('sent'),
    );
  const discard = () => run(startDiscarding, () => discardBrouillonAction(demande.id));

  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(f('errorFailed'))}
        </Notice>
      )}
      <div id={words} className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg">
        <p className="font-medium">{t('needYou', { name: demande.from ?? t('someone') })}</p>
        <p className="text-label text-muted">
          <time dateTime={demande.receivedAt.toISOString()}>
            {f('draftReceived', { date: formatDate(demande.receivedAt, locale) })}
          </time>
        </p>
      </div>
      <div className="mt-2">
        <SourceThing source={demande.source} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p id={ask} className="mr-1 text-body text-fg">
          {t('ask')}
        </p>
        <Button
          size="sm"
          variant="quiet"
          aria-expanded={open}
          aria-controls={panel}
          aria-describedby={`${ask} ${words}`}
          disabled={sending || discarding}
          onClick={() => setOpen(!open)}
        >
          {t('yes')}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          aria-describedby={`${ask} ${words}`}
          disabled={sending}
          loading={discarding}
          onClick={discard}
        >
          {t('no')}
        </Button>
      </div>
      <form
        id={panel}
        hidden={!open}
        aria-labelledby={words}
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending && !discarding) send();
        }}
        className="mt-3 grid gap-4"
      >
        {demande.questions.map((question, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: les questions d'une demande ne changent pas, dans l'ordre
          <Field key={index} label={question}>
            <Textarea
              value={answers[index]}
              onChange={(event) =>
                setAnswers((all) => all.map((one, i) => (i === index ? event.target.value : one)))
              }
              maxLength={max}
              rows={2}
              autoGrow
            />
          </Field>
        ))}
        <div>
          <Button type="submit" variant="primary" disabled={discarding} loading={sending}>
            {t('send')}
          </Button>
        </div>
      </form>
    </li>
  );
}

/**
 * Les demandes de Leon sur l'Accueil : quand une information ou une décision lui manque pour répondre à un mail, il pose
 * ses questions ici, tout de suite, au lieu de laisser un blanc dans le brouillon (portrait/brouillons.ts). Trois au
 * plus, la plus récente d'abord. Répondue ou écartée, une demande s'en va sans attendre que l'Accueil soit relu, et un
 * mot dit où trouver le brouillon. `max` vient du serveur (brouillon-prompt.ts). Le focus ne tombe jamais sur <body> :
 * il va au titre de l'Accueil quand une demande part.
 */
export function DraftQuestionsCard({ demandes, max }: { demandes: HomeDemande[]; max: number }) {
  const t = useTranslations('draftQuestions');
  const [gone, setGone] = useState<string[]>([]);
  const open = demandes.filter((one) => !gone.includes(one.id));
  if (open.length === 0) return null;
  return (
    <GlassCard className="mt-6 max-w-[772px] p-1.5">
      <ul aria-label={t('title')} className="divide-y divide-line">
        {open.map((demande) => (
          <Demande
            key={demande.id}
            demande={demande}
            max={max}
            onGone={() => {
              document.getElementById(HOME_TITLE_ID)?.focus();
              setGone((ids) => [...ids, demande.id]);
            }}
          />
        ))}
      </ul>
    </GlassCard>
  );
}
