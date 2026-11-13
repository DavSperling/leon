'use client';

import { Ellipsis, ExternalLink, LogIn, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  citationDetailsAction,
  type DiscussionMessageView,
  deleteDiscussionAction,
  readDiscussionMessagesAction,
} from '@/app/(app)/discussions/actions';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Fact,
  Facts,
  Notice,
  type NoticeProps,
  SidePanel,
  toast,
} from '@/components/verre';
import { Composer } from '@/components/verre/discussions/composer';
import { LeonCard, UserBubble } from '@/components/verre/discussions/messages';
import { useSourcePanel } from '@/components/verre/discussions/preview';
import { DISCUSSION_TIMEOUT_MS, replyParts } from '@/lib/discussion-events';
import { cn, formatDateTime, nb } from '@/lib/verre';
import { ActionCard } from './action-card';
import type { ToolActivity } from './message-segments';
import { questionNotWritten, type ReplyProgress, readReply, retryQuestion } from './read-reply';

// Une discussion : ses messages, la réponse de Leon en flux (ce qu'il cherche et lit, puis son texte), la saisie
// d'une nouvelle question et l'aperçu des passages cités. La route garde la question et la réponse : la page
// n'écrit rien elle-même. Une page qu'on quitte ne coupe pas la réponse en cours : le serveur la finit et la garde.
// Revenu sur la page pendant qu'il répond, on attend cette réponse-là (« en-cours ») au lieu d'en demander une autre.

export type ThreadMessage = DiscussionMessageView;

type Reply =
  | { status: 'repos' }
  | ({ status: 'flux' } & ReplyProgress)
  // Leon répond déjà dans cette discussion (ou le flux s'est coupé, `coupee`) : la page relit la discussion
  // jusqu'à ce que cette réponse y soit.
  | { status: 'attente'; message: string; coupee: boolean }
  // Cette réponse est arrivée, mais la question envoyée pendant qu'elle courait n'a pas été écrite.
  | { status: 'non-envoyee' }
  // `retry` : la question que « Réessayer » renvoie (retryQuestion), ou null.
  | { status: 'indisponible'; questionGardee: boolean; retry: string | null }
  | { status: 'occupe'; retry: string | null }
  | { status: 'session' }
  | { status: 'origine' }
  | { status: 'sans-modele' };

// Pendant une réponse commencée plus tôt : une relecture toutes les 2 s, pas plus longtemps que le serveur ne la
// laisse courir.
const WAIT_POLL_MS = 2000;
const WAIT_MAX_MS = DISCUSSION_TIMEOUT_MS + 10_000;

// La colonne du fil (736 px : une réponse à 18 px s'y lit sur 70 caractères environ). 24 px : la marge haute de la page ;
// 76 px : ses marges basses, reprises pour que le champ touche le pied de la fenêtre.
const THREAD_COLUMN =
  'mx-auto -mb-[76px] flex min-h-[calc(100dvh-24px)] w-full max-w-[736px] min-w-0 flex-col max-shell:min-h-[calc(100dvh-var(--top-h)-28px)]';

// Avant le premier évènement : pas de libellé inventé, seulement l'indicateur d'attente.
const THINKING: Reply = { status: 'flux', text: '', citations: [], activity: null };

/** Le texte lu aux lecteurs d'écran une fois la réponse finie : sans les renvois ni les marques du Markdown. */
const spoken = (text: string) => text.replace(/\s?\[\d+\]|\*\*|`|^#+\s+/gm, '');

export function DiscussionThread({
  discussionId,
  title,
  createdAt,
  initialMessages,
  modelAvailable,
  appOrigin,
}: {
  discussionId: string;
  title: string;
  createdAt: Date;
  initialMessages: ThreadMessage[];
  modelAvailable: boolean;
  // L'adresse réglée pour Leon (BETTER_AUTH_URL) : la seule d'où la route accepte une question.
  appOrigin: string;
}) {
  const t = useTranslations('thread');
  const discussionsT = useTranslations('discussions');
  const viewT = useTranslations('discussionView');
  const activityLabel = (activity: ToolActivity | null) =>
    activity && viewT(`activity.${activity}`);
  // Ce que le lecteur d'écran annonce d'une réponse arrivée : sans les renvois, ses phrases fixes traduites.
  const spokenReply = (content: string) => {
    const { main, fixed, limit } = replyParts(content);
    return [fixed ? viewT(fixed) : spoken(main), limit ? viewT('limitNote') : '']
      .filter(Boolean)
      .join(' ');
  };
  const RESUMING = t('resuming');
  // Une discussion ouverte depuis la barre ou la page Discussions arrive avec sa question seule : Leon y répond
  // tout de suite.
  const [first] = initialMessages;
  const autoStart = modelAvailable && initialMessages.length === 1 && first?.role === 'user';
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState<Reply>(
    !modelAvailable ? { status: 'sans-modele' } : autoStart ? THINKING : { status: 'repos' },
  );
  const [draft, setDraft] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const sources = useSourcePanel();
  const router = useRouter();
  const locale = useLocale();
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const arrived = useRef(false);
  // La réponse en cours a l'identifiant du message qui la remplacera : la réponse reste le même nœud.
  const replyId = useRef('');
  const busy = reply.status === 'flux' || reply.status === 'attente';
  const last = messages.at(-1);
  const waiting = last?.role === 'user' && reply.status === 'repos';

  function ask(message: string) {
    if (!busy) run(message);
  }

  const retry = (message: string): NoticeProps['action'] => ({
    label: t('retry'),
    icon: RotateCcw,
    onClick: () => ask(message),
  });

  function run(message: string) {
    const previous = messages.at(-1);
    // La question restée sans réponse est reposée telle quelle : le serveur ne la répète pas non plus.
    const repeated = previous?.role === 'user' && previous.content === message;
    const questionId = crypto.randomUUID();
    const answerId = crypto.randomUUID();
    replyId.current = answerId;
    if (!repeated) {
      setMessages((current) => [
        ...current,
        { id: questionId, role: 'user', content: message, citations: [], actions: [] },
      ]);
    }
    setReply(THINKING);
    readReply(discussionId, message, (progress) => setReply({ status: 'flux', ...progress }))
      .then((outcome) => {
        if (outcome.status === 'en-cours' || outcome.status === 'coupee') {
          setReply({ status: 'attente', message, coupee: outcome.status === 'coupee' });
          return;
        }
        if (outcome.status !== 'finie') {
          // Une question nouvelle que le serveur n'a pas écrite quitte la discussion et revient dans la saisie.
          if (!repeated && questionNotWritten(outcome)) {
            setMessages((current) => current.filter((item) => item.id !== questionId));
            setDraft((typed) => (typed.trim() === '' ? message : typed));
          }
          const retry = retryQuestion(outcome, message, { repeated });
          setReply(
            outcome.status === 'indisponible' || outcome.status === 'occupe'
              ? { ...outcome, retry }
              : outcome,
          );
          return;
        }
        const { content, citations, actions } = outcome;
        setMessages((current) => [
          ...current,
          { id: answerId, role: 'assistant', content, citations, actions },
        ]);
        setFresh(answerId);
        setReply({ status: 'repos' });
        // La page gardée par le navigateur (retour arrière) montrera aussi cette réponse.
        router.refresh();
        // L'outil, qui voit la source et le passage cité (le surligneur) : relus sous les droits du lecteur.
        if (citations.length > 0)
          citationDetailsAction(citations.map((c) => c.passageId))
            .then((details) =>
              setMessages((current) =>
                current.map((item) =>
                  item.id !== answerId
                    ? item
                    : {
                        ...item,
                        citations: item.citations.map((c) => ({
                          ...c,
                          ...details[c.passageId.toLowerCase()],
                        })),
                      },
                ),
              ),
            )
            .catch(() => {}); // sans détails, les numéros restent
      })
      .catch(() => setReply({ status: 'indisponible', questionGardee: false, retry: message }));
  }

  // Leon répond déjà dans cette discussion : la page la relit jusqu'à ce que cette réponse y soit, ou que le serveur
  // n'en ait plus en cours (elle a échoué), puis la montre telle qu'elle est. Une question envoyée entre-temps n'a
  // pas été écrite : elle revient dans la saisie. Après un flux coupé, une question absente n'a pas été écrite non
  // plus : elle revient dans la saisie.
  useEffect(() => {
    if (reply.status !== 'attente') return;
    const { message, coupee } = reply;
    const until = Date.now() + WAIT_MAX_MS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      readDiscussionMessagesAction(discussionId)
        .then((read) => {
          if (stopped) return;
          if (read === null) {
            setReply({ status: 'indisponible', questionGardee: false, retry: message });
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
          setReply(
            coupee
              ? { status: 'indisponible', questionGardee: false, retry: null }
              : { status: 'non-envoyee' },
          );
        })
        .catch(() => {
          if (!stopped) setReply({ status: 'indisponible', questionGardee: false, retry: message });
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
    // à l'arrivée sur la page, la fin est là d'emblée : rien ne défile sous les yeux
    const smooth = arrived.current && !reduced;
    arrived.current = true;
    bottom.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
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
        setReply(
          current
            ? { status: 'repos' }
            : { status: 'indisponible', questionGardee: false, retry: first?.content ?? null },
        );
      })
      .catch(() =>
        setReply({ status: 'indisponible', questionGardee: false, retry: first?.content ?? null }),
      );
  }, []);

  const firstUserId = messages.find((message) => message.role === 'user')?.id;
  const streaming = reply.status === 'flux' || reply.status === 'attente';
  const liveKey = replyId.current || 'reponse-en-cours';
  const freshMessage = fresh ? messages.find((m) => m.id === fresh) : undefined;
  const announce =
    reply.status === 'attente'
      ? RESUMING
      : reply.status === 'flux'
        ? (activityLabel(reply.activity) ?? '')
        : freshMessage
          ? spokenReply(freshMessage.content)
          : '';

  // La question qui n'a pas été écrite est revenue dans la saisie : pas de « Réessayer », on la renvoie.
  let notice: { text: string; action?: NoticeProps['action']; warning?: boolean } | null = null;
  if (reply.status === 'indisponible')
    notice = {
      text: reply.questionGardee
        ? t('answerFailedKept')
        : reply.retry !== null
          ? t('answerFailed')
          : t('answerFailedDraft'),
      action: reply.retry !== null ? retry(reply.retry) : undefined,
    };
  else if (reply.status === 'occupe')
    notice = {
      text: t('tooMany'),
      action: reply.retry !== null ? retry(reply.retry) : undefined,
    };
  else if (reply.status === 'session')
    notice = {
      text: t('sessionExpired'),
      action: (
        <Button asChild size="xs" icon={LogIn}>
          <Link href="/connexion">{t('signInAgain')}</Link>
        </Button>
      ),
    };
  else if (reply.status === 'origine')
    notice = {
      text: t('wrongOrigin', { origin: appOrigin }),
      action: (
        <Button asChild size="xs" icon={ExternalLink}>
          <a href={`${appOrigin}/discussions/${encodeURIComponent(discussionId)}`}>
            {t('openAtAddress')}
          </a>
        </Button>
      ),
    };
  else if (reply.status === 'non-envoyee')
    notice = {
      text: t('alreadyReplying'),
    };
  else if (reply.status === 'sans-modele')
    notice = { text: discussionsT('modelUnavailable'), warning: true };
  else if (waiting && last)
    notice = {
      text: t('waitingForReply'),
      action: { label: t('requestReply'), icon: RotateCcw, onClick: () => ask(last.content) },
    };

  return (
    // Une colonne de lecture au milieu du bureau : le titre, les questions, les feuilles de Leon et le champ tiennent
    // entre les deux mêmes bords. Elle remplit la fenêtre (les marges basses de l'ossature sont reprises) : le champ
    // reste au pied, que le fil soit court ou long. Autour d'elle, `fil` mesure la marge du bureau : quand il y en a, les
    // sources d'une réponse y sortent en drapeaux (fil.css).
    <div className="fil">
      <div className={THREAD_COLUMN}>
        {/* Le titre de la discussion est un vrai titre de page, comme sur les autres écrans (deux lignes au plus). */}
        <header className="flex items-start gap-4">
          <h1
            className="line-clamp-2 min-w-0 flex-1 text-h1 font-semibold tracking-[-0.022em] text-balance text-fg [overflow-wrap:anywhere] max-sm:text-[26px]"
            title={title}
          >
            {title}
          </h1>
          <DeleteDiscussion
            discussionId={discussionId}
            title={title}
            createdAt={createdAt}
            questions={messages.filter((m) => m.role === 'user').length}
            sourcesCited={
              new Set(
                messages.flatMap((m) =>
                  m.role === 'assistant' ? m.citations.map((c) => c.sourceId) : [],
                ),
              ).size
            }
            locale={locale}
          />
        </header>

        {/* Une question et sa réponse se tiennent (16 px) ; la question suivante prend ses distances (40 px). */}
        <ol
          aria-label={t('messages')}
          aria-busy={busy}
          className="mt-7 grid grid-cols-[minmax(0,1fr)]"
        >
          {messages.map((message, index) => (
            <li
              key={message.id}
              className={cn(
                index > 0 && (message.role === 'user' ? 'mt-10' : 'mt-4'),
                message.id === fresh && 'rise-in',
              )}
            >
              {message.role === 'user' ? (
                <UserBubble
                  content={message.content}
                  seeds={message.id === firstUserId ? message.citations : []}
                  onOpen={sources.open}
                />
              ) : (
                <LeonCard
                  content={message.content}
                  citations={message.citations}
                  fresh={message.id === fresh}
                  onOpen={sources.open}
                />
              )}
              {message.actions.length > 0 && (
                <div className="mt-3 grid gap-3">
                  {message.actions.map((action) => (
                    <ActionCard key={action.id} action={action} />
                  ))}
                </div>
              )}
            </li>
          ))}
          {streaming && (
            <li key={liveKey} className="mt-4">
              <LeonCard
                content=""
                citations={[]}
                live={
                  reply.status === 'attente'
                    ? { activity: RESUMING, text: '' }
                    : { activity: activityLabel(reply.activity), text: reply.text }
                }
                onOpen={sources.open}
              />
            </li>
          )}
        </ol>

        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
        {/* Sous le dernier message : la fin de la discussion vient en vue au-dessus du champ. */}
        <div ref={bottom} className="scroll-mb-40" />

        <Composer
          value={draft}
          setValue={setDraft}
          disabled={reply.status === 'sans-modele'}
          busy={busy}
          onSend={(message) => ask(message)}
          below={
            notice && (
              <Notice
                tone={notice.warning ? 'warning' : 'neutral'}
                // présente dès l'arrivée : pas annoncée ; une issue de réponse l'est
                live={notice.warning ? undefined : waiting ? 'status' : 'alert'}
                action={notice.action}
              >
                {notice.text}
              </Notice>
            )
          }
        />
        {sources.panel}
      </div>
    </div>
  );
}

/**
 * Le menu de la discussion (trois points, en tête) : « Supprimer » y est rangé, le mot n'est plus écrit dans le fil. Le
 * panneau dit ce qu'elle est, puis demande confirmation.
 */
function DeleteDiscussion({
  discussionId,
  title,
  createdAt,
  questions,
  sourcesCited,
  locale,
}: {
  discussionId: string;
  title: string;
  createdAt: Date;
  questions: number;
  sourcesCited: number;
  locale: string;
}) {
  const t = useTranslations('discussions');
  const tt = useTranslations('thread');
  const shell = useTranslations('shell');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  // la confirmation s'ouvre une fois le menu refermé : en se fermant à son tour, elle rend le focus aux trois points
  const toAsk = useRef(false);

  const remove = () => {
    setPending(true);
    deleteDiscussionAction(discussionId)
      .then(({ ok }) => {
        if (!ok) throw new Error('refusée');
        toast.success(t('deleteSuccess'));
        router.push('/discussions');
      })
      .catch(() => {
        setPending(false);
        toast.error(t('deleteFailed'));
      });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={nb(shell('discussionMenu', { title }))}
          className="mt-0.5 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-item text-fg-2 transition-[background-color,color] duration-150 hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-shell:size-11"
        >
          <Ellipsis aria-hidden="true" strokeWidth={1.8} className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[180px]"
          onCloseAutoFocus={() => {
            if (toAsk.current) {
              setAsking(true);
              setOpen(true);
            }
            toAsk.current = false;
          }}
        >
          <DropdownMenuItem
            icon={Trash2}
            destructive
            onSelect={() => {
              toAsk.current = true;
            }}
          >
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidePanel
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setAsking(false);
        }}
        title={title}
        confirm={
          asking
            ? {
                title: t('deleteTitle'),
                text: t('deleteDescription'),
                yes: t('delete'),
                no: t('keep'),
                busy: pending,
                busyLabel: t('deleting'),
                onYes: remove,
                onNo: () => {
                  setAsking(false);
                  setOpen(false);
                },
              }
            : null
        }
      >
        <Facts>
          <Fact label={t('visibleTo')}>
            {t('onlyYou')}
            <small>{nb(tt('privacyHint'))}</small>
          </Fact>
          <Fact label={t('started')}>{formatDateTime(createdAt, locale)}</Fact>
          <Fact label={t('questions')}>{questions}</Fact>
          <Fact label={t('sourcesCited')}>{sourcesCited}</Fact>
        </Facts>
      </SidePanel>
    </>
  );
}
