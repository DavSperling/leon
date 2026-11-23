'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type TransitionStartFunction,
  useEffect,
  useReducer,
  useState,
  useTransition,
} from 'react';
import { answerQuestionsAction, discardBrouillonAction } from '@/app/(app)/settings/actions';
import { Button, GlassCard, Notice, Textarea, toast } from '@/components/verre';
import { HOME_TITLE_ID } from '@/components/verre/discussions/about-suggestion-card';
import { SourceThing } from '@/components/verre/reglages/source-thing';
import {
  answersOf,
  type Flow,
  type FlowAction,
  flowReducer,
  OTHER,
  startFlow,
} from '@/lib/draft-questions';
import { formatDate } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { HomeDemande } from '@/server/portrait/screen';

type Result = { ok: true } | { error: string };

const RADIO = 'mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--ink)]';
const CHOICE = 'flex cursor-pointer items-start gap-2.5 text-body [overflow-wrap:anywhere] text-fg';

/**
 * Les questions d'une demande, une par une, comme Claude pose les siennes : la question et sa place, ses choix en
 * boutons radio (un seul se retient), et « Autre », qui ouvre un texte libre. « Suivant » passe à la suivante, même
 * sans réponse ; après la dernière, le récapitulatif de ses réponses, chacune à modifier en revenant à sa question, puis
 * « Envoyer mes réponses ». « Écarter » ferme la demande pour de bon, à tout moment. L'état est celui de
 * lib/draft-questions.ts : ici, rien que son dessin. Pas de formulaire : « Entrée » sur un choix n'envoie rien.
 */
export function Questions({
  id,
  words,
  demande,
  flow,
  dispatch,
  max,
  hidden,
  sending,
  discarding,
  onSend,
  onDiscard,
}: {
  // L'identifiant du panneau, et celui des mots de la demande, que ses boutons rappellent.
  id: string;
  words: string;
  demande: Pick<HomeDemande, 'questions' | 'choix'>;
  flow: Flow;
  dispatch: Dispatch<FlowAction>;
  max: number;
  hidden?: boolean;
  sending?: boolean;
  discarding?: boolean;
  onSend: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations('draftQuestions');
  const c = useTranslations('common');
  const { questions, choix } = demande;
  // Ce qui prend le focus quand l'étape change : la question montrée, ou le titre du récapitulatif.
  const shown = `${id}-etape`;
  const recap = flow.step >= questions.length;
  const pick = flow.picks[flow.step];
  const choices = choix[flow.step] ?? [];
  const answers = answersOf(choix, flow.picks);

  return (
    <div id={id} hidden={hidden} className="mt-3 grid gap-3">
      {recap || !pick ? (
        <div className="grid gap-3">
          <p id={shown} tabIndex={-1} className="text-body font-medium text-fg outline-none">
            {t('recap')}
          </p>
          <ol className="grid gap-3">
            {questions.map((question, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: les questions d'une demande ne changent pas, dans l'ordre
              <li key={index} className="grid justify-items-start gap-1 [overflow-wrap:anywhere]">
                <p id={`${id}-question-${index}`} className="text-label text-muted">
                  {question}
                </p>
                <p className="whitespace-pre-wrap text-body text-fg">
                  {answers[index] || <span className="text-muted">{t('noAnswer')}</span>}
                </p>
                <Button
                  size="xs"
                  variant="quiet"
                  className="-ml-3"
                  aria-describedby={`${id}-question-${index}`}
                  disabled={sending || discarding}
                  onClick={() => dispatch({ type: 'goto', step: index })}
                >
                  {t('change')}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <fieldset
          // Une autre question : un autre groupe, qui prend le focus.
          key={flow.step}
          id={shown}
          tabIndex={-1}
          className="m-0 grid min-w-0 gap-2.5 border-0 p-0 outline-none"
        >
          <legend className="mb-2.5 grid gap-1 p-0">
            <span className="text-label text-muted">
              {t('position', { n: flow.step + 1, total: questions.length })}
            </span>
            <span className="text-body font-medium [overflow-wrap:anywhere] text-fg">
              {questions[flow.step]}
            </span>
          </legend>
          {choices.map((choice, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: les choix d'une question ne changent pas, dans l'ordre
            <label key={index} className={CHOICE}>
              <input
                type="radio"
                name={shown}
                className={RADIO}
                checked={pick.choice === index}
                onChange={() => dispatch({ type: 'pick', choice: index })}
              />
              {choice}
            </label>
          ))}
          {/* Sans choix (une demande posée avant eux), le texte libre seul. */}
          {choices.length > 0 && (
            <label className={CHOICE}>
              <input
                type="radio"
                name={shown}
                className={RADIO}
                checked={pick.choice === OTHER}
                onChange={() => dispatch({ type: 'pick', choice: OTHER })}
              />
              {t('other')}
            </label>
          )}
          {pick.choice === OTHER && (
            <Textarea
              aria-label={t('otherAnswer')}
              value={pick.text}
              onChange={(event) => dispatch({ type: 'write', text: event.target.value })}
              maxLength={max}
              rows={2}
              autoGrow
            />
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {flow.step > 0 && (
          <Button
            size="sm"
            variant="quiet"
            disabled={sending || discarding}
            onClick={() => dispatch({ type: 'previous' })}
          >
            {c('previous')}
          </Button>
        )}
        {recap ? (
          <Button
            size="sm"
            variant="primary"
            disabled={discarding}
            loading={sending}
            onClick={onSend}
          >
            {t('send')}
          </Button>
        ) : (
          <Button size="sm" disabled={discarding} onClick={() => dispatch({ type: 'next' })}>
            {c('next')}
          </Button>
        )}
        <Button
          size="sm"
          variant="quiet"
          className="ml-auto"
          aria-describedby={words}
          disabled={sending}
          loading={discarding}
          onClick={onDiscard}
        >
          {t('discard')}
        </Button>
      </div>
    </div>
  );
}

// Une demande de Leon : le correspondant, la date du mail reçu, le fil lié à son outil, puis « Voulez-vous voir mes
// questions ? ». « Oui » les ouvre, une par une ; « Non » écarte la demande, comme « Écarter » un brouillon. Rien ne
// part d'ici : ses réponses servent à écrire le brouillon, qu'elle relira.
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
  const [flow, dispatch] = useReducer(flowReducer, demande.choix, startFlow);
  const [failed, setFailed] = useState(false);
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const words = `demande-${demande.id}`;
  const ask = `demande-${demande.id}-voir`;
  const panel = `demande-${demande.id}-questions`;

  // Le focus suit ce qui se montre : la première question après « Oui », puis chaque étape.
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'étape change ce que porte l'identifiant
  useEffect(() => {
    if (open) document.getElementById(`${panel}-etape`)?.focus();
  }, [open, flow.step, panel]);

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
      () =>
        answerQuestionsAction({ id: demande.id, reponses: answersOf(demande.choix, flow.picks) }),
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
      {/* « Oui » : la question posée laisse la place aux siennes. */}
      <div hidden={open} className="mt-3 flex flex-wrap items-center gap-2">
        <p id={ask} className="mr-1 text-body text-fg">
          {t('ask')}
        </p>
        <Button
          size="sm"
          variant="quiet"
          aria-describedby={`${ask} ${words}`}
          disabled={discarding}
          onClick={() => setOpen(true)}
        >
          {t('yes')}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          aria-describedby={`${ask} ${words}`}
          loading={discarding}
          onClick={discard}
        >
          {t('no')}
        </Button>
      </div>
      <Questions
        id={panel}
        words={words}
        demande={demande}
        flow={flow}
        dispatch={dispatch}
        max={max}
        hidden={!open}
        sending={sending}
        discarding={discarding}
        onSend={send}
        onDiscard={discard}
      />
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
