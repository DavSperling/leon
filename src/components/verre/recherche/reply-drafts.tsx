'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type TransitionStartFunction,
  useEffect,
  useId,
  useReducer,
  useState,
  useTransition,
} from 'react';
import {
  answerQuestionsAction,
  answerUnknownAction,
  discardBrouillonAction,
} from '@/app/(app)/settings/actions';
import {
  Button,
  CopyButton,
  Field,
  Notice,
  PanelClose,
  PanelDone,
  SidePanel,
  Textarea,
  Thing,
  toast,
} from '@/components/verre';
import { SourceThing } from '@/components/verre/reglages/source-thing';
import {
  answersOf,
  type Flow,
  type FlowAction,
  flowReducer,
  OTHER,
  startFlow,
} from '@/lib/draft-questions';
import {
  CLOSED,
  confirmsDiscard,
  countsOf,
  type PanelMail,
  panelMails,
  panelReducer,
  shownIndex,
} from '@/lib/reply-drafts';
import { formatDate } from '@/lib/verre';
import { nb } from '@/lib/verre/nb';
import type { HomeBrouillon, HomeDemande, HomeInconnu } from '@/server/portrait/screen';

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
  sending,
  discarding,
  onSend,
  onDiscard,
}: {
  // L'identifiant des questions, et celui de l'en-tête du mail, que ses boutons rappellent.
  id: string;
  words: string;
  demande: Pick<HomeDemande, 'questions' | 'choix'>;
  flow: Flow;
  dispatch: Dispatch<FlowAction>;
  max: number;
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
    <div id={id} className="grid gap-3">
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
                  size="sm"
                  variant="quiet"
                  className="-ml-3.5"
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

// Ses réponses aux questions de Leon, une à la fois : l'état de lib/draft-questions.ts, gardé tant que le panneau est
// ouvert, même quand elle va voir un autre mail. Aller d'une question à l'autre porte le focus à la question montrée.
function Asked({
  demande,
  words,
  max,
  sending,
  discarding,
  onAnswers,
  onDiscard,
}: {
  demande: HomeDemande;
  words: string;
  max: number;
  sending?: boolean;
  discarding?: boolean;
  onAnswers: (reponses: string[]) => void;
  onDiscard: () => void;
}) {
  const [flow, dispatch] = useReducer(flowReducer, demande.choix, startFlow);
  const [moved, setMoved] = useState(false);
  const panel = `${words}-questions`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'étape change ce que porte l'identifiant
  useEffect(() => {
    if (moved) document.getElementById(`${panel}-etape`)?.focus();
  }, [moved, flow.step, panel]);
  return (
    <Questions
      id={panel}
      words={words}
      demande={demande}
      flow={flow}
      dispatch={(action) => {
        // Choisir ou écrire laisse le focus où il est.
        if (action.type !== 'pick' && action.type !== 'write') setMoved(true);
        dispatch(action);
      }}
      max={max}
      sending={sending}
      discarding={discarding}
      onSend={() => onAnswers(answersOf(demande.choix, flow.picks))}
      onDiscard={onDiscard}
    />
  );
}

// Le mail d'un inconnu (quelqu'un à qui elle n'a pas écrit depuis 90 jours), que Leon n'a pas lu : « Voulez-vous une
// réponse ? », « Oui » et « Non ». « Non » le ferme pour de bon. « Oui » ouvre ses indications, facultatives, puis
// « Préparer la réponse » : Leon ne lit le mail qu'alors, au passage suivant. « Écarter » y vaut « Non ». Rien du mail
// ne se montre ici.
function Unknown({
  words,
  max,
  sending,
  discarding,
  onUnknown,
}: {
  words: string;
  max: number;
  sending?: boolean;
  discarding?: boolean;
  onUnknown: (oui: boolean, indications: string) => void;
}) {
  const t = useTranslations('draftQuestions');
  const [open, setOpen] = useState(false);
  const [indications, setIndications] = useState('');
  const ask = `${words}-voir`;
  const panel = `${words}-indications`;
  const field = `${panel}-champ`;
  // « Oui » : la question laisse la place à ses indications, qui prennent le focus.
  useEffect(() => {
    if (open) document.getElementById(field)?.focus();
  }, [open, field]);
  return (
    <>
      <div hidden={open} className="flex flex-wrap items-center gap-2">
        <p id={ask} className="mr-1 text-body text-fg">
          {nb(t('strangerAsk'))}
        </p>
        <Button
          size="sm"
          aria-describedby={`${ask} ${words}`}
          disabled={discarding}
          onClick={() => setOpen(true)}
        >
          {t('yes')}
        </Button>
        <Button
          size="sm"
          aria-describedby={`${ask} ${words}`}
          loading={discarding}
          onClick={() => onUnknown(false, '')}
        >
          {t('no')}
        </Button>
      </div>
      <div id={panel} hidden={!open} className="grid gap-3">
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
            onClick={() => onUnknown(true, indications)}
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
            onClick={() => onUnknown(false, '')}
          >
            {t('discard')}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Un mail du panneau : son en-tête (le correspondant, la date du mail reçu, le fil lié à son outil), puis ce qu'il
 * attend. Des questions : une à la fois, puis le récapitulatif et « Envoyer mes réponses ». Le mail d'un inconnu :
 * « Voulez-vous une réponse ? ». Un brouillon prêt : son texte, tel quel, s'il est déposé dans ses brouillons Gmail,
 * « Copier » et « Écarter » ; rien ne s'y modifie, et rien ne part d'ici. Une réponse que Leon écrit : la phrase qui le
 * dit, « Actualiser » pour voir arriver le brouillon, et « Écarter ». L'en-tête prend le focus quand le mail se montre,
 * et ses gestes le rappellent ; ce qu'ils font, c'est le panneau qui le tient (ReplyDrafts).
 */
export function MailView({
  mail,
  place,
  hidden,
  max,
  failed,
  sending,
  discarding,
  onAnswers,
  onUnknown,
  onDiscard,
  onRefresh,
}: {
  mail: PanelMail;
  // L'identifiant de sa place (« Mail 2 sur 4 », sous le titre du panneau), que l'en-tête rappelle.
  place?: string;
  hidden?: boolean;
  max: number;
  failed?: boolean;
  sending?: boolean;
  discarding?: boolean;
  onAnswers: (reponses: string[]) => void;
  onUnknown: (oui: boolean, indications: string) => void;
  onDiscard: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const words = mail.key;
  const { from, receivedAt, source } = mail.mail;
  return (
    <div hidden={hidden}>
      {failed && (
        <Notice tone="error" live="alert" className="mb-4">
          {nb(f('errorFailed'))}
        </Notice>
      )}
      <div
        id={words}
        tabIndex={-1}
        data-autofocus={hidden ? undefined : ''}
        // Leon l'écrit : l'en-tête, qui reprend le focus après l'envoi, le dit aussi.
        aria-describedby={mail.sorte === 'ecrit' ? `${place ?? ''} ${words}-ecrit` : place}
        className="grid gap-1 [overflow-wrap:anywhere] text-fg outline-none"
      >
        <h3 className="text-lead font-semibold">{from ?? t('someone')}</h3>
        <p className="text-label text-muted">
          <time dateTime={receivedAt.toISOString()}>
            {t('received', { date: formatDate(receivedAt, locale) })}
          </time>
        </p>
      </div>
      <div className="mt-3">
        <SourceThing source={source} />
      </div>
      <div className="mt-6">
        {mail.sorte === 'questions' ? (
          <Asked
            demande={mail.mail}
            words={words}
            max={max}
            sending={sending}
            discarding={discarding}
            onAnswers={onAnswers}
            onDiscard={onDiscard}
          />
        ) : mail.sorte === 'inconnu' ? (
          <Unknown
            words={words}
            max={max}
            sending={sending}
            discarding={discarding}
            onUnknown={onUnknown}
          />
        ) : mail.sorte === 'pret' ? (
          <div className="grid gap-3">
            <p className="text-label text-muted">{t('ready')}</p>
            <p className="whitespace-pre-wrap rounded-item border border-line bg-glass-3 px-4 py-3 text-body [overflow-wrap:anywhere] text-fg">
              {mail.mail.texte}
            </p>
            {mail.mail.depose && <p className="text-label text-muted">{nb(t('deposited'))}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={mail.mail.texte} aria-describedby={words} />
              <Button
                id={`${words}-ecarter`}
                size="sm"
                variant="quiet"
                className="ml-auto"
                aria-describedby={words}
                loading={discarding}
                onClick={onDiscard}
              >
                {t('discard')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {/* En cours : le trait ambre du kit passe une fois sous les mots. */}
            <p id={`${words}-ecrit`} className="text-body text-fg">
              <span className="mark is-working">{t('writing')}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" aria-describedby={words} disabled={discarding} onClick={onRefresh}>
                {f('refresh')}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                className="ml-auto"
                aria-describedby={words}
                loading={discarding}
                onClick={onDiscard}
              >
                {t('discard')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Un geste réussi : `id`, la ligne écrite par son oui au mail d'un inconnu ; `resteDansGmail`, un brouillon écarté que
// Leon n'a pas pu retirer de Gmail.
type Done = { ok: true; resteDansGmail?: boolean; id?: string };
type Result = Done | { error: string };

/**
 * Ce que l'agent « Brouillons de réponse » a pour elle (portrait/brouillons.ts), sur l'Accueil : une seule ligne, sous
 * le bonjour, qui l'appelle par son prénom et compte ce qui l'attend ; rien quand rien ne l'attend. Toute la ligne
 * ouvre le panneau, qui montre ce qui attend mail par mail, dans l'ordre de lib/reply-drafts.ts, avec sa place,
 * « Mail précédent » et « Mail suivant ». Un geste qui clôt un mail (ses réponses envoyées, son oui avec ses
 * indications, son non, « Écarter ») passe au suivant sans attendre que l'Accueil soit relu, et la ligne se met à jour ;
 * plus rien, le panneau le dit. Le focus va à l'en-tête du mail montré ; le panneau fermé, il revient à la ligne, ou au
 * contenu de la page quand elle est partie (le repli du kit). Rien ne part d'ici. `max` vient du serveur
 * (brouillon-prompt.ts).
 */
export function ReplyDrafts({
  name,
  demandes,
  prets,
  max,
}: {
  // Son prénom, celui du bonjour.
  name: string | null;
  demandes: Array<HomeDemande | HomeInconnu>;
  prets: HomeBrouillon[];
  max: number;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const c = useTranslations('common');
  const router = useRouter();
  const place = useId();
  const doneId = useId();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, dispatch] = useReducer(panelReducer, CLOSED);
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const working = sending || discarding;
  const mails = panelMails(demandes, prets, panel.done, panel.order);
  const index = shownIndex(mails, panel.at);
  const shown = mails[index];
  const counts = countsOf(mails);

  // Le mail montré change (« Mail suivant », un geste, un brouillon arrivé) : son en-tête prend le focus ; plus rien,
  // « Terminé ». Pendant un geste, le corps du panneau est figé : le focus attend la fin.
  const target = shown?.key ?? doneId;
  useEffect(() => {
    if (!working) document.getElementById(target)?.focus();
  }, [target, working]);

  const show = (at: number) => {
    setFailed(false);
    dispatch({ type: 'show', id: mails[at]?.id ?? '' });
  };
  // Un geste qui clôt le mail montré. Réussi, `after` dit ce qui en reste (la ligne où Leon écrit) ou rien, et le
  // panneau passe au suivant. Un mail qui n'existe plus (répondu ou écarté ailleurs) s'en va aussi, avec `goneWord` ;
  // un appel qui échoue (réseau) est dit sur le mail, qui reste.
  const close = (
    mail: PanelMail,
    start: TransitionStartFunction,
    call: () => Promise<Result>,
    after: (result: Done) => string | null,
    goneWord = t('gone'),
  ) =>
    start(async () => {
      setFailed(false);
      const result = await call().catch((): Result => ({ error: 'echec' }));
      if ('error' in result && result.error !== 'introuvable') return setFailed(true);
      if ('error' in result) toast.error(goneWord);
      setAsking(false);
      dispatch({ type: 'close', mails, key: mail.key, id: 'ok' in result ? after(result) : null });
    });
  // Leon l'écrit : le mail garde sa place, et le panneau passe au suivant ; ce qui ne se voit plus se dit.
  const writes = (id: string) => {
    if (mails[index + 1]) toast.success(t('writing'));
    return id;
  };
  const discard = (mail: PanelMail) =>
    close(
      mail,
      startDiscarding,
      () => discardBrouillonAction(mail.id),
      (result) => {
        // Écarté dans Leon, mais resté dans sa boîte : elle doit le savoir, il peut encore en partir.
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        else if (mail.sorte === 'pret') toast.success(t('discarded'));
        return null;
      },
      mail.sorte === 'pret' ? t('draftGone') : t('gone'),
    );
  const gestures = (mail: PanelMail) => ({
    onAnswers: (reponses: string[]) =>
      close(
        mail,
        startSending,
        () => answerQuestionsAction({ id: mail.id, reponses }),
        () => writes(mail.id),
      ),
    onUnknown: (oui: boolean, indications: string) => {
      if (mail.sorte !== 'inconnu') return;
      close(
        mail,
        oui ? startSending : startDiscarding,
        () => answerUnknownAction({ ...mail.mail.mail, oui, indications: oui ? indications : '' }),
        (result) => (oui && result.id ? writes(result.id) : null),
      );
    },
    // Un brouillon déposé dans Gmail en sera supprimé pour de bon : le panneau demande d'abord.
    // shortcut: un mail où Leon écrit est celui de l'Accueil chargé ; si son brouillon a été déposé depuis,
    // « Écarter » le retire de Gmail sans demander (son geste vise cette réponse). Une garde dans
    // discardBrouillonAction le jour où ça se voit.
    onDiscard: () => (confirmsDiscard(mail) ? setAsking(true) : discard(mail)),
    onRefresh: () => router.refresh(),
  });

  // Le titre de la ligne : ce qui attend un geste d'elle d'abord, sinon ses brouillons prêts, sinon ce que Leon écrit.
  const kind = counts.toComplete > 0 ? 'questions' : counts.ready > 0 ? 'ready' : 'writing';
  const count = kind === 'ready' ? counts.ready : counts.writing;
  const title = name ? t(`line.${kind}`, { name, count }) : t(`lineAnon.${kind}`, { count });
  const summary = [
    counts.toComplete > 0 && t('count.toComplete', { count: counts.toComplete }),
    counts.ready > 0 && t('count.ready', { count: counts.ready }),
    counts.writing > 0 && t('count.writing', { count: counts.writing }),
  ]
    .filter(Boolean)
    .join(' · ');
  const hasPrevious = shown && index > 0;
  const hasNext = shown && index < mails.length - 1;

  return (
    <>
      {mails.length > 0 && (
        <Thing
          size="card"
          wrap
          name={nb(title)}
          // au téléphone, le titre et le compte passent à la ligne plutôt que d'être coupés : la carte grandit
          caption={<span className="whitespace-normal">{summary}</span>}
          label={`${title} ${summary}`}
          aria-haspopup="dialog"
          className="mt-6 h-auto min-h-[88px] max-w-[772px] py-3"
          onClick={() => {
            setFailed(false);
            dispatch({
              type: 'open',
              keys: panelMails(demandes, prets, panel.done).map((one) => one.key),
            });
            setOpen(true);
          }}
        />
      )}
      <SidePanel
        open={open}
        onOpenChange={(next) => {
          if (working) return;
          setAsking(false);
          setOpen(next);
        }}
        title={f('agents.brouillon-reponse.name')}
        sub={
          shown && (
            <span id={place} className="tabular-nums">
              {t('mail', { n: index + 1, total: mails.length })}
            </span>
          )
        }
        busy={working}
        confirm={
          asking && shown
            ? {
                title: t('confirmDiscard'),
                text: t('confirmDiscardText'),
                yes: t('discard'),
                no: t('keep'),
                busy: discarding,
                onYes: () => discard(shown),
                onNo: () => {
                  setAsking(false);
                  // « Garder » : le focus revient à « Écarter », qui avait demandé
                  document.getElementById(`${shown.key}-ecarter`)?.focus();
                },
              }
            : null
        }
        foot={
          hasPrevious || hasNext ? (
            <>
              {hasPrevious && (
                <Button
                  variant="quiet"
                  className="-ml-4"
                  disabled={working}
                  onClick={() => show(index - 1)}
                >
                  {t('previousMail')}
                </Button>
              )}
              {hasNext && (
                <Button
                  variant="quiet"
                  className="ml-auto"
                  disabled={working}
                  onClick={() => show(index + 1)}
                >
                  {t('nextMail')}
                </Button>
              )}
            </>
          ) : (
            <PanelClose asChild>
              <Button id={doneId} className="ml-auto">
                {c('done')}
              </Button>
            </PanelClose>
          )
        }
      >
        {shown ? (
          mails.map((mail, at) => (
            <MailView
              key={mail.key}
              mail={mail}
              place={at === index ? place : undefined}
              hidden={at !== index}
              max={max}
              failed={at === index && failed}
              sending={at === index && sending}
              discarding={at === index && discarding}
              {...gestures(mail)}
            />
          ))
        ) : (
          <PanelDone title={t('allDone')} />
        )}
      </SidePanel>
    </>
  );
}
