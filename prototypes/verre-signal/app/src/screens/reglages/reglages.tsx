import { KeyRound, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertDialog, Button, CodeLine, CopyButton, Dialog, DialogTrigger, EmptyState, GlassCard, PageHeader, Section, toast } from '@/components';
import { CLAUDE_CODE_COMMAND, type PersonalToken, SERVER_URL, TOKENS } from '@/data';
import { cn, duration, ease, formatDate, formatRelative, nb, springSoft, useInstant, wait } from '@/lib';
import { CREATE_DEMOS, type CreateDemo, CreateTokenContent } from './create-token';

// L'adresse du serveur est celle où tourne le prototype (le vrai Leon prend la sienne).
const ORIGIN = window.location.origin;
const COMMAND = CLAUDE_CODE_COMMAND.replace(SERVER_URL, ORIGIN);

const INLINE = 'rounded-[6px] border border-line bg-glass-3 px-1.5 py-px font-mono text-[12.5px] tracking-normal whitespace-nowrap text-fg';
// Les sections défilent jusqu'à leur titre sous la barre mobile (56 px) ou en haut du panneau (/reglages#extension).
const SECTION = 'mt-12 first:mt-0 scroll-mt-20 shell:scroll-mt-6';
// Latence simulée : juste assez pour voir « Envoi… »
const LATENCY = 400;

export function Reglages() {
  const [params, setParams] = useSearchParams();
  const [tokens, setTokens] = useState<PersonalToken[]>(() => (params.get('vide') === '1' ? [] : TOKENS));
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ReadonlySet<string>>(new Set());
  const createRef = useRef<HTMLButtonElement>(null);
  // quitter la page interrompt les révocations en cours (pas de toast sur l'écran suivant)
  const alive = useRef<AbortSignal>(undefined);
  useEffect(() => {
    const c = new AbortController();
    alive.current = c.signal;
    // arrivée avec une ancre (/reglages#extension) : l'ossature remet le panneau en haut, on redescend à la section
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
    return () => c.abort();
  }, []);

  // ---------- Création : ?creer=1 (action ⌘K « Créer un jeton ») ouvre la fenêtre, même si l'on est déjà ici ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [demo, setDemo] = useState<CreateDemo>();
  const created = useRef<PersonalToken | null>(null);
  const creer = params.get('creer');
  useEffect(() => {
    if (!creer) return;
    setDemo(CREATE_DEMOS.includes(creer) ? (creer as CreateDemo) : undefined);
    setSession((s) => s + 1);
    setCreateOpen(true);
    // le paramètre est consommé : relancer l'action ⌘K le rouvre
    setParams((p) => (p.delete('creer'), p), { replace: true });
  }, [creer, setParams]);

  const onCreateChange = (open: boolean) => {
    if (open) (setDemo(undefined), setSession((s) => s + 1));
    else if (created.current) {
      // le jeton rejoint la liste quand la fenêtre se ferme : on le voit arriver
      const t = created.current;
      created.current = null;
      setTokens((ts) => [t, ...ts]);
      setFresh(t.id);
      // le fond du nouveau jeton s'éteint (en mouvement réduit, il reste fixe jusque-là)
      setTimeout(() => setFresh((f) => (f === t.id ? null : f)), 3000);
    }
    setCreateOpen(open);
  };

  // ---------- Révocation : ?revocation=absent|echec simule les deux erreurs du vrai Leon ----------
  const revoke = async (t: PersonalToken) => {
    const i = tokens.findIndex((x) => x.id === t.id);
    const neighbour = tokens[i + 1] ?? tokens[i - 1];
    const busy = (on: boolean) =>
      setRevoking((s) => {
        const next = new Set(s);
        if (on) next.add(t.id);
        else next.delete(t.id);
        return next;
      });
    busy(true);
    if (!(await wait(LATENCY, alive.current))) return;
    busy(false);
    const mode = params.get('revocation');
    if (mode === 'echec') return void toast.error('Impossible de révoquer. Réessayez.');
    setTokens((ts) => ts.filter((x) => x.id !== t.id));
    if (mode === 'absent') toast.error('Ce jeton n’existe plus ou est déjà révoqué.');
    else toast.success('Jeton révoqué.');
    // le bouton disparaît avec la ligne : le focus passe à la ligne voisine, ou à « Créer un jeton »
    requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-revoke="${neighbour?.id}"]`) ?? createRef.current)?.focus({ preventScroll: true }));
  };
  const revokeFirst = params.get('revoquer') === '1';

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Réglages" subtitle="Jetons d’accès et branchement des assistants" className="mb-10" />

      <Section
        id="jetons"
        title="Jetons personnels"
        description="Un jeton donne accès à ce que vous voyez. Il n’est montré qu’une fois."
        className={SECTION}
        actions={
          <Dialog open={createOpen} onOpenChange={onCreateChange}>
            <DialogTrigger asChild>
              <Button ref={createRef} variant="primary" icon={Plus}>Créer un jeton</Button>
            </DialogTrigger>
            <CreateTokenContent key={session} open={createOpen} demo={demo} onCreated={(t) => (created.current = t)} />
          </Dialog>
        }
      >
        {tokens.length > 0 && (
          <GlassCard className="p-1.5">
            <ul aria-label="Vos jetons" className="grid grid-cols-[minmax(0,1fr)]">
              <AnimatePresence initial={false}>
                {tokens.map((t, i) => (
                  <TokenRow key={t.id} token={t} fresh={fresh === t.id} revoking={revoking.has(t.id)} defaultOpen={revokeFirst && i === 0} onRevoke={() => revoke(t)} />
                ))}
              </AnimatePresence>
            </ul>
          </GlassCard>
        )}
        {tokens.length === 0 && <EmptyState icon={KeyRound} title="Aucun jeton pour l’instant." className="py-8" />}
      </Section>

      <Section id="claude-code" title="Brancher Claude Code" description="Lancez cette commande dans un terminal, en remplaçant le jeton par l’un des vôtres." className={SECTION}>
        <CommandBlock command={COMMAND} />
      </Section>

      <Section id="extension" title="Extension navigateur" className={SECTION}>
        <ol className="grid gap-3.5">
          <Step n={1}>Construisez l’extension avec <code className={INLINE}>pnpm ext:build</code>.</Step>
          <Step n={2}>
            Dans Chrome, ouvrez <code className={INLINE}>chrome://extensions</code>, activez le mode développeur, puis {nb('« Charger l’extension non empaquetée »')} et choisissez
            le dossier <code className={INLINE}>extension/.output/chrome-mv3</code>.
          </Step>
          <Step n={3}>
            Dans les options de l’extension, collez{' '}
            <a href="#jetons" className="text-accent underline decoration-accent-line underline-offset-4 hover:decoration-accent">un jeton créé ci-dessus</a>.
          </Step>
        </ol>
        <p className="mt-6 mb-2.5 text-body text-fg-2">
          Adresse du serveur, fixée à la construction de l’extension (variable <code className={INLINE}>WXT_PUBLIC_LEON_URL</code>){nb(' :')}
        </p>
        <CodeLine code={ORIGIN} />
      </Section>
    </div>
  );
}

function TokenRow({ token: t, fresh, revoking, defaultOpen, onRevoke }: { token: PersonalToken; fresh: boolean; revoking: boolean; defaultOpen: boolean; onRevoke: () => void }) {
  const instant = useInstant();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: duration.exit, ease: ease.in } }}
      transition={{ duration: duration.enter, ease: ease.out, layout: springSoft }}
      // filet entre les lignes, en retrait des bords de la carte
      className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-3 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
    >
      <div className={cn('relative flex min-h-[60px] items-center gap-4 rounded-field px-3 py-2.5 transition-opacity duration-300', revoking && 'opacity-60')}>
        {fresh && (
          // nouveau jeton : un fond d'accent qui s'éteint
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-field bg-accent-soft"
            initial={{ opacity: 1 }}
            animate={instant ? undefined : { opacity: 0 }}
            transition={{ delay: 1.6, duration: 1.2, ease: ease.inOut }}
          />
        )}
        <div className="relative min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 text-body font-medium [overflow-wrap:anywhere] text-fg">{t.name}</span>
            <code className="font-mono text-[12px] tracking-normal text-muted">leon_…{t.hint}</code>
          </p>
          {/* les morceaux ne se coupent pas en leur milieu (« 12 oct. / 2026 ») : la ligne passe à la ligne entre eux */}
          <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-label text-muted [&>span]:whitespace-nowrap">
            <span>créé le <time dateTime={t.createdAt.toISOString()}>{formatDate(t.createdAt)}</time></span>
            <span aria-hidden="true">·</span>
            <span>{t.lastUsedAt ? <>utilisé <time dateTime={t.lastUsedAt.toISOString()}>{formatRelative(t.lastUsedAt)}</time></> : 'jamais utilisé'}</span>
          </p>
        </div>
        <AlertDialog
          defaultOpen={defaultOpen}
          trigger={<Button size="sm" variant="secondary" data-revoke={t.id} loading={revoking} className="relative">{revoking ? 'Envoi…' : 'Révoquer'}</Button>}
          title={`Révoquer « ${t.name} » ?`}
          description="Les outils qui l’utilisent perdront l’accès."
          confirmLabel="Révoquer"
          onConfirm={onRevoke}
        />
      </div>
    </motion.li>
  );
}

/**
 * La commande MCP, comme une CodeLine mais qui passe à la ligne : rien n'est caché, même à 390 px.
 * « <votre jeton> » ressort : c'est la seule chose à remplacer.
 */
function CommandBlock({ command }: { command: string }) {
  const [before, after] = command.split('<votre jeton>');
  const header = before.lastIndexOf('--header');
  // une option (« --header ») ne se coupe jamais après son premier tiret ; l'adresse, elle, peut se couper n'importe où
  const words = (s: string) => s.split(/(--\S+)/).map((w, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{w}</span> : w));
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-field border border-line bg-glass-3 py-1.5 pr-1.5 pl-3.5">
      <code className="min-w-0 flex-1 py-1 text-[12.5px] leading-[1.7] tracking-normal whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-2">
        {words(before.slice(0, header))}
        {/* l'en-tête entre guillemets ne se coupe pas au milieu, sauf sur un écran étroit */}
        <span className="sm:whitespace-nowrap">
          {words(before.slice(header))}
          <span className="rounded-[4px] bg-mark-bg px-0.5 text-mark-ink">&lt;votre jeton&gt;</span>
          {after}
        </span>
      </code>
      <CopyButton value={command} />
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span aria-hidden="true" className="mt-[1px] grid size-6 place-items-center rounded-full border border-line-strong font-mono text-[11px] tracking-normal text-fg-2">{n}</span>
      <p className="text-body leading-[1.65] text-fg-2">
        <span className="sr-only">{n}. </span>
        {children}
      </p>
    </li>
  );
}
