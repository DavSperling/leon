import { ArrowUp, ChevronLeft, CircleAlert, ExternalLink, Lock, LogIn, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button, IconButton, Notice, type NoticeProps, PageHeader, Textarea, useThinking } from '@/components';
import { ACTIVITY_LABELS, type CitedSource, type Discussion, generateAnswer, type Message } from '@/data';
import { rise, simulateStream, useAppear, useInstant, useTitle, wait } from '@/lib';
import { type Live, LeonCard, type OpenSource, UserBubble } from './messages';
import { APP_ORIGIN, demoOf, leonMessage, MAX_CHARS, messagesOf, NO_MODEL, newId, type NoticeKey, previewOf, remember, replyInFlight, seedsOf, sentencesCiting, type StepKey, trackReply, userMessage } from './model';
import { PreviewPane, PreviewSheet, type PreviewState, usePreview, useWide } from './preview';

// Une discussion : les messages, la réponse de Leon en flux (ce qu'il fait, ce qu'il lit, puis son texte), les notices,
// la saisie d'une nouvelle question et l'aperçu des sources citées.

const STEP_LABELS: Record<StepKey, string> = {
  reflechit: ACTIVITY_LABELS.thinking, cherche: ACTIVITY_LABELS.searching, lit: ACTIVITY_LABELS.reading,
  activite: ACTIVITY_LABELS.activity, travaille: ACTIVITY_LABELS.working, reprise: ACTIVITY_LABELS.resuming, flux: ACTIVITY_LABELS.working,
};
/** Juste de quoi voir passer chaque étape : le premier mot arrive en moins de 1 s, comme dans la recherche. */
const STEP_MS = 200;
/** Découpe du flux (celle de simulateStream) : pour figer une réponse à mi-chemin. */
const tokensOf = (text: string) => text.match(/\[\d+\]|\s+|[^\s[]+|\[/g) ?? [];
/** Le texte lu aux lecteurs d'écran une fois la réponse finie : sans les renvois. */
const spoken = (text: string) => text.replace(/\s?\[\d+\]/g, '');

type LiveReply = Live & { id: string };

function Composer({ value, setValue, disabled, busy, onSend }: { value: string; setValue: (v: string) => void; disabled: boolean; busy: boolean; onSend: (q: string) => void }) {
  const empty = value.trim() === '';
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled || busy || empty) return;
    onSend(value.trim());
    setValue('');
  };
  // Entrée envoie, Maj + Entrée passe à la ligne ; jamais pendant la composition d'un caractère accentué.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <form
      onSubmit={submit}
      className="glass-float sticky bottom-[max(12px,env(safe-area-inset-bottom))] z-20 mt-6 rounded-box border border-line-strong p-2 shadow-float transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line focus-within:shadow-[var(--float-shadow),0_0_0_3px_var(--accent-soft)]"
    >
      <label htmlFor="question-discussion" className="sr-only">Votre question à Leon</label>
      <div className="flex items-end gap-2">
        <Textarea
          id="question-discussion"
          autoGrow
          rows={1}
          maxRows={8}
          maxLength={MAX_CHARS}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Leon ne peut pas répondre sur ce serveur' : 'Posez une autre question…'}
          className="min-h-11 border-0 bg-transparent px-2.5 py-[9px] text-lead shadow-none hover:border-0 focus-visible:shadow-none disabled:opacity-70"
        />
        <IconButton
          type="submit"
          icon={ArrowUp}
          label={busy ? 'Leon répond…' : 'Envoyer la question'}
          variant="primary"
          size="lg"
          // pendant la réponse : flèche immobile (la carte de Leon a déjà son indicateur) ; aria-disabled garde le focus
          aria-disabled={busy || undefined}
          disabled={disabled || (!busy && empty)}
          tooltip={false}
          className="size-11 rounded-field aria-disabled:opacity-50 aria-disabled:active:scale-100 [&_svg]:size-[18px]"
        />
      </div>
      {/* au doigt, il n'y a ni Entrée ni Maj */}
      <p className="px-2.5 pt-1 pb-0.5 text-label text-muted pointer-coarse:hidden">Entrée pour envoyer, Maj + Entrée pour passer à la ligne.</p>
    </form>
  );
}

/** Notices de discussion : fond de citation neutre + CircleAlert (comme le vrai Leon) ; seul « sans modèle » garde l'avertissement. */
const NEUTRAL = 'bg-glass-3 shadow-[inset_0_0_0_1px_var(--line-strong)] [&>svg]:text-muted';

export function Thread({ discussion }: { discussion: Discussion }) {
  useTitle('Discussion');
  const [params] = useSearchParams();
  const location = useLocation();
  const instant = useInstant();
  const appear = useAppear();
  const demo = useMemo(() => demoOf(discussion, params), []); // eslint-disable-line react-hooks/exhaustive-deps -- état de départ
  const [messages, setMessages] = useState<Message[]>(demo.messages);
  const [live, setLive] = useState<LiveReply | null>(null);
  const [notice, setNotice] = useState<NoticeKey | null>(demo.notice);
  const [draft, setDraft] = useState(demo.draft);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const { setThinking } = useThinking();
  const started = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const wide = useWide(root);
  const busy = live !== null;
  const firstUser = messages.find((m) => m.role === 'user');
  const lastQuestion = messages.findLast((m) => m.role === 'user')?.text ?? '';
  const seeds = useMemo(() => (firstUser?.role === 'user' && firstUser.seeds ? seedsOf(firstUser.text, firstUser.seeds) : []), [firstUser]);

  // Le contexte d'une source (pour trouver le passage lu) : les phrases qui la citent, ou la question d'origine.
  const sourcePreview = (key: string, s: CitedSource) => {
    const msg = messages.find((m) => key.startsWith(`${m.id}:`));
    return previewOf(s, msg?.role === 'assistant' ? sentencesCiting(msg.text, s.n) : (msg?.text ?? ''));
  };
  const initialPreview = useMemo<PreviewState>(() => {
    const a = demo.apercu;
    const msg = demo.messages.findLast((m) => m.role === 'assistant' && m.sources.length > 0);
    if (!a || !msg || msg.role !== 'assistant') return { status: 'vide' };
    const n = Number(a);
    const s = msg.sources.find((x) => x.n === (Number.isInteger(n) && n > 0 ? n : 1));
    if (!s) return { status: 'vide' };
    const src = previewOf(s, sentencesCiting(msg.text, s.n));
    const status = a === 'chargement' ? 'charge' : a === 'introuvable' ? 'introuvable' : a === 'erreur' ? 'erreur' : 'pret';
    return { status, key: `${msg.id}:${s.n}`, src };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = usePreview(initialPreview);
  const opened = preview.state.status !== 'vide';
  const openKey = preview.state.status === 'vide' ? null : preview.state.key;
  const onOpen: OpenSource = (key, s, trigger) => {
    preview.open(key, sourcePreview(key, s), trigger);
    // le panneau prend le focus une fois monté (la feuille le fait seule) ; Échap ou la croix le rendent au déclencheur
    if (wide) requestAnimationFrame(() => pane.current?.focus({ preventScroll: true }));
  };

  // Leon travaille : l'aurore s'intensifie tant qu'une réponse court.
  useEffect(() => setThinking(busy), [busy, setThinking]);

  async function run(question: string, opts: { repeated: boolean; freeze?: StepKey }) {
    if (!opts.repeated) {
      const q = userMessage(question);
      setMessages((m) => [...m, q]);
      remember(discussion.id, q);
    }
    setNotice(null);
    const ans = generateAnswer(question);
    const id = newId();
    const freeze = opts.freeze;
    if (freeze) {
      const label = STEP_LABELS[freeze];
      const tokens = freeze === 'flux' ? tokensOf(ans.text).slice(0, Math.ceil(tokensOf(ans.text).length * 0.45)) : [];
      setLive({ id, label, reading: freeze === 'lit' ? ans.sources.slice(0, 3) : [], tokens });
      setAnnounce(label);
      return;
    }
    // Les étapes de generateAnswer, brèves ; les sources lues arrivent ensemble.
    setLive({ id, label: ans.steps[0]!, reading: [], tokens: [] });
    for (const step of ans.steps) {
      const reading = step === ACTIVITY_LABELS.reading ? ans.sources.slice(0, 3) : null;
      setLive((l) => l && { ...l, label: step, reading: reading ?? l.reading });
      setAnnounce(step);
      await wait(STEP_MS);
    }
    await simulateStream(ans.text, { onToken: (t) => setLive((l) => l && { ...l, tokens: [...l.tokens, t] }) });
    const msg = { ...leonMessage(ans.text, ans.sources, ans.sources.length === 0), id };
    setMessages((m) => [...m, msg]);
    remember(discussion.id, msg);
    setFresh((f) => new Set(f).add(id));
    setLive(null);
    setAnnounce(spoken(ans.text));
  }

  // Une page quittée ne coupe pas la réponse : elle finit et se range dans le fil (remember).
  const reply = (q: string, repeated: boolean) => trackReply(discussion.id, run(q, { repeated }));
  const ask = (q: string) => !busy && !demo.noModel && reply(q, false);
  // Le bouton de la notice disparaît : le focus passe à la saisie au lieu de tomber sur <body>.
  const focusComposer = () => document.getElementById('question-discussion')?.focus({ preventScroll: true });
  const retry = () => {
    if (busy) return;
    focusComposer();
    reply(lastQuestion, true);
  };

  // Au chargement : une réponse commencée plus tôt est attendue ; une discussion qui n'a que sa question démarre seule.
  useEffect(() => {
    if (started.current) return; // une fois, même quand le mode strict rejoue l'effet
    started.current = true;
    const pending = replyInFlight(discussion.id);
    if (pending) {
      setNotice(null);
      setLive({ id: newId(), label: ACTIVITY_LABELS.resuming, reading: [], tokens: [] });
      setAnnounce(ACTIVITY_LABELS.resuming);
      void pending.then(() => {
        const all = messagesOf(discussion);
        setMessages(all);
        setFresh(new Set([all.at(-1)!.id]));
        setLive(null);
        const last = all.at(-1);
        if (last?.role === 'assistant') setAnnounce(spoken(last.text));
      });
    } else if (demo.freeze) void run(demo.freeze.question, { repeated: true, freeze: demo.freeze.step });
    else if (demo.autoStart && firstUser) reply(firstUser.text, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Venu de « Continuer en discussion » ou d'une nouvelle question : la suite logique est de relancer, le curseur attend
  // dans la saisie (après le focus que l'ossature pose sur <main>). Pas au doigt : le clavier cacherait la réponse.
  useEffect(() => {
    if (!((location.state as { suite?: boolean } | null)?.suite || demo.autoStart) || !matchMedia('(pointer: fine)').matches) return;
    const r = requestAnimationFrame(focusComposer);
    return () => cancelAnimationFrame(r);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- à l'arrivée seulement

  // Une question envoyée, une réponse finie, une notice : la fin du fil vient en vue (pas au chargement).
  const shownKey = `${messages.length}|${live?.id ?? ''}|${notice ?? ''}`;
  const lastKey = useRef(params.has('notice') || demo.notice || demo.draft ? '' : shownKey); // notice, fin fixe ou question en attente : visibles dès l'arrivée
  useEffect(() => {
    if (lastKey.current === shownKey) return;
    lastKey.current = shownKey;
    bottom.current?.scrollIntoView({ block: 'end', behavior: instant ? 'auto' : 'smooth' });
  }, [shownKey, instant]);
  // Pendant le flux, le texte reste en vue si l'on suit déjà la fin du fil.
  const tokenCount = live?.tokens.length ?? 0;
  useEffect(() => {
    const el = bottom.current;
    if (tokenCount && el && el.getBoundingClientRect().top < window.innerHeight + 160) el.scrollIntoView({ block: 'end' });
  }, [tokenCount]);

  // Échap ferme l'aperçu (panneau large ; la feuille gère le sien).
  useEffect(() => {
    if (!opened || !wide) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && preview.close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opened, wide]); // eslint-disable-line react-hooks/exhaustive-deps -- close ne lit que des refs et des setState

  const active = hovered ?? openKey;
  const latest = live?.id ?? messages.findLast((m) => m.role === 'assistant')?.id;
  const retryAction = { label: 'Réessayer', icon: RotateCcw, onClick: retry };
  const noticeContent: Record<NoticeKey, { text: string; action?: NoticeProps['action'] }> = {
    indisponible: { text: 'Leon n’a pas pu répondre pour le moment.', action: retryAction },
    gardee: { text: 'Leon n’a pas pu répondre pour le moment. Votre question est gardée.', action: retryAction },
    saisie: { text: 'Leon n’a pas pu répondre pour le moment. Votre question vous attend dans la saisie.' },
    occupe: { text: 'Leon répond déjà à deux de vos questions. Attendez qu’une réponse soit finie, puis réessayez.', action: retryAction },
    session: {
      text: 'Votre session a expiré : la question n’a pas été envoyée. Reconnectez-vous, puis posez-la de nouveau.',
      action: <Button asChild size="sm" icon={LogIn}><Link to="/connexion">Se reconnecter</Link></Button>,
    },
    origine: {
      text: `Leon est ouvert ici à une autre adresse que la sienne (${APP_ORIGIN}) : la question n’a pas été envoyée.`,
      // prototype : l'adresse de Leon est fictive, le bouton rouvre la discussion ici
      action: <Button asChild size="sm" icon={ExternalLink}><Link to={`/discussions/${discussion.id}`} onClick={() => (focusComposer(), setNotice(null))}>Ouvrir à cette adresse</Link></Button>,
    },
    'non-envoyee': { text: 'Leon répondait déjà dans cette discussion : votre question n’a pas été envoyée. Elle vous attend dans la saisie.' },
    sansmodele: { text: NO_MODEL },
    attente: { text: 'Cette question attend encore sa réponse.', action: { label: 'Demander la réponse', icon: RotateCcw, onClick: retry } },
  };

  return (
    <div ref={root}>
      {/* le volet ne prend sa colonne qu'une fois une source ouverte : sinon le fil a toute sa largeur */}
      <div className={wide && opened ? 'grid grid-cols-[minmax(0,880px)_400px] items-start gap-x-8' : 'max-w-[880px]'}>
        <div className="min-w-0">
          <nav aria-label="Fil d’Ariane" className="mb-3">
            <Link to="/discussions" className="-ml-2 inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-1.5 text-ui text-muted transition-colors hover:bg-hover hover:text-fg">
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
              Discussions
            </Link>
          </nav>
          <PageHeader
            title={discussion.title}
            // la question est aussi la première bulle : titre plus petit, la conversation reste le point focal
            className="mb-7 [&_h1]:text-h2 [&_h1]:leading-[1.3] [&_h1]:break-words"
            meta={<span className="inline-flex items-center gap-1.5"><Lock aria-hidden="true" />Visible de vous seul · Leon ne lit que ce que vous avez le droit de voir.</span>}
          />

          <ol aria-label="Messages de la discussion" className="grid grid-cols-[minmax(0,1fr)] gap-5">
            {/* un seul tableau : la réponse en cours a la clé du message qui la remplacera, la carte (faisceau, halo) reste le même nœud */}
            {[...messages, ...(live ? [live] : [])].map((m) => (
              // à l'arrivée, sans entrée ; une question ou une réponse ajoutée ensuite monte
              <motion.li key={m.id} variants={rise} initial={appear} animate="animate">
                {!('role' in m) ? (
                  <LeonCard id={m.id} text="" sources={[]} live={m} latest active={active} onOpen={onOpen} onHover={setHovered} />
                ) : m.role === 'user' ? (
                  <UserBubble id={m.id} text={m.text} seeds={m === firstUser ? seeds : []} active={active} onOpen={onOpen} />
                ) : (
                  <LeonCard id={m.id} text={m.text} sources={m.sources} fixed={m.fixed} fresh={fresh.has(m.id)} latest={m.id === latest} active={active} onOpen={onOpen} onHover={setHovered} />
                )}
              </motion.li>
            ))}
          </ol>

          <p className="sr-only" role="status" aria-live="polite">{announce}</p>

          {notice && (
            <motion.div variants={rise} initial={appear} animate="animate" className="mt-5">
              <Notice
                tone={notice === 'sansmodele' ? 'warning' : 'info'}
                icon={notice === 'sansmodele' ? undefined : CircleAlert}
                className={notice === 'sansmodele' ? undefined : NEUTRAL}
                live={notice === 'attente' ? 'status' : 'alert'}
                action={noticeContent[notice].action}
              >
                {noticeContent[notice].text}
              </Notice>
            </motion.div>
          )}

          <Composer value={draft} setValue={setDraft} disabled={demo.noModel} busy={busy} onSend={ask} />
          {/* l'interstice sous la saisie collée : ce qui défile dessous y est flouté */}
          <div aria-hidden="true" className="pointer-events-none sticky bottom-0 z-10 h-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl" />
          {/* sous la saisie : défiler jusqu'ici montre le dernier message au-dessus d'elle */}
          <div ref={bottom} />
        </div>
        {wide && preview.state.status !== 'vide' && <PreviewPane ref={pane} state={preview.state} enter={appear !== false} onClose={preview.close} />}
      </div>
      {!wide && <PreviewSheet state={preview.state} onClose={preview.close} />}
    </div>
  );
}
