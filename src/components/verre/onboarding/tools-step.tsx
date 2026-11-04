'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import type { ProviderId } from '@/capture/turn';
import { ReturnNotice } from '@/components/verre/connexions/return-notice';
import { ToolDialog } from '@/components/verre/connexions/tool-dialog';
import { Button } from '@/components/verre/ui/button';
import { ToolIcon } from '@/components/verre/ui/chips';
import type { OAuthNotice } from '@/lib/connection-form';
import type { OnboardingStepId } from '@/lib/onboarding';
import { PROVIDER_FAMILIES_ORDER } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { CodeToolsCard } from './code-tools-card';
import { PreviewCard } from './preview';
import { OnboardingSteps } from './steps';
import { codeToolsFirst, defaultChecked, savedChecked, type ToolState } from './tools-model';

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
  /** `curl -fsSL <leon>/install | sh`, bâtie côté serveur (`installCommand`) ; null quand l'adresse du serveur est refusée : le bloc « Vos outils de code » ne s'affiche pas. */
  codeCommand: string | null;
  /** La consigne de « Je demande à Claude » (`claudeCodeInstructions`) ; null avec la commande. */
  codeInstructions: string | null;
};

// Une tuile à cocher pour un outil à brancher ; un outil déjà branché (par moi ou par l'équipe) se lit seulement,
// sauf ma connexion en erreur, qui le dit : elle se reconnecte depuis l'aperçu.
function Tile({ state, on, onToggle }: { state: ToolState; on: boolean; onToggle: () => void }) {
  const t = useTranslations('onboarding.tools');
  const { item, status, recommended, connectedBy, broken } = state;
  const note = broken
    ? t('reconnectNeeded')
    : status === 'mine'
      ? t('connected')
      : status === 'team'
        ? t('connectedBy', { name: connectedBy ?? '' })
        : recommended
          ? t('recommended')
          : null;
  const content = (
    <>
      <ToolIcon kind={item.id} boxed />
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-medium text-fg [overflow-wrap:anywhere]">
          {item.label}
        </span>
        {note && (
          <span
            className={cn(
              'block text-meta [overflow-wrap:anywhere]',
              broken ? 'text-warning' : 'text-muted',
            )}
          >
            {note}
          </span>
        )}
      </span>
      {on && <Check aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-accent" />}
    </>
  );
  const shape =
    'inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-field border px-3 py-2';
  if (status !== 'free')
    return <div className={cn(shape, 'border-line bg-glass-2')}>{content}</div>;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        shape,
        'text-left transition-[border-color,background-color] duration-200',
        on
          ? 'border-accent-line bg-accent-soft'
          : 'border-line bg-glass-3 hover:border-line-strong',
      )}
    >
      {content}
    </button>
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

/**
 * L'étape Vos outils de l'onboarding : on coche ce qu'on utilise (les outils conseillés pour le poste le sont déjà), et
 * l'aperçu à droite (dessous en dessous de 1024 px) liste ce qu'il reste à brancher. Rien n'est gardé en base.
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
  codeCommand,
  codeInstructions,
}: ToolsStepProps) {
  const t = useTranslations('onboarding');
  const tt = useTranslations('onboarding.tools');
  const tm = useTranslations('onboarding.teammates');
  const tf = useTranslations('connections.family');
  const router = useRouter();
  const [checked, setChecked] = useState(() => defaultChecked(states));
  const [shownId, setShownId] = useState<ProviderId | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  // Une clé branchée dans la fenêtre ne change que la base : on recharge pour que les tuiles et l'aperçu la voient.
  const [refreshing, startRefresh] = useTransition();
  // Le bouton qui a ouvert la fenêtre, et la liste « À brancher » pour lui succéder quand il disparaît avec le rechargement.
  const opener = useRef<HTMLElement | null>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  // Les outils cochés restent dans l'onglet : un branchement OAuth quitte la page, qui revient rechargée. Lus après
  // l'hydratation, pour que le serveur et le client rendent la même chose.
  const storageKey = `leon.bienvenue.outils.${viewerId}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: à l'arrivée seulement ; ensuite, `toggle` écrit
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(storageKey);
    } catch {}
    const saved = savedChecked(states, raw);
    if (saved) setChecked(saved);
  }, []);
  const toggle = (id: ProviderId) => {
    const next = new Set(checked);
    if (!next.delete(id)) next.add(id);
    setChecked(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {}
  };
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
    (opener.current?.isConnected ? opener.current : listBox.current)?.focus();
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

  // À reconnecter d'abord (ma connexion ne lit plus rien), puis ce que j'ai coché.
  const toConnect = [
    ...states.filter((s) => s.broken),
    ...states.filter((s) => s.status === 'free' && checked.has(s.item.id)),
  ];
  const already = states.filter((s) => s.recommended && s.connectedBy !== null);
  const shown = states.find((s) => s.item.id === shownId);
  // En tête pour un service qui travaille dans un dépôt (GitHub ou GitLab conseillé), à la fin sinon.
  const codeTools =
    codeCommand !== null ? (
      <CodeToolsCard command={codeCommand} instructions={codeInstructions} />
    ) : null;
  const codeToolsAtTop = codeToolsFirst(states);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid min-w-0 content-start gap-5">
        <OnboardingSteps steps={steps} current="tools" />
        <div>
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{tt('title')}</h1>
          <p className="mt-2 text-body text-muted">{nb(tt('lead'))}</p>
        </div>

        <ReturnNotice notice={notice} consentUrl={consentUrl} />

        {codeToolsAtTop && codeTools}

        {PROVIDER_FAMILIES_ORDER.map((family) => {
          const tools = states.filter((s) => s.item.available && s.item.family === family);
          if (tools.length === 0) return null;
          return (
            <fieldset key={family} className="min-w-0">
              <legend className="mb-1.5 text-label font-semibold text-fg-2">{tf(family)}</legend>
              <ul className="flex flex-wrap gap-2">
                {tools.map((state) => (
                  <li key={state.item.id} className="max-w-full min-w-0">
                    <Tile
                      state={state}
                      on={state.status === 'free' && checked.has(state.item.id)}
                      onToggle={() => toggle(state.item.id)}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}

        {!codeToolsAtTop && codeTools}

        <div className="grid justify-items-center gap-3">
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href={nextHref}>
              {nextHref === '/bienvenue/pret' ? tm('enter') : t('continue')}
            </Link>
          </Button>
          <Button asChild variant="link" size="sm">
            <Link href={nextHref}>{tt('skip')}</Link>
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 content-center gap-4 rounded-box border border-line bg-glass p-4 sm:p-6">
        <div ref={listBox} tabIndex={-1} className="rounded-box">
          <PreviewCard title={tt('toConnect')}>
            {toConnect.length === 0 ? (
              <p className="text-ui text-muted">{tt('none')}</p>
            ) : (
              <ul className="grid gap-2.5">
                {toConnect.map(({ item, broken }) => (
                  <Row key={item.id} id={item.id} label={item.label}>
                    <Button size="sm" variant="secondary" onClick={() => connect(item.id)}>
                      {broken ? tt('reconnect') : tt('connect')}
                      <span className="sr-only"> {item.label}</span>
                    </Button>
                  </Row>
                ))}
              </ul>
            )}
          </PreviewCard>
        </div>

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
        // Un outil à brancher, ou branché par l'équipe, n'a aucune connexion du lecteur ; la sienne en erreur offre « Reconnecter ».
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
