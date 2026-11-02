'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import { ReturnNotice } from '@/components/verre/connexions/return-notice';
import { ToolDialog } from '@/components/verre/connexions/tool-dialog';
import { Button } from '@/components/verre/ui/button';
import { ToolIcon } from '@/components/verre/ui/chips';
import type { OAuthNotice } from '@/lib/connection-form';
import { PROVIDER_FAMILIES_ORDER } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { ConnectionView } from '@/server/connectors/connections';
import { PreviewCard } from './preview';
import type { ToolState } from './tools-model';

export type ToolsStepProps = {
  states: ToolState[];
  conns: ConnectionView[];
  viewerId: string;
  now: Date;
  canConnect: boolean;
  /** Lien d'accord de l'administrateur de l'outil du retour : il vient du catalogue, jamais de l'adresse. */
  consentUrl: string | null;
  nextHref: '/bienvenue/collaborateurs' | '/bienvenue/pret';
  notice: OAuthNotice | null;
};

// Une tuile à cocher pour un outil à brancher ; un outil déjà branché (par moi ou par l'équipe) se lit seulement.
function Tile({ state, on, onToggle }: { state: ToolState; on: boolean; onToggle: () => void }) {
  const t = useTranslations('onboarding.tools');
  const { item, status, recommended, connectedBy } = state;
  const note =
    status === 'mine'
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
          <span className="block text-meta text-muted [overflow-wrap:anywhere]">{note}</span>
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

// Une ligne de l'aperçu : le logo, le nom (et ce qui s'y ajoute), puis l'action ou l'état.
function Row({
  id,
  label,
  extra,
  children,
}: {
  id: ProviderId;
  label: string;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <ToolIcon kind={id} boxed />
      <span className="min-w-0 flex-1 text-ui text-fg [overflow-wrap:anywhere]">
        {label}
        {extra && <span className="text-muted"> · {extra}</span>}
      </span>
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
  conns,
  viewerId,
  now,
  canConnect,
  consentUrl,
  nextHref,
  notice,
}: ToolsStepProps) {
  const t = useTranslations('onboarding');
  const tt = useTranslations('onboarding.tools');
  const tm = useTranslations('onboarding.teammates');
  const tf = useTranslations('connections.family');
  const router = useRouter();
  const [checked, setChecked] = useState<ReadonlySet<ProviderId>>(
    () =>
      new Set(
        states
          .filter((s) => s.recommended && s.status === 'free' && s.item.available)
          .map((s) => s.item.id),
      ),
  );
  const [shownId, setShownId] = useState<ProviderId | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  const toggle = (id: ProviderId) =>
    setChecked((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const connect = (id: ProviderId) => {
    setSession((n) => n + 1);
    setShownId(id);
    setOpen(true);
  };
  // Une clé branchée dans la fenêtre ne change que la base : on recharge pour que les tuiles et l'aperçu la voient.
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) router.refresh();
  };

  const toConnect = states.filter((s) => s.status === 'free' && checked.has(s.item.id));
  const already = states.filter((s) => s.recommended && s.connectedBy !== null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid min-w-0 content-start gap-5">
        <div>
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{tt('title')}</h1>
          <p className="mt-2 text-body text-muted">{nb(tt('lead'))}</p>
        </div>

        <ReturnNotice notice={notice} consentUrl={consentUrl} />

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
                      on={checked.has(state.item.id)}
                      onToggle={() => toggle(state.item.id)}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}

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
        <PreviewCard title={tt('toConnect')}>
          {toConnect.length === 0 ? (
            <p className="text-ui text-muted">{tt('none')}</p>
          ) : (
            <ul className="grid gap-2.5">
              {toConnect.map(({ item }) => (
                <Row key={item.id} id={item.id} label={item.label}>
                  <Button size="sm" variant="secondary" onClick={() => connect(item.id)}>
                    {tt('connect')}
                    <span className="sr-only"> {item.label}</span>
                  </Button>
                </Row>
              ))}
            </ul>
          )}
        </PreviewCard>

        {already.length > 0 && (
          <PreviewCard title={tt('alreadyTitle')}>
            <ul className="grid gap-2.5">
              {already.map(({ item, status, connectedBy }) => (
                <Row
                  key={item.id}
                  id={item.id}
                  label={item.label}
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
        entry={states.find((s) => s.item.id === shownId)?.item ?? null}
        open={open}
        onOpenChange={onOpenChange}
        // les siennes seulement : un outil à brancher (ou branché par l'équipe) n'en a aucune
        conns={conns.filter((c) => c.provider === shownId && c.isCreator)}
        viewerId={viewerId}
        now={now}
        canConnect={canConnect}
        session={session}
        returnTo="/bienvenue/outils"
      />
    </div>
  );
}
