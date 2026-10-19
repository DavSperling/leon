'use client';

import { ArrowUp, CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react';
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
  createDiscussionEventReader,
  DISCUSSION_MESSAGE_MAX_CHARS,
  type DiscussionCitation,
  discussionMessagesUrl,
  finalReplyText,
} from '@/lib/discussion-events';
import { cn } from '@/lib/utils';
import { toolActivityLabel } from './message-segments';
import {
  AssistantMessage,
  LeonHeading,
  MessageText,
  type OpenCitation,
  UserMessage,
} from './message-view';

// Une discussion : ses messages, la réponse de Leon en flux (ce qu'il cherche et lit, puis son texte), la saisie
// d'une nouvelle question et l'aperçu des passages cités. La route garde la question et la réponse : la page
// n'écrit rien elle-même. Une page qu'on quitte ne coupe pas la réponse en cours : elle est gardée, et se lit au
// retour.

export type ThreadMessage = DiscussionMessageView;

type Reply =
  | { status: 'repos' }
  | { status: 'flux'; text: string; citations: DiscussionCitation[]; activity: string | null }
  | { status: 'indisponible' }
  | { status: 'sans-modele' };

type Finished = { content: string; citations: DiscussionCitation[] };

// La réponse à `message`, lue au fil du flux de la route. Rend la réponse finie, ou l'état où la lecture s'arrête.
async function readReply(
  discussionId: string,
  message: string,
  onProgress: (reply: Reply) => void,
): Promise<Finished | 'indisponible' | 'sans-modele'> {
  const response = await fetch(discussionMessagesUrl(discussionId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  });
  if (response.status === 204) return 'sans-modele';
  if (!response.ok || !response.body) return 'indisponible';
  const chunks = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const reader = createDiscussionEventReader();
  let text = '';
  let citations: DiscussionCitation[] = [];
  let activity: string | null = null;
  for (;;) {
    const { done, value } = await chunks.read();
    if (done) return 'indisponible';
    for (const event of reader.push(value)) {
      if (event.type === 'texte') {
        text += event.delta;
        activity = null;
      } else if (event.type === 'outil') {
        activity = toolActivityLabel(event.name);
      } else if (event.type === 'citations') {
        citations = event.items;
      } else if (event.type === 'fin') {
        return { content: finalReplyText(text, event.reason), citations };
      } else {
        return 'indisponible';
      }
      onProgress({ status: 'flux', text, citations, activity });
    }
  }
}

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
  disabled,
  busy,
  onSend,
}: {
  disabled: boolean;
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState('');
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

export function DiscussionThread({
  discussionId,
  initialMessages,
  modelAvailable,
}: {
  discussionId: string;
  initialMessages: ThreadMessage[];
  modelAvailable: boolean;
}) {
  // Une discussion ouverte depuis la barre ou la page Discussions arrive avec sa question seule : Leon y répond
  // tout de suite.
  const [first] = initialMessages;
  const autoStart = modelAvailable && initialMessages.length === 1 && first?.role === 'user';
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState<Reply>(
    !modelAvailable ? { status: 'sans-modele' } : autoStart ? THINKING : { status: 'repos' },
  );
  const preview = useCitationPreview();
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const busy = reply.status === 'flux';
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
    readReply(discussionId, message, setReply)
      .then((result) => {
        if (result === 'indisponible' || result === 'sans-modele') {
          setReply({ status: result });
          return;
        }
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: 'assistant', ...result },
        ]);
        setReply({ status: 'repos' });
        // La page gardée par le navigateur (retour arrière) montrera aussi cette réponse.
        router.refresh();
      })
      .catch(() => setReply({ status: 'indisponible' }));
  }

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
      .then((current) => {
        const [question] = current ?? [];
        if (current?.length === 1 && question?.role === 'user') return run(question.content);
        if (current) setMessages(current);
        setReply(current ? { status: 'repos' } : { status: 'indisponible' });
      })
      .catch(() => setReply({ status: 'indisponible' }));
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
            {reply.status === 'flux' && (
              <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
                <LeonHeading />
                {reply.text === '' ? (
                  <p className="mt-2 flex items-center gap-2 text-[15px] leading-6 text-muted-foreground">
                    <LoaderCircle
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="animate-spin text-primary"
                    />
                    {reply.activity ?? 'Leon réfléchit…'}
                  </p>
                ) : (
                  <p className="mt-2 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground-2">
                    <MessageText text={reply.text} citations={[]} onOpen={preview.open} />
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
                    className="h-9 gap-1.5 rounded-lg px-3 text-[15px]"
                  >
                    <RotateCcw size={15} strokeWidth={1.5} aria-hidden="true" />
                    Réessayer
                  </Button>
                }
              >
                Leon n’a pas pu répondre pour le moment. Votre question est gardée.
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
                    className="h-9 gap-1.5 rounded-lg px-3 text-[15px]"
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
