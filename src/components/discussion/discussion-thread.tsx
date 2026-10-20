'use client';

import { ArrowUp, CircleAlert, LoaderCircle, LogIn, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { previewPassageAction } from '@/app/(app)/actions';
import {
  type DiscussionMessageView,
  readDiscussionMessagesAction,
} from '@/app/(app)/discussions/actions';
import { type PreviewState, ResultPreview } from '@/components/search/result-preview';
import { Button } from '@/components/ui/button';
import {
  DISCUSSION_MESSAGE_MAX_CHARS,
  DISCUSSION_TIMEOUT_MS,
  DISCUSSION_TOO_MANY,
  type DiscussionCitation,
} from '@/lib/discussion-events';
import { cn } from '@/lib/utils';
import { AssistantMessage, LeonHeading, type OpenCitation, UserMessage } from './message-view';
import { type ReplyProgress, readReply } from './read-reply';

// Une discussion : ses messages, la réponse de Leon en flux (ce qu'il cherche et lit, puis son texte), la saisie
// d'une nouvelle question et l'aperçu des passages cités. La route garde la question et la réponse : la page
// n'écrit rien elle-même. Une page qu'on quitte ne coupe pas la réponse en cours : le serveur la finit et la garde.
// Revenu sur la page pendant qu'il répond, on attend cette réponse-là (« en-cours ») au lieu d'en demander une autre.

export type ThreadMessage = DiscussionMessageView;

type Reply =
  | { status: 'repos' }
  | ({ status: 'flux' } & ReplyProgress)
  // Leon répond déjà dans cette discussion : la page relit la discussion jusqu'à ce que cette réponse y soit.
  | { status: 'attente'; message: string }
  // Cette réponse est arrivée, mais la question envoyée pendant qu'elle courait n'a pas été écrite.
  | { status: 'non-envoyee' }
  | { status: 'indisponible'; questionGardee: boolean }
  | { status: 'occupe' }
  | { status: 'session' }
  | { status: 'origine' }
  | { status: 'sans-modele' };

// Pendant une réponse commencée plus tôt : une relecture toutes les 2 s, pas plus longtemps que le serveur ne la
// laisse courir.
const WAIT_POLL_MS = 2000;
const WAIT_MAX_MS = DISCUSSION_TIMEOUT_MS + 10_000;

const CITATION_HEADER = (citation: DiscussionCitation) => ({
  kind: 'other' as const,
  kindLabel: '',
  natureLabel: '',
  title: citation.title,
  url: citation.url,
});

function useCitationPreview() {
  const [state, setState] = useState<PreviewState>({ status: 'vide' });
  const panel = useRef<HTMLElement>(null);
  const latest = useRef(0);
  const opener = useRef<HTMLElement | null>(null);

  const close = () => {
    latest.current += 1;
    setState({ status: 'vide' });
    opener.current?.focus();
    opener.current = null;
  };

  const open: OpenCitation = (citation, trigger) => {
    const request = ++latest.current;
    opener.current ??= trigger;
    const result = CITATION_HEADER(citation);
    setState({ status: 'charge', result });
    previewPassageAction(citation.passageId)
      .then((answer) => {
        if (request !== latest.current) return;
        setState(
          answer.ok
            ? { status: 'pret', result, preview: answer.preview }
            : { status: answer.reason, result },
        );
      })
      .catch(() => {
        if (request === latest.current) setState({ status: 'erreur', result });
      });
  };

  const opened = state.status !== 'vide';
  useEffect(() => {
    if (opened) panel.current?.focus({ preventScroll: true });
  }, [opened]);
  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return { state, panel, open, close, opened };
}

function Composer({
  value,
  setValue,
  disabled,
  busy,
  onSend,
}: {
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const empty = value.trim() === '';

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (disabled || busy || empty) return;
    onSend(value.trim());
    setValue('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Entrée envoie, Maj + Entrée passe à la ligne ; jamais pendant la composition d'un caractère accentué.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-4 z-20 mt-6 rounded-xl border bg-card p-2 shadow-md"
    >
      <label htmlFor="question-discussion" className="sr-only">
        Votre question à Leon
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="question-discussion"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={DISCUSSION_MESSAGE_MAX_CHARS}
          rows={1}
          disabled={disabled}
          placeholder={
            disabled ? 'Leon ne peut pas répondre sur ce serveur' : 'Posez une autre question…'
          }
          className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || busy || empty}
          aria-label={busy ? 'Leon répond…' : 'Envoyer la question'}
          className="size-11 shrink-0 rounded-lg"
        >
          {busy ? (
            <LoaderCircle size={18} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
          ) : (
            <ArrowUp size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="px-3 pt-1 pb-0.5 text-[12px] leading-4 text-muted-foreground">
        Entrée pour envoyer, Maj + Entrée pour passer à la ligne. Leon ne lit que ce que vous avez
        le droit de voir.
      </p>
    </form>
  );
}

function Notice({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-quote px-4 py-3"
    >
      <CircleAlert
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
      />
      <p className="min-w-0 flex-1 text-[15px] leading-6 text-foreground-2">{children}</p>
      {action}
    </div>
  );
}

const THINKING: Reply = { status: 'flux', text: '', citations: [], activity: 'Leon réfléchit…' };

const NO_MODEL =
  'Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La recherche, elle, marche.';

const actionClass = 'h-9 gap-1.5 rounded-lg px-3 text-[15px]';

export function DiscussionThread({
  discussionId,
  initialMessages,
  modelAvailable,
  appOrigin,
}: {
  discussionId: string;
  initialMessages: ThreadMessage[];
  modelAvailable: boolean;
  // L'adresse réglée pour Leon (BETTER_AUTH_URL) : la seule d'où la route accepte une question.
  appOrigin: string;
}) {
  // Une discussion ouverte depuis la barre ou la page Discussions arrive avec sa question seule : Leon y répond
  // tout de suite.
  const [first] = initialMessages;
  const autoStart = modelAvailable && initialMessages.length === 1 && first?.role === 'user';
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState<Reply>(
    !modelAvailable ? { status: 'sans-modele' } : autoStart ? THINKING : { status: 'repos' },
  );
  const [draft, setDraft] = useState('');
  const preview = useCitationPreview();
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const busy = reply.status === 'flux' || reply.status === 'attente';
  const last = messages.at(-1);
  const waiting = last?.role === 'user' && reply.status === 'repos';

  function ask(message: string) {
    if (!busy) run(message);
  }

  function run(message: string) {
    setMessages((current) => {
      const previous = current.at(-1);
      // La question restée sans réponse est reposée telle quelle : le serveur ne la répète pas non plus.
      if (previous?.role === 'user' && previous.content === message) return current;
      return [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: message, citations: [] },
      ];
    });
    setReply(THINKING);
    readReply(discussionId, message, (progress) => setReply({ status: 'flux', ...progress }))
      .then((outcome) => {
        if (outcome.status === 'en-cours') {
          setReply({ status: 'attente', message });
          return;
        }
        if (outcome.status !== 'finie') {
          setReply(outcome);
          return;
        }
        const { content, citations } = outcome;
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: 'assistant', content, citations },
        ]);
        setReply({ status: 'repos' });
        // La page gardée par le navigateur (retour arrière) montrera aussi cette réponse.
        router.refresh();
      })
      .catch(() => setReply({ status: 'indisponible', questionGardee: false }));
  }

  // Leon répond déjà dans cette discussion : la page la relit jusqu'à ce que cette réponse y soit, ou que le serveur
  // n'en ait plus en cours (elle a échoué), puis la montre telle qu'elle est. Une question envoyée entre-temps n'a
  // pas été écrite : elle revient dans la saisie.
  useEffect(() => {
    if (reply.status !== 'attente') return;
    const { message } = reply;
    const until = Date.now() + WAIT_MAX_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      readDiscussionMessagesAction(discussionId)
        .then((read) => {
          if (stopped) return;
          if (read === null) {
            setReply({ status: 'indisponible', questionGardee: false });
            return;
          }
          const current = read.messages;
          if (current.at(-1)?.role !== 'assistant' && read.replying && Date.now() < until) {
            timer = setTimeout(check, WAIT_POLL_MS);
            return;
          }
          setMessages(current);
          router.refresh();
          if (current.findLast((item) => item.role === 'user')?.content === message) {
            setReply({ status: 'repos' });
            return;
          }
          setDraft((typed) => (typed.trim() === '' ? message : typed));
          setReply({ status: 'non-envoyee' });
        })
        .catch(() => {
          if (!stopped) setReply({ status: 'indisponible', questionGardee: false });
        });
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reply, discussionId, router]);

  // Une question envoyée, une réponse finie : la fin de la discussion vient en vue.
  // biome-ignore lint/correctness/useExhaustiveDependencies: suit le nombre de messages et l'état de la réponse
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottom.current?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
  }, [messages.length, reply.status]);

  // Une seule fois, même quand React monte la page deux fois (mode développement). La page affichée peut être
  // ancienne (retour arrière du navigateur, rechargement à chaud) : la discussion est relue, et Leon ne répond que
  // si la question y est encore seule. Sinon, la page montre la discussion telle qu'elle est.
  // biome-ignore lint/correctness/useExhaustiveDependencies: au premier affichage seulement
  useEffect(() => {
    if (started.current || !autoStart) return;
    started.current = true;
    readDiscussionMessagesAction(discussionId)
      .then((read) => {
        const current = read?.messages;
        const [question] = current ?? [];
        if (current?.length === 1 && question?.role === 'user') return run(question.content);
        if (current) setMessages(current);
        setReply(current ? { status: 'repos' } : { status: 'indisponible', questionGardee: false });
      })
      .catch(() => setReply({ status: 'indisponible', questionGardee: false }));
  }, []);

  const firstUserId = messages.find((message) => message.role === 'user')?.id;

  return (
    <div className="@container">
      <div className="grid gap-x-10 @[920px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <ol aria-label="Messages de la discussion" className="space-y-5">
            {messages.map((message) => (
              <li key={message.id}>
                {message.role === 'user' ? (
                  <UserMessage
                    content={message.content}
                    seeds={message.id === firstUserId ? message.citations : []}
                    onOpen={preview.open}
                  />
                ) : (
                  <AssistantMessage
                    content={message.content}
                    citations={message.citations}
                    onOpen={preview.open}
                  />
                )}
              </li>
            ))}
          </ol>

          <div aria-live="polite" aria-busy={busy} className="mt-5 space-y-5">
            {(reply.status === 'flux' || reply.status === 'attente') && (
              <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
                <LeonHeading />
                {reply.status === 'attente' || reply.text === '' ? (
                  <p className="mt-2 flex items-center gap-2 text-[15px] leading-6 text-muted-foreground">
                    <LoaderCircle
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="animate-spin text-primary"
                    />
                    {reply.status === 'attente'
                      ? 'Leon termine une réponse commencée plus tôt…'
                      : (reply.activity ?? 'Leon réfléchit…')}
                  </p>
                ) : (
                  <p className="mt-2 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground-2">
                    {/* Les renvois [n] restent du texte jusqu'à la fin : leurs sources arrivent avec elle. */}
                    {reply.text}
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-[2px] bg-primary/60 align-[-2px]"
                    />
                  </p>
                )}
              </div>
            )}
            {reply.status === 'indisponible' && last?.role === 'user' && (
              <Notice
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => ask(last.content)}
                    className={actionClass}
                  >
                    <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                    Réessayer
                  </Button>
                }
              >
                {reply.questionGardee
                  ? 'Leon n’a pas pu répondre pour le moment. Votre question est gardée.'
                  : 'Leon n’a pas pu répondre pour le moment.'}
              </Notice>
            )}
            {reply.status === 'occupe' && last?.role === 'user' && (
              <Notice
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => ask(last.content)}
                    className={actionClass}
                  >
                    <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                    Réessayer
                  </Button>
                }
              >
                {DISCUSSION_TOO_MANY}
              </Notice>
            )}
            {reply.status === 'session' && (
              <Notice
                action={
                  <Button asChild variant="outline" className={actionClass}>
                    <Link href="/connexion">
                      <LogIn size={15} strokeWidth={1.5} aria-hidden="true" />
                      Se reconnecter
                    </Link>
                  </Button>
                }
              >
                Votre session a expiré : la question n’a pas été envoyée. Reconnectez-vous, puis
                posez-la de nouveau.
              </Notice>
            )}
            {reply.status === 'origine' && (
              <Notice
                action={
                  <Button asChild variant="outline" className={actionClass}>
                    <a href={`${appOrigin}/discussions/${encodeURIComponent(discussionId)}`}>
                      Ouvrir à cette adresse
                    </a>
                  </Button>
                }
              >
                {`Leon est ouvert ici à une autre adresse que la sienne (${appOrigin}) : la question n’a pas été envoyée.`}
              </Notice>
            )}
            {reply.status === 'non-envoyee' && (
              <Notice>
                Leon répondait déjà dans cette discussion : votre question n’a pas été envoyée. Elle
                vous attend dans la saisie.
              </Notice>
            )}
            {reply.status === 'sans-modele' && <Notice>{NO_MODEL}</Notice>}
            {waiting && last && (
              <Notice
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => ask(last.content)}
                    className={actionClass}
                  >
                    <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                    Demander la réponse
                  </Button>
                }
              >
                Cette question attend encore sa réponse.
              </Notice>
            )}
          </div>
          <Composer
            value={draft}
            setValue={setDraft}
            disabled={reply.status === 'sans-modele'}
            busy={busy}
            onSend={(message) => ask(message)}
          />
          {/* Sous la saisie : faire défiler jusqu'ici montre le dernier message au-dessus d'elle. */}
          <div ref={bottom} />
        </div>
        {preview.opened && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={preview.close}
            className={cn(
              'fixed inset-0 z-30 cursor-default bg-foreground/30 duration-200 animate-in fade-in-0 @[920px]:hidden',
            )}
          />
        )}
        <ResultPreview
          ref={preview.panel}
          state={preview.state}
          terms={[]}
          onClose={preview.close}
          label="Aperçu de la source citée"
          emptyHint="Cliquez sur une source citée pour lire le passage dans son contexte."
        />
      </div>
    </div>
  );
}
