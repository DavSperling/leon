'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type TransitionStartFunction,
  useEffect,
  useReducer,
  useState,
  useTransition,
} from 'react';
import {
  answerQuestionsAction,
  answerUnknownAction,
  discardBrouillonAction,
} from '@/app/(app)/settings/actions';
import { Button, CopyButton, Field, GlassCard, Notice, Textarea, toast } from '@/components/verre';
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
import type { HomeBrouillon, HomeDemande, HomeInconnu } from '@/server/portrait/screen';

// `id` : la ligne écrite par son oui au mail d'un inconnu.
type Done = { ok: true; resteDansGmail?: boolean; id?: string };
type Result = Done | { error: string };

// Un geste sur une ligne de la carte. `done` : ce qui suit un appel réussi. Une ligne qui n'existe plus (répondue ou
// écartée ailleurs) s'en va, avec le mot `goneWord` ; un appel qui échoue (réseau) est une erreur comme une autre, dite
// sur la ligne, qui reste.
function useGesture(onGone: () => void, goneWord: string) {
  const [failed, setFailed] = useState(false);
  const run = (
    start: TransitionStartFunction,
    call: () => Promise<Result>,
    done: (result: Done) => void,
  ) =>
    start(async () => {
      setFailed(false);
      const result = await call().catch((): Result => ({ error: 'echec' }));
      if ('ok' in result) return done(result);
      if (result.error !== 'introuvable') return setFailed(true);
      toast.error(goneWord);
      onGone();
    });
  return { failed, run };
}

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
// Ses réponses envoyées, la demande ne disparaît pas : à sa place, la ligne dit que Leon écrit sa réponse, tant que le
// brouillon n'est pas là (portrait/brouillons.ts), avec « Actualiser » pour le voir arriver et « Écarter » pour la
// fermer tout de suite, y compris quand le brouillon ne vient pas. Elle ne promet pas qu'il arrivera ici : avec déjà
// trois brouillons prêts sur des mails plus récents, il ne s'y montre pas.
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [flow, dispatch] = useReducer(flowReducer, demande.choix, startFlow);
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const { failed, run } = useGesture(onGone, t('gone'));
  const words = `demande-${demande.id}`;
  const ask = `demande-${demande.id}-voir`;
  const panel = `demande-${demande.id}-questions`;
  // Leon écrit : elle a répondu, ici à l'instant ou avant ce chargement de l'Accueil.
  const writing = demande.repondue || sent;

  // Le focus suit ce qui se montre : la première question après « Oui », chaque étape, puis les mots de la ligne quand
  // ses réponses sont parties (le bouton qui l'avait s'en va).
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'étape change ce que porte l'identifiant
  useEffect(() => {
    if (sent) document.getElementById(words)?.focus();
    else if (open) document.getElementById(`${panel}-etape`)?.focus();
  }, [open, sent, flow.step, panel, words]);

  const send = () =>
    run(
      startSending,
      () =>
        answerQuestionsAction({ id: demande.id, reponses: answersOf(demande.choix, flow.picks) }),
      () => setSent(true),
    );
  const discard = () =>
    run(
      startDiscarding,
      () => discardBrouillonAction(demande.id),
      (result) => {
        // Leon écrivait, et son brouillon venait d'être déposé : écarté dans Leon, mais resté dans sa boîte.
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        onGone();
      },
    );

  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(f('errorFailed'))}
        </Notice>
      )}
      <div
        id={words}
        tabIndex={-1}
        className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg outline-none"
      >
        <p className="font-medium">
          {t(writing ? 'writing' : 'needYou', { name: demande.from ?? t('someone') })}
        </p>
        <p className="text-label text-muted">
          <time dateTime={demande.receivedAt.toISOString()}>
            {t('received', { date: formatDate(demande.receivedAt, locale) })}
          </time>
        </p>
      </div>
      <div className="mt-2">
        <SourceThing source={demande.source} />
      </div>
      {writing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="quiet"
            aria-describedby={words}
            disabled={discarding}
            onClick={() => router.refresh()}
          >
            {f('refresh')}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            aria-describedby={words}
            loading={discarding}
            onClick={discard}
          >
            {t('discard')}
          </Button>
        </div>
      ) : (
        <>
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
        </>
      )}
    </li>
  );
}

// Le mail d'un inconnu (quelqu'un à qui elle n'a pas écrit depuis 90 jours), que Leon n'a pas lu : « {name} vous a
// écrit. Voulez-vous une réponse ? », la date du mail reçu, le fil lié à son outil, « Oui » et « Non ». « Non » le
// ferme pour de bon. « Oui » ouvre ses indications, facultatives, puis « Préparer la réponse » : Leon ne lit le mail
// qu'alors, au passage suivant, et la ligne dit qu'il écrit, comme pour des réponses envoyées. « Écarter » est là à
// chaque étape : avant l'envoi, il vaut « Non » ; après, il écarte la ligne de son oui. Rien du mail ne se montre ici.
function Inconnu({
  inconnu,
  max,
  onGone,
}: {
  inconnu: HomeInconnu;
  max: number;
  onGone: () => void;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [indications, setIndications] = useState('');
  // La ligne de son oui, une fois envoyé : Leon écrit.
  const [id, setId] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const { failed, run } = useGesture(onGone, t('gone'));
  const words = `inconnu-${inconnu.mail.sourceId}`;
  const panel = `${words}-indications`;
  const field = `${panel}-champ`;

  // Le focus suit ce qui se montre : ses indications après « Oui », puis les mots de la ligne quand son oui est parti.
  useEffect(() => {
    if (id) document.getElementById(words)?.focus();
    else if (open) document.getElementById(field)?.focus();
  }, [open, id, field, words]);

  const answer = (oui: boolean) =>
    run(
      oui ? startSending : startDiscarding,
      () => answerUnknownAction({ ...inconnu.mail, oui, indications: oui ? indications : '' }),
      (result) => (oui ? setId(result.id ?? null) : onGone()),
    );
  const discard = () =>
    run(
      startDiscarding,
      () => discardBrouillonAction(id ?? ''),
      (result) => {
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        onGone();
      },
    );

  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(f('errorFailed'))}
        </Notice>
      )}
      <div
        id={words}
        tabIndex={-1}
        className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg outline-none"
      >
        <p className="font-medium">{t(id ? 'writing' : 'strangerAsk', { name: inconnu.from })}</p>
        <p className="text-label text-muted">
          <time dateTime={inconnu.receivedAt.toISOString()}>
            {t('received', { date: formatDate(inconnu.receivedAt, locale) })}
          </time>
        </p>
      </div>
      <div className="mt-2">
        <SourceThing source={inconnu.source} />
      </div>
      {id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="quiet"
            aria-describedby={words}
            disabled={discarding}
            onClick={() => router.refresh()}
          >
            {f('refresh')}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            aria-describedby={words}
            loading={discarding}
            onClick={discard}
          >
            {t('discard')}
          </Button>
        </div>
      ) : (
        <>
          {/* « Oui » : la question laisse la place à ses indications. */}
          <div hidden={open} className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="quiet"
              aria-describedby={words}
              disabled={discarding}
              onClick={() => setOpen(true)}
            >
              {t('yes')}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              aria-describedby={words}
              loading={discarding}
              onClick={() => answer(false)}
            >
              {t('no')}
            </Button>
          </div>
          <div id={panel} hidden={!open} className="mt-3 grid gap-3">
            <Field id={field} label={t('instructions')} help={t('instructionsHelp')}>
              <Textarea
                value={indications}
                onChange={(event) => setIndications(event.target.value)}
                maxLength={max}
                rows={2}
                autoGrow
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={discarding}
                loading={sending}
                onClick={() => answer(true)}
              >
                {t('prepare')}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                className="ml-auto"
                aria-describedby={words}
                disabled={sending}
                loading={discarding}
                onClick={() => answer(false)}
              >
                {t('discard')}
              </Button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}

// Un brouillon de réponse prêt : le correspondant, la date du mail reçu, s'il est déposé dans ses brouillons Gmail, le
// fil lié à son outil, puis le texte du brouillon, replié derrière « Voir le brouillon » pour que l'Accueil reste léger,
// « Copier » et « Écarter ». Rien ne part d'ici, et rien ne s'y modifie : elle colle le texte dans sa réponse, ou le
// retrouve dans ses brouillons Gmail quand il y est déposé. « Écarter » le retire aussi de Gmail.
function Pret({ draft, onGone }: { draft: HomeBrouillon; onGone: () => void }) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [discarding, startDiscarding] = useTransition();
  const { failed, run } = useGesture(onGone, t('draftGone'));
  const words = `brouillon-${draft.id}`;
  const panel = `brouillon-${draft.id}-texte`;
  const discard = () =>
    run(
      startDiscarding,
      () => discardBrouillonAction(draft.id),
      (result) => {
        // Écarté dans Leon, mais resté dans sa boîte : elle doit le savoir, il peut encore en partir.
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        else toast.success(t('discarded'));
        onGone();
      },
    );
  return (
    <li className="px-3 py-3.5">
      {failed && (
        <Notice tone="error" live="alert" className="mb-3">
          {nb(f('errorFailed'))}
        </Notice>
      )}
      <div id={words} className="grid gap-1 text-body [overflow-wrap:anywhere] text-fg">
        <p className="font-medium">{t('readyFor', { name: draft.from ?? t('someone') })}</p>
        <p className="text-label text-muted">
          <time dateTime={draft.receivedAt.toISOString()}>
            {t('received', { date: formatDate(draft.receivedAt, locale) })}
          </time>
        </p>
        {draft.depose && <p className="text-label text-muted">{nb(t('deposited'))}</p>}
      </div>
      <div className="mt-2">
        <SourceThing source={draft.source} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="quiet"
          aria-expanded={open}
          aria-controls={panel}
          aria-describedby={words}
          onClick={() => setOpen(!open)}
        >
          {t('seeDraft')}
        </Button>
        <CopyButton value={draft.texte} variant="quiet" aria-describedby={words} />
        <Button
          size="sm"
          variant="quiet"
          loading={discarding}
          aria-describedby={words}
          onClick={discard}
        >
          {t('discard')}
        </Button>
      </div>
      <p
        id={panel}
        hidden={!open}
        className="mt-3 whitespace-pre-wrap text-body [overflow-wrap:anywhere] text-fg"
      >
        {draft.texte}
      </p>
    </li>
  );
}

/**
 * Ce que l'agent « Brouillons de réponse » a pour elle, sur l'Accueil (portrait/brouillons.ts). D'abord les demandes de
 * Leon : quand une information ou une décision lui manque pour répondre à un mail, il pose ses questions ici, tout de
 * suite, au lieu de laisser un blanc dans le brouillon ; ses réponses envoyées, la même ligne dit qu'il écrit. Le mail
 * d'un inconnu y est une demande aussi : veut-elle une réponse ? Puis les brouillons prêts. Trois au plus de chaque sorte, les plus récents d'abord. Écartée, une ligne s'en va sans attendre
 * que l'Accueil soit relu, et le focus va au titre de l'Accueil plutôt que sur <body>. `max` vient du serveur
 * (brouillon-prompt.ts).
 * shortcut: après « Actualiser », la ligne d'une demande dont le brouillon est arrivé, ou celle de son oui à un inconnu
 * (relue comme une demande), s'en va avec le bouton qui avait le focus, comme l'état « Leon construit votre fiche » des
 * réglages ; à reprendre si l'essai au clavier le demande.
 */
export function DraftQuestionsCard({
  demandes,
  prets,
  max,
}: {
  demandes: Array<HomeDemande | HomeInconnu>;
  prets: HomeBrouillon[];
  max: number;
}) {
  const t = useTranslations('draftQuestions');
  // Les lignes parties d'ici, par sorte : une demande et le brouillon qui la suit portent le même identifiant ; le mail
  // d'un inconnu, celui de son fil.
  const [gone, setGone] = useState<string[]>([]);
  const leave = (key: string) => () => {
    document.getElementById(HOME_TITLE_ID)?.focus();
    setGone((keys) => [...keys, key]);
  };
  const keyOf = (one: HomeDemande | HomeInconnu) =>
    'mail' in one ? `inconnu-${one.mail.sourceId}` : `demande-${one.id}`;
  const open = demandes.filter((one) => !gone.includes(keyOf(one)));
  const ready = prets.filter((one) => !gone.includes(`brouillon-${one.id}`));
  if (open.length + ready.length === 0) return null;
  return (
    <GlassCard className="mt-6 max-w-[772px] divide-y divide-line p-1.5">
      {open.length > 0 && (
        <ul aria-label={t('title')} className="divide-y divide-line">
          {open.map((one) =>
            'mail' in one ? (
              <Inconnu key={keyOf(one)} inconnu={one} max={max} onGone={leave(keyOf(one))} />
            ) : (
              <Demande key={keyOf(one)} demande={one} max={max} onGone={leave(keyOf(one))} />
            ),
          )}
        </ul>
      )}
      {ready.length > 0 && (
        <ul aria-label={t('readyTitle')} className="divide-y divide-line">
          {ready.map((draft) => (
            <Pret key={draft.id} draft={draft} onGone={leave(`brouillon-${draft.id}`)} />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
