'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type ReactNode,
  type TransitionStartFunction,
  useEffect,
  useId,
  useReducer,
  useState,
  useTransition,
} from 'react';
import {
  answerPreferenceAction,
  answerQuestionsAction,
  answerRelanceAction,
  discardBrouillonAction,
  sendBrouillonAction,
  trashMailAction,
} from '@/app/(app)/settings/actions';
import type { SourceKind } from '@/capture/turn';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  Notice,
  PanelClose,
  PanelDone,
  SidePanel,
  Textarea,
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
import { SOURCE_KIND_LABELS } from '@/lib/labels';
import {
  type Asking,
  askingFor,
  CLOSED,
  canTrash,
  confirmsDiscard,
  countsOf,
  isRelance,
  type PanelMail,
  panelMails,
  panelReducer,
  sendAlwaysAsks,
  sendQuestion,
  shownIndex,
} from '@/lib/reply-drafts';
import { formatDate } from '@/lib/verre';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type {
  HomeBrouillon,
  HomeDemande,
  HomePreference,
  HomeRelance,
} from '@/server/portrait/screen';

const RADIO = 'mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--ink)]';
// Un choix : une tuile qu'on clique en entier ; la choisie prend le trait d'encre.
const CHOICE =
  'flex min-h-12 cursor-pointer items-start gap-3 rounded-item border border-line bg-sheet px-4 py-3 text-body [overflow-wrap:anywhere] text-fg transition-colors duration-150 hover:border-line-strong hover:bg-hover has-[:checked]:border-ink has-[:checked]:bg-selected';

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
          <legend className="mb-3 grid gap-1.5 p-0">
            <span className="text-label text-muted">
              {t('position', { n: flow.step + 1, total: questions.length })}
            </span>
            <span className="text-head font-semibold tracking-[-0.015em] text-balance [overflow-wrap:anywhere] text-fg">
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
          {/* « Autre » : son texte s'écrit dans sa tuile, qui s'ouvre quand on la choisit. */}
          {choices.length > 0 ? (
            <div className={cn(CHOICE, 'flex-wrap')}>
              <label className="flex flex-1 cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name={shown}
                  className={RADIO}
                  checked={pick.choice === OTHER}
                  onChange={() => dispatch({ type: 'pick', choice: OTHER })}
                />
                {t('other')}
              </label>
              {pick.choice === OTHER && (
                <Textarea
                  aria-label={t('otherAnswer')}
                  className="basis-full"
                  value={pick.text}
                  onChange={(event) => dispatch({ type: 'write', text: event.target.value })}
                  maxLength={max}
                  rows={2}
                  autoGrow
                  autoFocus
                />
              )}
            </div>
          ) : (
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
          <Button
            size="sm"
            variant="primary"
            disabled={discarding}
            onClick={() => dispatch({ type: 'next' })}
          >
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
  kept,
  onKeep,
  onAnswers,
  onDiscard,
}: {
  demande: HomeDemande;
  words: string;
  max: number;
  sending?: boolean;
  discarding?: boolean;
  // Ses réponses gardées par le panneau : elles survivent à sa fermeture (un clic à côté ne les perd pas). Sans
  // elles, le mail garde les siennes tant qu'il est monté.
  kept?: Flow;
  onKeep?: Dispatch<FlowAction>;
  onAnswers: (reponses: string[]) => void;
  onDiscard: () => void;
}) {
  const [own, ownDispatch] = useReducer(flowReducer, demande.choix, startFlow);
  const flow = kept ?? own;
  const dispatch = onKeep ?? ownDispatch;
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

// Son mail resté sans réponse, que Leon n'a pas lu : « Voulez-vous une relance ? », ses indications, facultatives, puis
// « Préparer la relance » ou « Non », sur le même écran. Leon ne lit le mail qu'après « Préparer », au passage suivant ;
// « Non » le ferme pour de bon. Rien du mail ne se montre ici.
function Relance({
  words,
  max,
  sending,
  discarding,
  onRelance,
}: {
  words: string;
  max: number;
  sending?: boolean;
  discarding?: boolean;
  onRelance: (oui: boolean, indications: string) => void;
}) {
  const t = useTranslations('draftQuestions');
  const [indications, setIndications] = useState('');
  const ask = `${words}-voir`;
  return (
    <div className="grid gap-3">
      <p id={ask} className="text-lead font-medium text-fg">
        {nb(t('relanceAsk'))}
      </p>
      <Field label={t('instructions')} help={t('relanceInstructionsHelp')}>
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
          aria-describedby={`${ask} ${words}`}
          disabled={discarding}
          loading={sending}
          onClick={() => onRelance(true, indications)}
        >
          {t('relancePrepare')}
        </Button>
        <Button
          size="sm"
          aria-describedby={`${ask} ${words}`}
          disabled={sending}
          loading={discarding}
          onClick={() => onRelance(false, '')}
        >
          {t('no')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Un mail du panneau : son en-tête (le correspondant, la date du mail reçu, le fil lié à son outil), puis ce qu'il
 * attend. Des questions : une à la fois, puis le récapitulatif et « Envoyer mes réponses ». Un mail reçu relevé par
 * Gmail se supprime d'ici (« Supprimer le mail » : il part à la corbeille de sa boîte, après confirmation). Son mail
 * resté sans réponse : l'en-tête le dit (« Votre mail à Léa est resté sans
 * réponse. », « Envoyé le … »), puis « Voulez-vous une relance ? » ; ce qui suit une relance (ses questions, Leon qui
 * l'écrit, la relance prête) nomme son destinataire, avec « Envoyé le ». Une préférence d'écriture tirée de sa
 * retouche : l'en-tête dit la retouche remarquée, puis la préférence, telle quelle, et « Dois-je en tenir compte pour
 * vos prochains brouillons ? », « Oui » et « Non ».
 * Un brouillon prêt : son texte, tel quel, s'il est déposé dans ses brouillons Gmail, « Copier » et « Écarter » ; rien ne
 * s'y modifie, et rien ne part d'ici. Une réponse que Leon écrit : la phrase qui le dit, « Actualiser » pour voir
 * arriver le brouillon, et « Écarter ». L'en-tête prend le focus quand le mail se montre, et ses gestes le rappellent ;
 * ce qu'ils font, c'est le panneau qui le tient (ReplyDrafts).
 */
export function MailView({
  mail,
  place,
  hidden,
  max,
  failed,
  sending,
  discarding,
  kept,
  onKeep,
  onAnswers,
  onRelance,
  onPreference,
  onDiscard,
  onRefresh,
  onSendDraft,
  onTrash,
  reading,
  onRead,
}: {
  mail: PanelMail;
  // « Voir le mail » : l'accueil montre le texte à côté (`onRead`) ; sans, dans le panneau, il se déplie ici.
  reading?: boolean;
  onRead?: () => void;
  // « Envoyer » un brouillon déposé : le panneau demande d'abord.
  onSendDraft?: () => void;
  // « Supprimer le mail » reçu (la corbeille de Gmail) : le panneau demande d'abord.
  onTrash?: () => void;
  kept?: Flow;
  onKeep?: Dispatch<FlowAction>;
  // L'identifiant de sa place (« Mail 2 sur 4 », sous le titre du panneau), que l'en-tête rappelle.
  place?: string;
  hidden?: boolean;
  max: number;
  failed?: boolean | 'bouge';
  sending?: boolean;
  discarding?: boolean;
  onAnswers: (reponses: string[]) => void;
  onRelance: (oui: boolean, indications: string) => void;
  onPreference: (oui: boolean) => void;
  onDiscard: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const words = mail.key;
  const relance = isRelance(mail);
  const { from, receivedAt, source } = mail.mail;
  const noticed = from ? t('noticed', { name: from }) : t('noticedAnon');
  const [ownRead, setOwnRead] = useState(false);
  const read = onRead ? Boolean(reading) : ownRead;
  const text = source.mailText;
  return (
    <div hidden={hidden}>
      {failed && (
        <Notice tone="error" live="alert" className="mb-4">
          {nb(failed === 'bouge' ? t('sendDraft.moved') : f('errorFailed'))}
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
        <h3 className="text-lead font-semibold">
          {mail.sorte === 'preference'
            ? noticed
            : mail.sorte === 'relance'
              ? t(mail.mail.others > 0 ? 'unansweredMany' : 'unanswered', {
                  name: mail.mail.from,
                  count: mail.mail.others,
                })
              : (from ?? t('someone'))}
        </h3>
        <p className="text-label text-muted">
          <time dateTime={receivedAt.toISOString()}>
            {t(relance ? 'sent' : 'received', { date: formatDate(receivedAt, locale) })}
          </time>
          {/* l'outil d'où vient le mail : Gmail, Outlook */}
          {' · '}
          {toolOf(source.kind)}
        </p>
      </div>
      <div className="mt-3 flex max-w-[680px] flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <SourceThing source={source} />
        </div>
        {text && (
          <Button
            size="sm"
            variant={read ? 'secondary' : 'quiet'}
            aria-expanded={read}
            onClick={onRead ?? (() => setOwnRead(!ownRead))}
          >
            {t(read ? 'readHide' : 'read')}
          </Button>
        )}
        {onTrash && canTrash(mail) && (
          <Button
            id={`${words}-supprimer`}
            size="sm"
            variant="quiet"
            aria-describedby={words}
            disabled={sending || discarding}
            onClick={onTrash}
          >
            {t('trash.button')}
          </Button>
        )}
      </div>
      {!onRead && ownRead && text && (
        <p className="mt-3 max-h-[320px] max-w-[680px] overflow-y-auto whitespace-pre-wrap rounded-item border border-line bg-glass-3 px-4 py-3 text-body [overflow-wrap:anywhere] text-fg">
          {text}
        </p>
      )}
      <div className="mt-6 max-w-[680px]">
        {mail.sorte === 'questions' ? (
          <Asked
            demande={mail.mail}
            words={words}
            max={max}
            sending={sending}
            discarding={discarding}
            kept={kept}
            onKeep={onKeep}
            onAnswers={onAnswers}
            onDiscard={onDiscard}
          />
        ) : mail.sorte === 'relance' ? (
          <Relance
            words={words}
            max={max}
            sending={sending}
            discarding={discarding}
            onRelance={onRelance}
          />
        ) : mail.sorte === 'preference' ? (
          <div className="grid gap-3">
            <p
              id={`${words}-preference`}
              className="whitespace-pre-wrap rounded-item border border-line bg-glass-3 px-4 py-3 text-body [overflow-wrap:anywhere] text-fg"
            >
              {mail.mail.preference}
            </p>
            <p id={`${words}-tenir`} className="mt-2 text-lead font-medium text-fg">
              {nb(t('keepInMind'))}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {[true, false].map((oui) => (
                <Button
                  key={String(oui)}
                  size="sm"
                  variant={oui ? 'primary' : 'secondary'}
                  aria-describedby={`${words}-tenir ${words}-preference`}
                  disabled={oui ? discarding : sending}
                  loading={oui ? sending : discarding}
                  onClick={() => onPreference(oui)}
                >
                  {t(oui ? 'yes' : 'no')}
                </Button>
              ))}
            </div>
          </div>
        ) : mail.sorte === 'pret' ? (
          <div className="grid gap-3">
            <p className="text-label text-muted">{t(relance ? 'relanceReady' : 'ready')}</p>
            <p className="whitespace-pre-wrap rounded-item border border-line bg-glass-3 px-4 py-3 text-body [overflow-wrap:anywhere] text-fg">
              {mail.mail.texte}
            </p>
            {mail.mail.depose && <p className="text-label text-muted">{nb(t('deposited'))}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {mail.mail.depose && onSendDraft && (
                <Button
                  id={`${words}-envoyer`}
                  size="sm"
                  variant="primary"
                  aria-describedby={words}
                  disabled={discarding}
                  loading={sending}
                  onClick={onSendDraft}
                >
                  {t('sendDraft.button')}
                </Button>
              )}
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
              <span className="mark is-working">{t(relance ? 'relanceWriting' : 'writing')}</span>
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

// L'outil d'un fil, en mots : « Gmail », « Outlook ».
const toolOf = (kind: string) => SOURCE_KIND_LABELS[kind as SourceKind] ?? kind;

// « Voir le mail », sur l'accueil : le texte du dernier message du fil, à côté de la pile, avec l'outil d'où il vient,
// « Ouvrir dans Gmail » et « Fermer ».
function MailPane({ mail, onClose }: { mail: PanelMail; onClose: () => void }) {
  const t = useTranslations('draftQuestions');
  const c = useTranslations('common');
  const f = useTranslations('fiche');
  const locale = useLocale();
  const { from, receivedAt, source } = mail.mail;
  const tool = toolOf(source.kind);
  return (
    <section
      aria-label={t('read')}
      className="rounded-card border border-line bg-sheet p-6 shadow-sheet"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <h2 className="text-lead font-semibold text-fg">{source.title ?? f('untitled')}</h2>
          <p className="mt-1 text-ui text-muted">
            {from ?? t('someone')} · {formatDate(receivedAt, locale)} · {tool}
          </p>
        </div>
        <Button size="sm" variant="quiet" onClick={onClose}>
          {c('close')}
        </Button>
      </div>
      <p className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-body leading-[1.6] [overflow-wrap:anywhere] text-fg">
        {source.mailText}
      </p>
      {source.url && (
        <p className="mt-5 border-t border-line pt-3 text-ui">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-fg underline-offset-4 hover:underline"
          >
            {t('openIn', { tool })}
          </a>
        </p>
      )}
    </section>
  );
}

// Un geste réussi : `id`, la ligne écrite par son oui à une relance ; `resteDansGmail`, un brouillon écarté que Leon n'a
// pas pu retirer de Gmail.
type Done = { ok: true; resteDansGmail?: boolean; id?: string };

// Pendant que Leon écrit : relire l'Accueil toutes les 5 s, pendant 3 min au plus.
const REFRESH_MS = 5_000;
const REFRESH_MAX = 180_000;

// « Ne plus me demander » avant « Envoyer » : retenu dans ce navigateur seulement. Un navigateur qui refuse le stockage
// demande toujours.
const SEND_KEY = 'leon-envoyer-sans-demander';
const readSkip = () => {
  try {
    return localStorage.getItem(SEND_KEY) === 'oui';
  } catch {
    return false;
  }
};
const saveSkip = () => {
  try {
    localStorage.setItem(SEND_KEY, 'oui');
  } catch {}
};
type Result = Done | { error: string };

/**
 * Ce que les agents « Brouillons de réponse » et « Relances » ont pour elle (portrait/brouillons.ts), sur l'Accueil : une seule ligne, sous
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
  lead,
  side,
}: {
  // L'accueil autour de la pile : au-dessus (le bonjour, le champ), et la colonne de droite (la semaine, le point).
  lead?: ReactNode;
  side?: ReactNode;
  // Son prénom, celui du bonjour.
  name: string | null;
  demandes: Array<HomeDemande | HomePreference | HomeRelance>;
  prets: HomeBrouillon[];
  max: number;
}) {
  const t = useTranslations('draftQuestions');
  const f = useTranslations('fiche');
  const a = useTranslations('agents');
  const c = useTranslations('common');
  const router = useRouter();
  const place = useId();
  const doneId = useId();
  const [open, setOpen] = useState(false);
  // La confirmation sur place : écarter un brouillon déposé, ou l'envoyer.
  const [asked, setAsking] = useState<Asking>(null);
  // « Ne plus me demander » : coché dans la confirmation, puis retenu (lu après le premier rendu, comme le thème).
  const [dontAsk, setDontAsk] = useState(false);
  const [skipSend, setSkipSend] = useState(false);
  useEffect(() => setSkipSend(readSkip()), []);
  const dontAskId = useId();
  const [failed, setFailed] = useState<boolean | 'bouge'>(false);
  // « Voir le mail » sur l'accueil : la clé du mail dont le texte est à droite.
  const [reading, setReading] = useState<string | null>(null);
  // Un geste a été fait sur l'accueil : le mail suivant prend le focus, comme dans le panneau. Jamais au chargement.
  const [acted, setActed] = useState(false);
  const pileId = useId();
  const [panel, dispatch] = useReducer(panelReducer, CLOSED);
  // Ses réponses en cours, mail par mail : fermer le panneau (un clic à côté) ne les perd pas.
  const [kept, setKept] = useState<Record<string, Flow>>({});
  const locale = useLocale();
  const [sending, startSending] = useTransition();
  const [discarding, startDiscarding] = useTransition();
  const working = sending || discarding;
  const mails = panelMails(demandes, prets, panel.done, panel.order);
  const index = shownIndex(mails, panel.at);
  const shown = mails[index];
  const asking = askingFor(asked, shown);
  const counts = countsOf(mails);
  const question = shown && sendQuestion(shown);

  // Le mail montré change (« Mail suivant », un geste, un brouillon arrivé) : son en-tête prend le focus ; plus rien,
  // « Terminé ». Pendant un geste, le corps du panneau est figé : le focus attend la fin.
  // Leon écrit : l'Accueil se relit seul, toutes les REFRESH_MS, tant que l'onglet se voit et que rien ne travaille ici,
  // REFRESH_MAX au plus (l'appel au modèle dure jusqu'à 90 s) ; « Actualiser » reste là. Ses réponses en cours et ses
  // indications tiennent : le panneau reste monté.
  const pending = counts.writing > 0;
  useEffect(() => {
    if (!pending || working) return;
    const until = Date.now() + REFRESH_MAX;
    const timer = setInterval(() => {
      if (Date.now() > until) return clearInterval(timer);
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [pending, working, router]);

  // La carte reste sur le mail qu'elle montre : l'Accueil relu peut ranger devant lui un mail qui arrive, qui ne doit
  // pas prendre sa place sous le clic.
  const shownId = shown?.id;
  useEffect(() => {
    if (shownId && shownId !== panel.at) dispatch({ type: 'show', id: shownId });
  }, [shownId, panel.at]);

  const target = shown?.key ?? doneId;
  useEffect(() => {
    if (!working && (open || acted)) document.getElementById(target)?.focus();
  }, [target, working, open, acted]);

  const show = (at: number) => {
    setFailed(false);
    setAsking(null);
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
      // Le fil a bougé depuis : rien n'est parti, la question se referme et le mail dit pourquoi.
      if ('error' in result && result.error === 'bouge') setAsking(null);
      if ('error' in result && result.error !== 'introuvable')
        return setFailed(result.error === 'bouge' ? 'bouge' : true);
      if ('error' in result) toast.error(goneWord);
      setAsking(null);
      setActed(true);
      setReading(null);
      dispatch({ type: 'close', mails, key: mail.key, id: 'ok' in result ? after(result) : null });
    });
  // Leon l'écrit : le mail garde sa place, et le panneau passe au suivant ; ce qui ne se voit plus se dit.
  const writes = (mail: PanelMail, id: string) => {
    if (mails[index + 1]) toast.success(t(isRelance(mail) ? 'relanceWriting' : 'writing'));
    return id;
  };
  // « Envoyer », confirmé : le mail part de sa boîte, le panneau passe au suivant. Gmail qui refuse : le mail reste,
  // et le panneau le dit ; plus rien à envoyer d'ici (déjà envoyé, écarté ailleurs) : il s'en va.
  const send = (mail: PanelMail) =>
    close(
      mail,
      startSending,
      () => sendBrouillonAction(mail.id),
      () => {
        toast.success(t(isRelance(mail) ? 'sendDraft.doneRelance' : 'sendDraft.done'));
        return null;
      },
      t('draftGone'),
    );
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
  // « Supprimer le mail », confirmé : le mail reçu part à la corbeille de sa boîte Gmail, et sa ligne s'en va avec le
  // brouillon que Leon avait déposé. Gmail qui refuse : rien n'est supprimé, le mail reste et le panneau le dit.
  const trash = (mail: PanelMail) =>
    close(
      mail,
      startDiscarding,
      () => trashMailAction(mail.id),
      (result) => {
        if (result.resteDansGmail) toast.error(t('discardedKeptInGmail'));
        else toast.success(t('trash.done'));
        return null;
      },
    );
  // Le panneau s'ouvre sur `at` (le mail montré par défaut) : « Tout traiter », un mail de la pile, ou une confirmation
  // demandée depuis l'accueil (elle vit dans le pied du panneau).
  const openPanel = (at?: PanelMail) => {
    setFailed(false);
    const target = at ?? shown;
    dispatch({ type: 'open', keys: panelMails(demandes, prets, panel.done).map((one) => one.key) });
    if (target) dispatch({ type: 'show', id: target.id });
    setOpen(true);
  };
  const gestures = (mail: PanelMail) => ({
    ...(mail.sorte === 'questions' && {
      kept: kept[mail.key],
      onKeep: (action: FlowAction) =>
        setKept((all) => ({
          ...all,
          [mail.key]: flowReducer(all[mail.key] ?? startFlow(mail.mail.choix), action),
        })),
    }),
    onAnswers: (reponses: string[]) =>
      close(
        mail,
        startSending,
        () => answerQuestionsAction({ id: mail.id, reponses }),
        () => writes(mail, mail.id),
      ),
    onRelance: (oui: boolean, indications: string) => {
      if (mail.sorte !== 'relance') return;
      close(
        mail,
        oui ? startSending : startDiscarding,
        () => answerRelanceAction({ ...mail.mail.mail, oui, indications: oui ? indications : '' }),
        (result) => (oui && result.id ? writes(mail, result.id) : null),
      );
    },
    // « Oui » ou « Non » à une préférence : l'un ou l'autre la clôt.
    onPreference: (oui: boolean) =>
      close(
        mail,
        oui ? startSending : startDiscarding,
        () => answerPreferenceAction({ id: mail.id, oui }),
        () => null,
      ),
    // Un brouillon déposé dans Gmail en sera supprimé pour de bon : le panneau demande d'abord.
    // shortcut: un mail où Leon écrit est celui de l'Accueil chargé ; si son brouillon a été déposé depuis,
    // « Écarter » le retire de Gmail sans demander (son geste vise cette réponse). Une garde dans
    // discardBrouillonAction le jour où ça se voit.
    onDiscard: () => {
      if (!confirmsDiscard(mail)) return discard(mail);
      if (!open) openPanel(mail);
      setAsking({ type: 'discard', key: mail.key });
    },
    onSendDraft: () => {
      if (skipSend && !sendAlwaysAsks(mail)) return send(mail);
      setDontAsk(false);
      if (!open) openPanel(mail);
      setAsking({ type: 'send', key: mail.key });
    },
    // Le mail reçu part à la corbeille de Gmail : le panneau demande d'abord.
    onTrash: () => {
      if (!open) openPanel(mail);
      setAsking({ type: 'trash', key: mail.key });
    },
    onRefresh: () => router.refresh(),
  });

  // Le titre de la ligne : ce qui attend un geste d'elle d'abord, sinon ses brouillons prêts, sinon ce que Leon écrit.
  const kind =
    counts.toComplete + counts.toConfirm + counts.toFollowUp > 0
      ? 'questions'
      : counts.ready > 0
        ? 'ready'
        : 'writing';
  const count = kind === 'ready' ? counts.ready : counts.writing;
  const title = name ? t(`line.${kind}`, { name, count }) : t(`lineAnon.${kind}`, { count });
  const summary = [
    counts.toComplete > 0 && t('count.toComplete', { count: counts.toComplete }),
    counts.toConfirm > 0 && t('count.toConfirm', { count: counts.toConfirm }),
    counts.toFollowUp > 0 && t('count.toFollowUp', { count: counts.toFollowUp }),
    counts.ready > 0 && t('count.ready', { count: counts.ready }),
    counts.writing > 0 && t('count.writing', { count: counts.writing }),
  ]
    .filter(Boolean)
    .join(' · ');
  // Le titre du panneau : l'agent dont il montre les mails, ou les deux ; « Brouillons de réponse » quand tout est fait.
  const relances = mails.filter(isRelance).length;
  const panelTitle =
    relances === 0
      ? a('list.brouillon-reponse.name')
      : relances === mails.length
        ? a('list.relance.name')
        : t('titleBoth');
  // La colonne de gauche : tout ce qui attend, dans l'ordre du panneau ; un clic montre ce mail.
  const list = shown && (
    <ol aria-label={t('list')} className="grid gap-1">
      {mails.map((mail, at) => (
        <li key={mail.key}>
          <button
            type="button"
            aria-current={at === index || undefined}
            disabled={working}
            onClick={() => show(at)}
            className="grid w-full gap-1 rounded-item px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover disabled:cursor-default aria-[current]:bg-sheet aria-[current]:shadow-sheet"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-body font-medium text-fg">
                {mail.mail.from ?? t('someone')}
              </span>
              <time
                dateTime={mail.mail.receivedAt.toISOString()}
                className="shrink-0 text-label text-muted"
              >
                {formatDate(mail.mail.receivedAt, locale)}
              </time>
            </span>
            <span className="truncate text-label text-fg-2">
              {mail.mail.source.title ?? f('untitled')}
            </span>
            <span>
              <Badge tone={mail.sorte === 'pret' ? 'success' : 'neutral'}>
                {t(`kind.${mail.sorte}`)}
              </Badge>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
  const hasPrevious = shown && index > 0;
  const hasNext = shown && index < mails.length - 1;

  const others = mails.filter((one) => one !== shown);
  const readMail = reading ? mails.find((one) => one.key === reading) : undefined;
  // La pile : le mail montré, ouvert dans la page (on y répond sans fenêtre), puis les suivants glissés dessous ; un
  // clic sur l'un d'eux, ou « Tout traiter », ouvre le panneau. Panneau ouvert, la carte du dessus s'efface (le même
  // mail y est).
  const pile = mails.length > 0 && (
    <section aria-labelledby={pileId} className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={pileId} className="text-head font-semibold tracking-[-0.015em] text-fg">
          {t('pile.title')}
        </h2>
        <span className="text-ui text-muted">{summary}</span>
        {/* la phrase de Leon, celle de l'ancienne ligne */}
        <p className="basis-full text-body text-fg-2">{nb(title)}</p>
      </div>
      {shown && !open && (
        <article className="relative z-10 mt-4 rounded-card border border-line bg-sheet p-7 shadow-lift max-sm:p-5">
          <MailView
            // un autre mail : ses indications en cours et l'étape de ses questions repartent de zéro
            key={shown.key}
            mail={shown}
            max={max}
            failed={failed}
            sending={sending}
            discarding={discarding}
            reading={reading === shown.key}
            onRead={() => setReading(reading === shown.key ? null : shown.key)}
            {...gestures(shown)}
          />
        </article>
      )}
      {others.length > 0 && (
        <ul className={cn('relative grid', !open && 'mx-3.5 -mt-1.5', open && 'mt-4')}>
          {others.map((mail) => (
            <li key={mail.key}>
              <button
                type="button"
                aria-haspopup="dialog"
                disabled={working}
                onClick={() => openPanel(mail)}
                className="flex w-full items-center gap-3 border border-t-0 border-line bg-sheet px-[18px] py-3 text-left transition-colors duration-150 first:border-t last:rounded-b-card hover:bg-hover disabled:cursor-default"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    mail.sorte === 'pret'
                      ? 'bg-f2'
                      : mail.sorte === 'ecrit'
                        ? 'bg-line-strong'
                        : 'bg-f4',
                  )}
                />
                <span className="shrink-0 text-body font-medium text-fg">
                  {mail.mail.from ?? t('someone')}
                </span>
                <span className="min-w-0 flex-1 truncate text-ui text-muted">
                  {mail.mail.source.title ?? f('untitled')}
                </span>
                <span className="shrink-0 text-label text-muted max-sm:hidden">
                  {t(`kind.${mail.sorte}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="quiet"
        className="mt-3 -ml-3"
        aria-haspopup="dialog"
        onClick={() => openPanel()}
      >
        {t('pile.all')}
      </Button>
    </section>
  );

  // Rien n'attend : la section reste, calme, et dit ce que Leon fera. Le point du matin et la semaine restent à droite.
  const empty = mails.length === 0 && (
    <section aria-labelledby={pileId} className="mt-10">
      <h2 id={pileId} className="text-head font-semibold tracking-[-0.015em] text-fg">
        {t('pile.title')}
      </h2>
      <div className="mt-4 rounded-card border border-dashed border-line-strong px-6 py-5">
        <p className="text-body font-medium text-fg">{nb(t('pile.empty'))}</p>
        <p className="mt-1 text-ui text-muted">{nb(t('pile.emptyText'))}</p>
      </div>
    </section>
  );

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-10 gap-y-10 @[60rem]:grid-cols-[minmax(0,1fr)_clamp(320px,32cqi,440px)]">
        <div className="min-w-0">
          {lead}
          {pile}
          {empty}
        </div>
        {(side || readMail) && (
          <aside className="grid grid-cols-[minmax(0,1fr)] gap-8 @[60rem]:sticky @[60rem]:top-6">
            {readMail?.mail.source.mailText ? (
              <MailPane mail={readMail} onClose={() => setReading(null)} />
            ) : (
              side
            )}
          </aside>
        )}
      </div>
      <SidePanel
        open={open}
        onOpenChange={(next) => {
          if (working) return;
          setAsking(null);
          setOpen(next);
        }}
        wide
        aside={list}
        title={panelTitle}
        sub={
          shown && (
            <span id={place} className="tabular-nums">
              {t('mail', { n: index + 1, total: mails.length })}
            </span>
          )
        }
        busy={working}
        confirm={
          asking === 'discard' && shown
            ? {
                title: t('confirmDiscard'),
                text: t('confirmDiscardText'),
                yes: t('discard'),
                no: t('keep'),
                busy: discarding,
                onYes: () => discard(shown),
                onNo: () => {
                  setAsking(null);
                  // « Garder » : le focus revient à « Écarter », qui avait demandé
                  document.getElementById(`${shown.key}-ecarter`)?.focus();
                },
              }
            : asking === 'trash' && shown
              ? {
                  title: t('trash.confirm'),
                  text: t('trash.confirmText'),
                  yes: t('trash.yes'),
                  no: t('keep'),
                  busy: discarding,
                  onYes: () => trash(shown),
                  onNo: () => {
                    setAsking(null);
                    document.getElementById(`${shown.key}-supprimer`)?.focus();
                  },
                }
              : asking === 'send' && shown && question
                ? {
                    title: t(`sendDraft.${question.key}`, question.values),
                    text: (
                      <>
                        {t('sendDraft.confirmText')}
                        {/* Une relance à plusieurs demande toujours : la case n'y aurait aucun effet. */}
                        {!sendAlwaysAsks(shown) && (
                          <label
                            htmlFor={dontAskId}
                            className="mt-2 flex cursor-pointer items-center gap-2 text-ui text-fg"
                          >
                            <input
                              id={dontAskId}
                              type="checkbox"
                              className="size-4 cursor-pointer accent-[var(--ink)]"
                              checked={dontAsk}
                              disabled={sending}
                              onChange={(event) => setDontAsk(event.target.checked)}
                            />
                            {t('sendDraft.dontAsk')}
                          </label>
                        )}
                      </>
                    ),
                    yes: t('sendDraft.button'),
                    yesVariant: 'primary',
                    no: t('sendDraft.notYet'),
                    busy: sending,
                    onYes: () => {
                      if (dontAsk) {
                        saveSkip();
                        setSkipSend(true);
                      }
                      send(shown);
                    },
                    onNo: () => {
                      setAsking(null);
                      document.getElementById(`${shown.key}-envoyer`)?.focus();
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
