'use client';

import { ChevronLeft, ExternalLink, Lock, LogIn, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  type DiscussionMessageView,
  readDiscussionMessagesAction,
} from '@/app/(app)/discussions/actions';
import { Button, Notice, type NoticeProps, PageHeader, useThinking } from '@/components/verre';
import { Composer } from '@/components/verre/discussions/composer';
import { LeonCard, UserBubble } from '@/components/verre/discussions/messages';
import {
  PreviewPane,
  PreviewSheet,
  useCitationPreview,
} from '@/components/verre/discussions/preview';
import { DISCUSSION_TIMEOUT_MS, replyParts } from '@/lib/discussion-events';
import { rise, useAppear, useMinWidth } from '@/lib/verre';
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

// Avant le premier évènement : pas de libellé inventé, seulement l'indicateur d'attente.
const THINKING: Reply = { status: 'flux', text: '', citations: [], activity: null };

/** Le texte lu aux lecteurs d'écran une fois la réponse finie : sans les renvois ni les marques du Markdown. */
const spoken = (text: string) => text.replace(/\s?\[\d+\]|\*\*|`|^#+\s+/gm, '');

export function DiscussionThread({
  discussionId,
  title,
  initialMessages,
  modelAvailable,
  appOrigin,
}: {
  discussionId: string;
  title: string;
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
  const [hovered, setHovered] = useState<string | null>(null);
  const preview = useCitationPreview();
  const router = useRouter();
  const { setThinking } = useThinking();
  const appear = useAppear();
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLElement>(null);
  const wide = useMinWidth(root, 920);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
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

  // Leon travaille : l'aurore s'intensifie tant qu'une réponse court.
  useEffect(() => setThinking(busy), [busy, setThinking]);

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

  // Aperçu ouvert en panneau : il prend le focus, Échap le ferme (la feuille gère les siens).
  const opened = preview.state.status !== 'vide';
  useEffect(() => {
    if (opened && wide) pane.current?.focus({ preventScroll: true });
  }, [opened, wide]);
  useEffect(() => {
    if (!opened || !wide) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) preview.close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const firstUserId = messages.find((message) => message.role === 'user')?.id;
  const openKey = preview.state.status === 'vide' ? null : preview.state.key;
  const active = hovered ?? openKey;
  const streaming = reply.status === 'flux' || reply.status === 'attente';
  const liveKey = replyId.current || 'reponse-en-cours';
  const latest = streaming ? liveKey : messages.findLast((m) => m.role === 'assistant')?.id;
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
        <Button asChild size="sm" icon={LogIn}>
          <Link href="/connexion">{t('signInAgain')}</Link>
        </Button>
      ),
    };
  else if (reply.status === 'origine')
    notice = {
      text: t('wrongOrigin', { origin: appOrigin }),
      action: (
        <Button asChild size="sm" icon={ExternalLink}>
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
    <div ref={root}>
      {/* le volet ne prend sa colonne qu'une fois une source ouverte : sinon le fil a toute la largeur */}
      <div
        className={
          wide && opened ? 'grid grid-cols-[minmax(0,1fr)_400px] items-start gap-x-8' : undefined
        }
      >
        {/* une colonne de lecture centrée, comme dans une conversation : le fil, puis la saisie à la même largeur */}
        <div className="mx-auto w-full max-w-[46rem] min-w-0">
          <nav aria-label={t('breadcrumb')} className="mb-3">
            <Link
              href="/discussions"
              className="-ml-2 inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-1.5 text-ui text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
              {discussionsT('title')}
            </Link>
          </nav>
          <PageHeader
            title={title}
            // la question est aussi la première bulle : titre plus petit, la conversation reste le point focal
            className="mb-7 [&_h1]:text-h2 [&_h1]:leading-[1.3] [&_h1]:break-words"
            meta={
              <span className="inline-flex items-center gap-1.5">
                <Lock aria-hidden="true" />
                {t('visibleOnlyToYou')} · {t('privacyHint')}
              </span>
            }
          />

          <ol
            aria-label={t('messages')}
            aria-busy={busy}
            className="grid grid-cols-[minmax(0,1fr)] gap-8"
          >
            {messages.map((message) => (
              // à l'arrivée, sans entrée ; une question ou une réponse ajoutée ensuite monte
              <motion.li key={message.id} variants={rise} initial={appear} animate="animate">
                {message.role === 'user' ? (
                  <UserBubble
                    id={message.id}
                    content={message.content}
                    seeds={message.id === firstUserId ? message.citations : []}
                    active={active}
                    onOpen={preview.open}
                  />
                ) : (
                  <LeonCard
                    id={message.id}
                    content={message.content}
                    citations={message.citations}
                    fresh={message.id === fresh}
                    latest={message.id === latest}
                    active={active}
                    onOpen={preview.open}
                    onHover={setHovered}
                  />
                )}
                {message.actions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </motion.li>
            ))}
            {streaming && (
              <motion.li key={liveKey} variants={rise} initial={appear} animate="animate">
                <LeonCard
                  id={liveKey}
                  content=""
                  citations={[]}
                  live={
                    reply.status === 'attente'
                      ? { activity: RESUMING, text: '' }
                      : { activity: activityLabel(reply.activity), text: reply.text }
                  }
                  latest
                  active={active}
                  onOpen={preview.open}
                  onHover={setHovered}
                />
              </motion.li>
            )}
          </ol>

          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>

          {notice && (
            <motion.div variants={rise} initial={appear} animate="animate" className="mt-5">
              <Notice
                tone={notice.warning ? 'warning' : 'neutral'}
                // présente dès l'arrivée : pas annoncée ; une issue de réponse l'est
                live={notice.warning ? undefined : waiting ? 'status' : 'alert'}
                action={notice.action}
              >
                {notice.text}
              </Notice>
            </motion.div>
          )}

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
        {wide && preview.state.status !== 'vide' && (
          <PreviewPane ref={pane} state={preview.state} onClose={preview.close} />
        )}
      </div>
      {!wide && <PreviewSheet state={preview.state} onClose={preview.close} />}
    </div>
  );
}
