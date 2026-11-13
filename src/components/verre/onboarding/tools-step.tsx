'use client';

import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseToolsAction } from '@/app/(onboarding)/bienvenue/actions';
import type { ProviderId } from '@/capture/turn';
import { ReturnNotice } from '@/components/verre/connexions/return-notice';
import { ToolDialog } from '@/components/verre/connexions/tool-dialog';
import { Button } from '@/components/verre/ui/button';
import { ToolLogo } from '@/components/verre/ui/chips';
import { Thing } from '@/components/verre/ui/thing';
import type { OAuthNotice } from '@/lib/connection-form';
import type { OnboardingStepId } from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { CodeToolsCard } from './code-tools-card';
import { CONVERGE, Converge } from './converge';
import { StaticThing } from './preview';
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

const H1 = 'text-h1 font-semibold tracking-[-0.02em] text-fg';
const H2 = 'text-h2 font-semibold tracking-[-0.012em] text-fg';

/** Ce qu'un outil déjà là dit en légende : branché par moi, par l'équipe, ou à reconnecter. */
function useStatusCaption() {
  const tt = useTranslations('onboarding.tools');
  return ({ status, connectedBy, broken }: ToolState) =>
    broken
      ? tt('reconnectNeeded')
      : status === 'mine'
        ? tt('connected')
        : tt('connectedBy', { name: connectedBy ?? '' });
}

const tick = (
  <Check aria-hidden="true" strokeWidth={2.2} className="size-4 shrink-0 text-success" />
);

// Une tuile à cocher pour un outil proposé et libre : toute la tuile est le libellé de la vraie case (lue au clavier et
// par les lecteurs d'écran) ; choisie, un trait d'encre et sa coche. Un outil déjà branché se lit seulement.
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
  const caption = useStatusCaption();
  const { item, status, broken } = state;
  const picture = <ToolLogo kind={item.id} size={28} />;
  if (status !== 'free')
    return (
      <StaticThing
        picture={picture}
        name={item.label}
        caption={caption(state)}
        error={Boolean(broken)}
        end={!broken && tick}
      />
    );
  return (
    <label
      className={cn(
        'tl tile cursor-pointer has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-fg',
        on && 'border-fg hover:border-fg',
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
      <span className="tl__pic">{picture}</span>
      <span className="tl__id">
        <span className="tl__name">{item.label}</span>
        <span className="tl__sub">{item.privateRaw ? tt('private') : tt('shared')}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150',
          on ? 'border-ink bg-ink text-on-ink' : 'border-line-strong',
        )}
      >
        {on && <Check strokeWidth={2.6} className="size-3" />}
      </span>
    </label>
  );
}

function ChooseSubmit({ count }: { count: number }) {
  const tt = useTranslations('onboarding.tools');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {tt('connectCount', { count })}
    </Button>
  );
}

/** Le titre de la vue à gauche, ses actions à droite (la seule pastille d'encre de la vue en dernier). */
function Head({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <h1 className={H1}>{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Une section de tuiles : son titre, puis la grille du kit (mêmes colonnes que partout). */
function Tiles({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className={cn(H2, 'mb-3')}>{title}</legend>
      <ul className="things">{children}</ul>
    </fieldset>
  );
}

/**
 * L'étape Vos outils de l'onboarding, en deux temps. D'abord le choix : seuls les outils qu'on sait brancher en un clic
 * sont proposés (les conseillés pour le poste déjà cochés), les autres sont annoncés « Bientôt ». Puis « Branchez-les
 * un par un » : chaque outil choisi est une carte ; un clic ouvre son panneau de Connexions (le même qu'ailleurs). Le
 * choix vit dans un cookie (le départ chez l'éditeur recharge la page), rien n'est gardé en base.
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
  const router = useRouter();
  const [checked, setChecked] = useState<ReadonlySet<ProviderId>>(() =>
    chosen ? new Set(chosen) : defaultChecked(states),
  );
  // Au retour d'un échec chez l'éditeur, le panneau de l'outil concerné s'ouvre, prêt à réessayer, avec le retour.
  const failed = connecting && notice?.tone === 'error' ? notice.tool : null;
  const [shownId, setShownId] = useState<ProviderId | null>(failed);
  const [open, setOpen] = useState(failed !== null);
  const [session, setSession] = useState(0);
  // Une clé branchée ne change que la base : on recharge pour que la file la voie.
  const [refreshing, startRefresh] = useTransition();
  const mainBox = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  const toggle = (id: ProviderId) => {
    const next = new Set(checked);
    if (!next.delete(id)) next.add(id);
    setChecked(next);
  };
  // Le panneau de l'outil : le brancher, reconnecter ma connexion en erreur, ou brancher mon compte d'un outil de
  // l'équipe. Le panneau rend lui-même le focus à ce qui l'a ouvert.
  const connect = (id: ProviderId) => {
    setSession((n) => n + 1);
    setShownId(id);
    setOpen(true);
  };
  // Pas de signal de réussite côté panneau : on recharge à chaque fermeture.
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) startRefresh(() => router.refresh());
  };
  // Ce qui l'a ouvert a disparu (la carte d'un outil branché) : le focus attend la fin du rechargement, puis la vue.
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    if (refreshing) focusPending.current = true;
    else mainBox.current?.focus();
  };
  useEffect(() => {
    if (!refreshing && focusPending.current) {
      focusPending.current = false;
      mainBox.current?.focus();
    }
  }, [refreshing]);

  const offered = states.filter((s) => s.ready);
  const recommended = offered.filter((s) => s.recommended);
  const others = offered.filter((s) => !s.recommended);
  const soon = [...states.filter((s) => !s.ready)].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );
  const queue = connectQueue(states, checked);
  // Sans rien à brancher (un choix perdu, un autre navigateur), on revient au choix.
  const inQueue = connecting && queue.length > 0;
  const toConnect = queue.filter((s) => s.status === 'free' || s.broken).length;
  const done = queue.length - toConnect;
  // La prochaine à brancher porte la pastille d'encre.
  const next = queue.find((s) => s.status === 'free' || s.broken) ?? null;
  const already = states.filter((s) => s.recommended && s.connectedBy !== null);
  const shown = states.find((s) => s.item.id === shownId);
  // Le dessin, à droite : chaque outil proposé et son trait vers le point de Leon. Coché ou branché, le trait passe à
  // l'encre ; dans la file, c'est le branchement qui le trace. Au-delà de ce que le dessin tient, les traits à l'encre d'abord.
  const reads = (s: ToolState) => s.status !== 'free' && !s.broken;
  // Un serveur qui ne branche encore rien : les outils à venir, en pointillé, plutôt qu'une colonne vide.
  const lines = (inQueue ? queue : offered.length > 0 ? offered : soon.slice(0, 6)).map((s) => ({
    id: s.item.id,
    on: reads(s) || (!inQueue && s.status === 'free' && checked.has(s.item.id)),
  }));
  const drawing = lines.length > 0 && (
    <aside aria-hidden="true" className="sticky top-8 pt-1 max-lg:hidden">
      <Converge
        items={
          lines.length > CONVERGE.max
            ? [...lines.filter((l) => l.on), ...lines.filter((l) => !l.on)]
            : lines
        }
      />
    </aside>
  );
  const COLUMNS =
    'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-14 lg:grid-cols-[minmax(0,1fr)_360px]';
  // En tête pour un service qui travaille dans un dépôt (GitHub ou GitLab conseillé), à la fin sinon.
  const codeTools =
    codeCommand !== null ? (
      <CodeToolsCard command={codeCommand} instructions={codeInstructions} />
    ) : null;
  const codeToolsAtTop = codeToolsFirst(states);
  const nextLabel = nextHref === '/bienvenue/pret' ? tm('enter') : t('continue');
  // Un échec qui nomme un outil se dit dans son panneau ; le reste (une réussite, un échec sans outil) ici.
  const pageNotice = notice && !(inQueue && failed) ? notice : null;

  // « Déjà branché pour votre espace » : chaque outil de l'équipe, et « Brancher mon compte » dans son panneau.
  const alreadySection = already.length > 0 && (
    <section className="min-w-0">
      <h2 className={cn(H2, 'mb-3')}>{tt('alreadyTitle')}</h2>
      <ul className="things">
        {already.map((state) => (
          <li key={state.item.id}>
            {state.status === 'mine' ? (
              <StaticThing
                picture={<ToolLogo kind={state.item.id} size={28} />}
                name={state.item.label}
                caption={tt('ownConnected')}
                end={tick}
              />
            ) : (
              <Thing
                picture={<ToolLogo kind={state.item.id} size={28} />}
                name={state.item.label}
                caption={tt('connectedBy', { name: state.connectedBy ?? '' })}
                pill={tt('connectOwn')}
                label={`${tt('connectOwn')} ${state.item.label}`}
                onClick={() => connect(state.item.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div ref={mainBox} tabIndex={-1} className="grid min-w-0 gap-6 outline-none">
      <OnboardingSteps steps={steps} current="tools" />

      {inQueue ? (
        <div className="grid min-w-0 gap-10">
          <div className="grid gap-3">
            <Link
              href="/bienvenue/outils"
              className="inline-flex w-fit items-center gap-1.5 rounded-sm text-label text-muted underline-offset-4 hover:text-fg hover:underline max-shell:min-h-11"
            >
              <ArrowLeft aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
              {tt('edit')}
            </Link>
            <Head title={tt('connectTitle')}>
              <p role="status" className="text-ui text-muted">
                {tt('progress', { done, total: queue.length })}
              </p>
            </Head>
            <ReturnNotice notice={pageNotice} consentUrl={consentUrl} className="mt-3 mb-0" />
          </div>

          <div className={COLUMNS}>
            <div className="grid min-w-0 gap-10">
              <ul className="things">
                {queue.map((state) => {
                  const { item, status, broken } = state;
                  const ready = status === 'mine' && !broken;
                  const picture = <ToolLogo kind={item.id} size={36} />;
                  return (
                    <li key={item.id} data-queue={item.id}>
                      {ready ? (
                        <StaticThing
                          size="card"
                          picture={picture}
                          name={item.label}
                          caption={tt('connected')}
                          end={tick}
                        />
                      ) : (
                        <Thing
                          size="card"
                          picture={picture}
                          name={item.label}
                          caption={broken ? tt('reconnectNeeded') : tt('toConnect')}
                          error={Boolean(broken)}
                          pill={broken ? tt('reconnect') : tt('connect')}
                          pillInk={next?.item.id === item.id}
                          label={`${broken ? tt('reconnect') : tt('connect')} ${item.label}`}
                          onClick={() => connect(item.id)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>

              {toConnect === 0 ? (
                <div className="grid justify-items-start gap-4">
                  <p role="status" className={H2}>
                    <span className="mark is-on">{nb(tt('allDone'))}</span>
                  </p>
                  <Button asChild variant="primary">
                    <Link href={nextHref}>{nextLabel}</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild variant="quiet" className="-ml-4 w-fit">
                  <Link href={nextHref}>{tt('later')}</Link>
                </Button>
              )}

              {alreadySection}
            </div>
            {drawing}
          </div>
        </div>
      ) : (
        <form action={chooseToolsAction} className="grid min-w-0 gap-10">
          <div className="grid gap-3">
            <Head title={tt('title')}>
              {toConnect > 0 ? (
                <>
                  <Button asChild variant="quiet">
                    <Link href={nextHref}>{tt('skip')}</Link>
                  </Button>
                  <ChooseSubmit count={toConnect} />
                </>
              ) : (
                <Button asChild variant="primary">
                  <Link href={nextHref}>{nextLabel}</Link>
                </Button>
              )}
            </Head>
            <ReturnNotice notice={pageNotice} consentUrl={consentUrl} className="mt-3 mb-0" />
          </div>

          <div className={COLUMNS}>
            <div className="grid min-w-0 gap-10">
              {codeToolsAtTop && codeTools}

              {offered.length > 0 ? (
                <>
                  {recommended.length > 0 && (
                    <Tiles title={tt('recommended')}>
                      {recommended.map((state) => (
                        <li key={state.item.id} className="min-w-0">
                          <ChoiceTile
                            state={state}
                            on={checked.has(state.item.id)}
                            onToggle={() => toggle(state.item.id)}
                          />
                        </li>
                      ))}
                    </Tiles>
                  )}
                  {others.length > 0 && (
                    <Tiles title={tt('readyTitle')}>
                      {others.map((state) => (
                        <li key={state.item.id} className="min-w-0">
                          <ChoiceTile
                            state={state}
                            on={checked.has(state.item.id)}
                            onToggle={() => toggle(state.item.id)}
                          />
                        </li>
                      ))}
                    </Tiles>
                  )}
                </>
              ) : (
                <p className="rounded-card border border-dashed border-line-strong px-5 py-4 text-ui text-muted">
                  {nb(tt('noneReady'))}
                </p>
              )}

              {soon.length > 0 && (
                // Ce qui n'est pas encore là se lit en une ligne discrète : des rectangles éteints ressemblaient à une panne.
                <section className="min-w-0">
                  <h2 className="mb-2.5 text-label font-medium text-muted">{tt('soonTitle')}</h2>
                  <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
                    {soon.slice(0, 8).map(({ item }) => (
                      <li
                        key={item.id}
                        className="inline-flex items-center gap-2 text-ui text-muted"
                      >
                        <ToolLogo kind={item.id} size={18} className="opacity-60 grayscale" />
                        {item.label}
                      </li>
                    ))}
                    {soon.length > 8 && <li className="text-ui text-muted">{tt('soonMore')}</li>}
                  </ul>
                </section>
              )}

              {!codeToolsAtTop && codeTools}

              {alreadySection}
            </div>
            {drawing}
          </div>
        </form>
      )}

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
        notice={notice}
        consentUrl={consentUrl}
      />
    </div>
  );
}
