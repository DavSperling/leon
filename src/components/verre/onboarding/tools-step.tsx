'use client';

import { ArrowLeft, Check, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseToolsAction } from '@/app/(onboarding)/bienvenue/actions';
import type { ProviderId } from '@/capture/turn';
import { ReturnNotice } from '@/components/verre/connexions/return-notice';
import { AddConnection, ToolDialog } from '@/components/verre/connexions/tool-dialog';
import { Badge } from '@/components/verre/ui/badge';
import { Button } from '@/components/verre/ui/button';
import { ToolIcon } from '@/components/verre/ui/chips';
import { Notice } from '@/components/verre/ui/feedback';
import { toast } from '@/components/verre/ui/toast';
import type { OAuthNotice } from '@/lib/connection-form';
import type { OnboardingStepId } from '@/lib/onboarding';
import { rise } from '@/lib/verre';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { CodeToolsCard } from './code-tools-card';
import { PreviewCard } from './preview';
import { OnboardingSteps } from './steps';
import { codeToolsFirst, connectQueue, defaultChecked, type ToolState } from './tools-model';

export type ToolsStepProps = {
  states: ToolState[];
  viewerId: string;
  now: Date;
  canConnect: boolean;
  /** Lien d'accord de l'administrateur de l'outil du retour : il vient du catalogue, jamais de l'adresse. */
  consentUrl: string | null;
  nextHref: '/bienvenue/collaborateurs' | '/bienvenue/pret';
  steps: OnboardingStepId[];
  notice: OAuthNotice | null;
  /** La file « Branchez-les un par un » plutôt que le choix : après « Brancher », et au retour de l'éditeur. */
  connecting: boolean;
  /** Le choix gardé (cookie) ; null : les outils conseillés. */
  chosen: ProviderId[] | null;
  /** `curl -fsSL <leon>/install | sh`, bâtie côté serveur (`installCommand`) ; null quand l'adresse du serveur est refusée : le bloc « Vos outils de code » ne s'affiche pas. */
  codeCommand: string | null;
  /** La consigne de « Je demande à Claude » (`claudeCodeInstructions`) ; null avec la commande. */
  codeInstructions: string | null;
};

/** Le logo en grand, sur son fond blanc (voir ToolIcon). */
const BigIcon = ({ id }: { id: ProviderId }) => (
  <ToolIcon kind={id} boxed className="size-9 rounded-field [&>img]:size-[18px]" />
);

// Une carte à cocher pour un outil proposé et libre ; un outil déjà branché (par moi ou l'équipe) se lit seulement.
// La vraie case reste dans le formulaire (lue au clavier et par les lecteurs d'écran), la pastille la dessine.
function ChoiceTile({
  state,
  on,
  onToggle,
}: {
  state: ToolState;
  on: boolean;
  onToggle: () => void;
}) {
  const tt = useTranslations('onboarding.tools');
  const { item, status, recommended, connectedBy, broken } = state;
  const note = broken
    ? tt('reconnectNeeded')
    : status === 'mine'
      ? tt('connected')
      : status === 'team'
        ? tt('connectedBy', { name: connectedBy ?? '' })
        : item.privateRaw
          ? tt('private')
          : tt('shared');
  const body = (
    <>
      <BigIcon id={item.id} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ui font-medium text-fg [overflow-wrap:anywhere]">{item.label}</span>
          {recommended && status === 'free' && <Badge tone="accent">{tt('recommended')}</Badge>}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-meta [overflow-wrap:anywhere]',
            broken ? 'text-warning' : 'text-muted',
          )}
        >
          {note}
        </span>
      </span>
    </>
  );
  const shape = 'flex min-h-16 min-w-0 items-center gap-3 rounded-card border p-3';
  if (status !== 'free')
    return (
      <div className={cn(shape, 'border-line bg-glass-2')}>
        {body}
        {!broken && (
          <Check aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-success" />
        )}
      </div>
    );
  return (
    <label
      className={cn(
        shape,
        'cursor-pointer transition-[border-color,background-color] duration-200 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring',
        on
          ? 'border-accent-line bg-accent-soft'
          : 'border-line bg-glass-3 hover:border-line-strong',
      )}
    >
      <input
        type="checkbox"
        name="outils"
        value={item.id}
        checked={on}
        onChange={onToggle}
        className="sr-only"
      />
      {body}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-200',
          on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong',
        )}
      >
        {on && <Check strokeWidth={2.6} className="size-3" />}
      </span>
    </label>
  );
}

// Les outils qu'on ne propose pas encore : les conseillés d'abord, huit au plus, puis le nombre des autres.
function SoonList({ states }: { states: ToolState[] }) {
  const tt = useTranslations('onboarding.tools');
  const id = useId();
  const sorted = [...states].sort((a, b) => Number(b.recommended) - Number(a.recommended));
  const shown = sorted.slice(0, 8);
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="mb-2 text-label font-semibold text-fg-2">
        {tt('soonTitle')}
      </h2>
      <ul className="flex flex-wrap items-center gap-1.5">
        {shown.map(({ item }) => (
          <li
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-glass-2 py-1 pr-2 pl-1 text-label text-muted"
          >
            <ToolIcon kind={item.id} className="opacity-60 grayscale" />
            {item.label}
          </li>
        ))}
        {sorted.length > shown.length && (
          <li className="px-1 text-label text-muted">
            {tt('soonMore', { count: sorted.length - shown.length })}
          </li>
        )}
      </ul>
      <p className="mt-2 text-label text-muted">{nb(tt('soonText'))}</p>
    </section>
  );
}

function ChooseSubmit({ count }: { count: number }) {
  const tt = useTranslations('onboarding.tools');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
      {tt('connectCount', { count })}
    </Button>
  );
}

// Une ligne de l'aperçu : le logo, le nom (et ce qui s'y ajoute), puis l'action ou l'état. `stacked` : l'action passe sous le
// nom (« GitHub · Connected by Inès » ne tient pas à côté d'un bouton dans 233 px) ; sinon elle suit le nom, et descend
// seulement si elle ne tient pas.
function Row({
  id,
  label,
  extra,
  stacked,
  children,
}: {
  id: ProviderId;
  label: string;
  extra?: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  const name = (
    <span className="min-w-0 text-ui text-fg [overflow-wrap:anywhere]">
      {label}
      {extra && <span className="text-muted"> · {extra}</span>}
    </span>
  );
  if (stacked)
    return (
      <li className="flex min-w-0 items-start gap-3">
        <ToolIcon kind={id} boxed className="mt-px" />
        <div className="grid min-w-0 flex-1 justify-items-start gap-2">
          {name}
          {children}
        </div>
      </li>
    );
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-28 items-center gap-3">
        <ToolIcon kind={id} boxed />
        {name}
      </div>
      {children}
    </li>
  );
}

/** Une ligne de la file : faite, à reconnecter (la fenêtre de l'outil), ou à brancher (le formulaire s'ouvre dessous). */
function QueueItem({
  state,
  index,
  active,
  canConnect,
  onOpen,
  onReconnect,
  onAdded,
}: {
  state: ToolState;
  index: number;
  active: boolean;
  canConnect: boolean;
  onOpen: () => void;
  onReconnect: () => void;
  onAdded: () => void;
}) {
  const tt = useTranslations('onboarding.tools');
  const tc = useTranslations('connections');
  const { item, status, broken } = state;
  const done = status === 'mine' && !broken;
  return (
    <li
      data-queue={item.id}
      className={cn(
        'min-w-0 rounded-card border transition-[border-color,background-color] duration-200',
        active ? 'border-accent-line bg-glass-3' : 'border-line bg-glass-2',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3 p-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border text-meta',
            done
              ? 'border-success-line bg-success-soft text-success'
              : active
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line-strong text-muted',
          )}
        >
          {done ? <Check strokeWidth={2.4} className="size-3.5" /> : index + 1}
        </span>
        <BigIcon id={item.id} />
        <div className="min-w-0 flex-1 basis-24">
          <p className="text-ui font-medium text-fg [overflow-wrap:anywhere]">{item.label}</p>
          <p className={cn('text-meta', broken ? 'text-warning' : 'text-muted')}>
            {done ? tt('connected') : broken ? tt('reconnectNeeded') : tt('toConnect')}
          </p>
        </div>
        {broken ? (
          <Button size="sm" variant="secondary" onClick={onReconnect}>
            {tt('reconnect')}
            <span className="sr-only"> {item.label}</span>
          </Button>
        ) : (
          !done &&
          !active && (
            <Button size="sm" variant="quiet" onClick={onOpen}>
              {tt('connect')}
              <span className="sr-only"> {item.label}</span>
            </Button>
          )
        )}
      </div>
      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key={item.id}
            variants={rise}
            initial="initial"
            animate="animate"
            className="grid gap-4 border-t border-line px-3 pt-4 pb-4 sm:px-4"
          >
            <p className="text-ui text-fg-2">
              {nb(
                item.privateRaw
                  ? tc('privateTool', { provider: item.label })
                  : tc('sharedTool', { provider: item.label }),
              )}
            </p>
            {canConnect ? (
              <AddConnection entry={item} onAdded={onAdded} returnTo="/bienvenue/outils" />
            ) : (
              <p className="text-ui text-fg-2">{nb(tc('connectorsUnavailable'))}</p>
            )}
            {item.warning && (
              <p className="flex gap-2 text-label text-fg-2">
                <TriangleAlert
                  aria-hidden="true"
                  strokeWidth={1.8}
                  className="mt-[2px] size-3.5 shrink-0 text-warning"
                />
                {nb(item.warning)}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * L'étape Vos outils de l'onboarding, en deux temps. D'abord le choix : seuls les outils qu'on sait brancher en un clic
 * sont proposés (les conseillés pour le poste déjà cochés), les autres sont annoncés « Bientôt ». Puis « Branchez-les
 * un par un » : chaque outil choisi, son bouton de connexion dans la page, et la progression. Le choix vit dans un
 * cookie (le départ chez l'éditeur recharge la page), rien n'est gardé en base.
 */
export function ToolsStep({
  states,
  viewerId,
  now,
  canConnect,
  consentUrl,
  nextHref,
  steps,
  notice,
  connecting,
  chosen,
  codeCommand,
  codeInstructions,
}: ToolsStepProps) {
  const t = useTranslations('onboarding');
  const tt = useTranslations('onboarding.tools');
  const tm = useTranslations('onboarding.teammates');
  const tc = useTranslations('connections');
  const router = useRouter();
  const [checked, setChecked] = useState<ReadonlySet<ProviderId>>(() =>
    chosen ? new Set(chosen) : defaultChecked(states),
  );
  // Au retour d'un échec chez l'éditeur, l'outil concerné reste ouvert, prêt à réessayer.
  const [openId, setOpenId] = useState<ProviderId | null>(
    notice?.tone === 'error' ? notice.tool : null,
  );
  const [shownId, setShownId] = useState<ProviderId | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  // Une clé branchée ne change que la base : on recharge pour que la file la voie.
  const [refreshing, startRefresh] = useTransition();
  // Le bouton qui a ouvert la fenêtre, et la colonne principale pour lui succéder quand il disparaît avec le rechargement.
  const opener = useRef<HTMLElement | null>(null);
  const mainBox = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const userOpened = useRef(false);

  const toggle = (id: ProviderId) => {
    const next = new Set(checked);
    if (!next.delete(id)) next.add(id);
    setChecked(next);
  };
  // La fenêtre de l'outil : reconnecter ma connexion en erreur, ou brancher mon compte d'un outil de l'équipe.
  const connect = (id: ProviderId) => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setSession((n) => n + 1);
    setShownId(id);
    setOpen(true);
  };
  // Pas de signal de réussite côté fenêtre : on recharge à chaque fermeture.
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) startRefresh(() => router.refresh());
  };
  // Le focus attend la fin du rechargement : le bouton d'un outil qui vient d'être branché n'existe plus ensuite.
  const restoreFocus = () => {
    focusPending.current = false;
    (opener.current?.isConnected ? opener.current : mainBox.current)?.focus();
  };
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    if (refreshing) focusPending.current = true;
    else restoreFocus();
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: restoreFocus ne lit que des refs
  useEffect(() => {
    if (!refreshing && focusPending.current) restoreFocus();
  }, [refreshing]);

  const offered = states.filter((s) => s.ready);
  const soon = states.filter((s) => !s.ready);
  const queue = connectQueue(states, checked);
  // Sans rien à brancher (un choix perdu, un autre navigateur), on revient au choix.
  const inQueue = connecting && queue.length > 0;
  const toConnect = queue.filter((s) => s.status === 'free' || s.broken).length;
  const done = queue.length - toConnect;
  // L'outil ouvert : celui qu'on a demandé s'il reste à brancher, sinon le premier qui reste.
  const current =
    queue.find((s) => s.item.id === openId && s.status === 'free') ??
    queue.find((s) => s.status === 'free') ??
    null;
  const already = states.filter((s) => s.recommended && s.connectedBy !== null);
  const shown = states.find((s) => s.item.id === shownId);
  // En tête pour un service qui travaille dans un dépôt (GitHub ou GitLab conseillé), à la fin sinon.
  const codeTools =
    codeCommand !== null ? (
      <CodeToolsCard command={codeCommand} instructions={codeInstructions} />
    ) : null;
  const codeToolsAtTop = codeToolsFirst(states);
  const nextLabel = nextHref === '/bienvenue/pret' ? tm('enter') : t('continue');

  // « Brancher » sur une autre ligne : le focus suit, sur son bouton de connexion.
  useEffect(() => {
    if (!userOpened.current) return;
    userOpened.current = false;
    mainBox.current
      ?.querySelector<HTMLElement>(`[data-queue="${current?.item.id}"] [data-autofocus]`)
      ?.focus();
  }, [current?.item.id]);
  const onAdded = () => {
    if (current) toast.success(tc('connectedToast', { provider: current.item.label }));
    startRefresh(() => router.refresh());
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <div ref={mainBox} tabIndex={-1} className="grid min-w-0 content-start gap-5 rounded-box">
        <OnboardingSteps steps={steps} current="tools" />

        {inQueue ? (
          <>
            <div>
              <Link
                href="/bienvenue/outils"
                className="mb-3 inline-flex items-center gap-1 rounded-sm text-label text-fg-2 underline-offset-4 hover:text-fg hover:underline"
              >
                <ArrowLeft aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
                {tt('edit')}
              </Link>
              <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">
                {tt('connectTitle')}
              </h1>
              <p className="mt-2 text-body text-muted">{nb(tt('connectLead'))}</p>
            </div>

            <ReturnNotice notice={notice} consentUrl={consentUrl} />

            <div>
              <p className="mb-1.5 text-label text-fg-2">
                {tt('progress', { done, total: queue.length })}
              </p>
              <div
                role="progressbar"
                aria-label={tt('progressLabel')}
                aria-valuemin={0}
                aria-valuemax={queue.length}
                aria-valuenow={done}
                className="h-1.5 overflow-hidden rounded-full bg-glass-3 shadow-[inset_0_0_0_1px_var(--line)]"
              >
                <motion.div
                  className="h-full origin-left rounded-full bg-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: done / queue.length }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            <ol className="grid gap-2.5">
              {queue.map((state, i) => (
                <QueueItem
                  key={state.item.id}
                  state={state}
                  index={i}
                  active={current?.item.id === state.item.id}
                  canConnect={canConnect}
                  onOpen={() => {
                    userOpened.current = true;
                    setOpenId(state.item.id);
                  }}
                  onReconnect={() => connect(state.item.id)}
                  onAdded={onAdded}
                />
              ))}
            </ol>

            {toConnect === 0 ? (
              <div className="grid gap-3">
                <Notice tone="success" live="status">
                  {tt('allDone')}
                </Notice>
                <Button asChild variant="primary" size="lg" className="w-full">
                  <Link href={nextHref}>{nextLabel}</Link>
                </Button>
              </div>
            ) : (
              <div className="grid justify-items-center">
                <Button asChild variant="link" size="sm">
                  <Link href={nextHref}>{tt('later')}</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <form action={chooseToolsAction} className="grid min-w-0 gap-5">
            <div>
              <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{tt('title')}</h1>
              <p className="mt-2 text-body text-muted">{nb(tt('lead'))}</p>
            </div>

            <ReturnNotice notice={notice} consentUrl={consentUrl} />

            {codeToolsAtTop && codeTools}

            {offered.length > 0 ? (
              <fieldset className="min-w-0">
                <legend className="mb-2 text-label font-semibold text-fg-2">
                  {tt('readyTitle')}
                </legend>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {offered.map((state) => (
                    <li key={state.item.id} className="min-w-0">
                      <ChoiceTile
                        state={state}
                        on={checked.has(state.item.id)}
                        onToggle={() => toggle(state.item.id)}
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : (
              <p className="text-ui text-fg-2">{nb(tt('noneReady'))}</p>
            )}

            {soon.length > 0 && <SoonList states={soon} />}

            {!codeToolsAtTop && codeTools}

            <div className="grid justify-items-center gap-3">
              {toConnect > 0 ? (
                <>
                  <ChooseSubmit count={toConnect} />
                  <Button asChild variant="link" size="sm">
                    <Link href={nextHref}>{tt('skip')}</Link>
                  </Button>
                </>
              ) : (
                <Button asChild variant="primary" size="lg" className="w-full">
                  <Link href={nextHref}>{nextLabel}</Link>
                </Button>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="grid min-w-0 content-center gap-4 rounded-box border border-line bg-glass p-4 sm:p-6">
        {!inQueue && (
          <PreviewCard title={tt('selectionTitle')}>
            {queue.length === 0 ? (
              <p className="text-ui text-muted">{tt('none')}</p>
            ) : (
              <ul className="grid gap-2.5">
                <AnimatePresence initial={false}>
                  {queue.map(({ item, status, broken }) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <ToolIcon kind={item.id} boxed />
                      <span className="min-w-0 flex-1 text-ui text-fg [overflow-wrap:anywhere]">
                        {item.label}
                      </span>
                      {status === 'mine' && !broken ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-label text-fg-2">
                          <Check
                            aria-hidden="true"
                            strokeWidth={2}
                            className="size-3.5 text-success"
                          />
                          {tt('connected')}
                        </span>
                      ) : (
                        <span className="shrink-0 text-label text-muted">
                          {broken ? tt('reconnectNeeded') : tt('toConnect')}
                        </span>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </PreviewCard>
        )}

        {inQueue && (
          <PreviewCard title={tt('howTitle')}>
            <ol className="grid gap-2.5">
              {(['one', 'two', 'three'] as const).map((key, i) => (
                <li key={key} className="flex gap-2.5 text-ui text-fg-2">
                  <span
                    aria-hidden="true"
                    className="grid size-5 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft text-meta text-accent"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{nb(tt(`how.${key}`))}</span>
                </li>
              ))}
            </ol>
          </PreviewCard>
        )}

        {already.length > 0 && (
          <PreviewCard title={tt('alreadyTitle')}>
            <ul className="grid gap-2.5">
              {already.map(({ item, status, connectedBy }) => (
                <Row
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  stacked
                  extra={tt('connectedBy', { name: connectedBy ?? '' })}
                >
                  {status === 'mine' ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-label text-fg-2">
                      <Check aria-hidden="true" strokeWidth={2} className="size-3.5 text-success" />
                      {tt('ownConnected')}
                    </span>
                  ) : (
                    <Button size="sm" variant="quiet" onClick={() => connect(item.id)}>
                      {tt('connectOwn')}
                      <span className="sr-only"> {item.label}</span>
                    </Button>
                  )}
                </Row>
              ))}
            </ul>
            {already.some((s) => s.status !== 'mine') && (
              <p className="mt-3 text-label text-muted">{nb(tt('ownHint'))}</p>
            )}
          </PreviewCard>
        )}

        <PreviewCard title={tt('nextTitle')}>
          <p className="text-ui text-muted">{nb(tt('nextText'))}</p>
        </PreviewCard>
      </div>

      <ToolDialog
        entry={shown?.item ?? null}
        open={open}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={onCloseAutoFocus}
        // Un outil branché par l'équipe n'a aucune connexion du lecteur ; la sienne en erreur offre « Reconnecter ».
        conns={shown?.broken ? [shown.broken] : []}
        viewerId={viewerId}
        now={now}
        canConnect={canConnect}
        session={session}
        returnTo="/bienvenue/outils"
      />
    </div>
  );
}
