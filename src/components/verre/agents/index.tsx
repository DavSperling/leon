'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type PointerEvent, useEffect, useState, useTransition } from 'react';
import { answerAgentAction } from '@/app/(app)/settings/actions';
import {
  Badge,
  Button,
  DoneMark,
  Fact,
  Facts,
  Notice,
  PageHeader,
  PanelNote,
  Section,
  SidePanel,
  StatusRow,
  Switch,
  toast,
} from '@/components/verre';
import { cn } from '@/lib/verre/cn';
import type { AgentId, Missing } from '@/server/portrait/agents';
import type { AgentState } from '@/server/portrait/propositions';
import type { AgentsScreen, FicheEtat } from '@/server/portrait/screen';
import { AgentPile, AgentSheet, TONE } from './sheet';

// L'écran Agents (/agents) : chaque agent est une chemise de sa couleur, la feuille qu'il laisse glissée dedans. Deux
// sections en grille : « Prêts à l'emploi » (en service, deux par rangée, l'état de chacun sur son rabat, Actif ou
// Activer) et « Bientôt » (trois par rangée), que ferme la bande « Vos propres agents ». Une chemise ne porte que la
// feuille, le nom, le déclencheur et l'état, chacun une fois ; tout le reste vit dans son panneau : l'exemple en grand,
// l'interrupteur, ce que fait l'agent, où le retrouver, ce qu'il lui faut et qui voit son travail. `?agent=<id>` ouvre
// ce panneau. Rien ne se calcule ici : l'état vient de la page (portrait/screen.ts, readAgentsScreen).

// Ce qu'il faut à chaque agent, dans les mots du panneau : un enregistreur, Outlook, ou une boîte.
const NEEDS: Record<AgentId, 'boite' | 'reunions' | 'outlook'> = {
  'suite-reunion': 'reunions',
  'brouillon-reponse': 'boite',
  'brief-rendez-vous': 'outlook',
  relance: 'boite',
  'point-du-jour': 'boite',
};

// Où brancher ce qui manque : Connexions (le panneau d'Outlook directement), ou l'onglet « Ma fiche » des réglages.
const FIX: Partial<Record<Missing, string>> = {
  boite: '/connections',
  reunions: '/connections',
  outlook: '/connections?outil=outlook',
  fiche: '/settings#fiche',
};

const isOn = (one: AgentState) => one.enService && one.oui === true;

export type AgentsProps = {
  /** null : la page n'a pas pu lire (une erreur, pas un écran vide). */
  data: AgentsScreen | null;
  /** `?agent=<id>` : l'agent dont le panneau s'ouvre. */
  openAgent?: AgentId | null;
};

export function Agents({ data, openAgent = null }: AgentsProps) {
  const t = useTranslations('agents');
  const [shown, setShown] = useState<AgentId | null>(null);
  const [open, setOpen] = useState(false);
  const show = (agent: AgentId) => {
    setShown(agent);
    setOpen(true);
  };

  useEffect(() => {
    if (!openAgent) return;
    setShown(openAgent);
    setOpen(true);
    window.history.replaceState(null, '', '/agents');
  }, [openAgent]);

  if (!data)
    return (
      <>
        <PageHeader title={t('title')} />
        <Notice tone="error" live="alert">
          {t('loadFailed')}
        </Notice>
      </>
    );

  // Rangés par service, dans l'ordre du catalogue : une carte ne change pas de place quand on l'allume.
  const ready = data.agents.filter((one) => one.enService);
  const soon = data.agents.filter((one) => !one.enService);
  const current = data.agents.find((one) => one.agent === shown) ?? null;
  // L'ordre d'arrivée des chemises, d'une section à l'autre.
  let order = 0;
  const card = (one: AgentState, wide?: boolean) => (
    <li key={one.agent}>
      <AgentCard state={one} wide={wide} order={order++} onOpen={show} />
    </li>
  );

  return (
    <>
      <PageHeader title={t('title')} />
      <Setup etat={data.etat} />
      {ready.length > 0 && (
        <Section id="prets" title={t('ready')}>
          <ul className="agents-grid agents-grid--2">{ready.map((one) => card(one, true))}</ul>
        </Section>
      )}
      <Section id="bientot" title={t('soon')}>
        {soon.length > 0 && <ul className="agents-grid">{soon.map((one) => card(one))}</ul>}
        <OwnAgents order={order} />
      </Section>
      <AgentPanel state={current} open={open} onOpenChange={setOpen} />
    </>
  );
}

// Ce qui manque à toute la page : sa boîte, ou sa fiche, dont partent tous les agents. Rien quand sa fiche existe.
function Setup({ etat }: { etat: FicheEtat }) {
  const t = useTranslations('agents.notice');
  const fix = useTranslations('agents.fix');
  const router = useRouter();
  if (etat === 'faite' || etat === 'a-completer') return null;
  if (etat === 'en-cours')
    return (
      <Notice
        live="status"
        action={{ label: t('refresh'), onClick: () => router.refresh() }}
        className="mb-8 max-w-2xl"
      >
        {t('building')}
      </Notice>
    );
  const mailbox = etat === 'sans-boite';
  return (
    <Notice
      action={
        <Button asChild size="xs">
          <Link href={mailbox ? '/connections' : '/settings#fiche'}>
            {fix(mailbox ? 'boite' : 'fiche')}
          </Link>
        </Button>
      }
      className="mb-8 max-w-2xl"
    >
      {t(mailbox ? 'noMailbox' : 'noFiche')}
    </Notice>
  );
}

// La chemise penche vers la souris, de quelques degrés : pas au doigt, et pas en mouvement réduit (kit.css).
function lean(event: PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== 'mouse') return;
  const box = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  event.currentTarget.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
  event.currentTarget.style.setProperty('--rx', `${(y * -5).toFixed(2)}deg`);
}

function straighten(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.style.removeProperty('--rx');
  event.currentTarget.style.removeProperty('--ry');
}

// Le dos de la chemise : son onglet (un coin arrondi, puis une épaule douce qui rejoint le dos) et le dos lui-même.
function FolderBack() {
  return (
    <>
      <svg
        aria-hidden="true"
        className="agent__tab"
        viewBox="0 0 132 22"
        preserveAspectRatio="none"
      >
        <path d="M0 22V9a9 9 0 0 1 9-9h85c18 0 20 22 38 22z" />
      </svg>
      <span aria-hidden="true" className="agent__back" />
    </>
  );
}

// Un agent : sa chemise, la feuille qu'il laisse glissée dedans, puis sur le rabat son nom, son déclencheur et son
// état. Toute la chemise ouvre son panneau ; la pastille « Activer » n'est pas un second bouton. `order` règle quand
// elle arrive : les chemises se posent l'une après l'autre, puis chaque feuille s'y glisse (kit.css).
function AgentCard({
  state,
  wide,
  order,
  onOpen,
}: {
  state: AgentState;
  wide?: boolean;
  order: number;
  onOpen: (agent: AgentId) => void;
}) {
  const t = useTranslations('agents');
  const { agent, missing } = state;
  return (
    <button
      type="button"
      data-agent={agent}
      className={cn('agent', wide && 'agent--wide', `hl-${TONE[agent]}`)}
      style={{ '--i': order } as CSSProperties}
      onClick={() => onOpen(agent)}
      onPointerMove={lean}
      onPointerLeave={straighten}
    >
      <FolderBack />
      <span aria-hidden="true" className="agent__paper">
        <AgentPile agent={agent} />
      </span>
      <span className="agent__front">
        <span className="agent__id">
          <span className="agent__name">
            <span className="mark">{t(`list.${agent}.name`)}</span>
          </span>
          <span className="agent__when">{t(`list.${agent}.when`)}</span>
        </span>
        {isOn(state) ? (
          <span className="agent__on">{t('active')}</span>
        ) : state.enService && !missing ? (
          <span className="tl__pill agent__pill">{t('activate')}</span>
        ) : (
          !state.enService && state.oui && <span className="agent__asked">{t('asked')}</span>
        )}
      </span>
    </button>
  );
}

// Ce qui ferme la page : les agents qu'on construira soi-même, une chemise encore vide, sa feuille vierge et réglée.
// Rien ne s'y ouvre encore : rien n'y bouge au pointeur, seul un curseur y clignote quelques fois à l'arrivée.
function OwnAgents({ order }: { order: number }) {
  const t = useTranslations('agents');
  return (
    <div className="agent-own" style={{ '--i': order } as CSSProperties}>
      <span aria-hidden="true" className="agent-own__folder">
        <FolderBack />
        <span className="agent__paper">
          <span className="agent-sheet agent-sheet--blank">
            <b className="agent-caret" />
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="agent__front" />
      </span>
      <span className="agent-own__text">
        <span className="agent__name">{t('own')}</span>
        <span className="agent__when">{t('ownCaption')}</span>
      </span>
    </div>
  );
}

// Le panneau d'un agent : la grande fenêtre centrée (SidePanel wide), comme celle des brouillons de réponse, pour lui
// seul. Son corps est rendu par agent (key) : passer d'un agent à l'autre ne garde pas l'état du précédent.
export function AgentPanel({
  state,
  open,
  onOpenChange,
}: {
  state: AgentState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('agents');
  if (!state) return null;
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t(`list.${state.agent}.name`)}
      sub={t(`list.${state.agent}.when`)}
    >
      <PanelBody key={state.agent} state={state} />
    </SidePanel>
  );
}

function PanelBody({ state }: { state: AgentState }) {
  const t = useTranslations('agents');
  const router = useRouter();
  const { agent, enService, missing } = state;
  const name = t(`list.${agent}.name`);
  // La réponse montrée : celle qu'elle vient de donner, le temps que la page relise la sienne.
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [saving, startSaving] = useTransition();
  const oui = answer ?? state.oui === true;

  const save = (next: boolean) =>
    startSaving(async () => {
      setAnswer(next);
      const result = await answerAgentAction({ agent, oui: next }).catch(() => ({
        error: 'echec' as const,
      }));
      if ('ok' in result) {
        setDrawn(next && enService);
        const said = enService ? (next ? 'on' : 'off') : next ? 'wanted' : 'unwanted';
        toast.success(t(`saved.${said}`, { name }));
        return;
      }
      setAnswer(null);
      // Un agent qui ne lui est plus proposé (un outil débranché depuis) : la page relit son état.
      if (result.error === 'introuvable') {
        toast.error(t('gone'));
        router.refresh();
      } else toast.error(t('failed'));
    });

  const status = enService ? (oui ? 'on' : 'off') : 'soon';
  const fix = missing && FIX[missing];
  // À gauche l'exemple sur sa bande de bureau, à droite l'état, le geste et ce qu'est l'agent (kit.css, .agent-open).
  return (
    <div className="agent-open">
      <div aria-hidden="true" className="agent-well">
        <AgentSheet agent={agent} large />
        <span className="agent-well__label">{t('example')}</span>
      </div>
      <div className="min-w-0">
        <StatusRow>
          <Badge tone={status === 'on' ? 'success' : 'neutral'}>
            {drawn && status === 'on' ? <DoneMark>{t('state.on')}</DoneMark> : t(`state.${status}`)}
          </Badge>
          {missing ? (
            fix && (
              <Button asChild size="xs">
                <Link href={fix}>{t(`fix.${missing as 'boite'}`)}</Link>
              </Button>
            )
          ) : (
            <Switch
              checked={oui}
              disabled={saving}
              onCheckedChange={save}
              aria-label={enService ? t('switchOn', { name }) : undefined}
              label={enService ? undefined : t('switchSoon')}
            />
          )}
        </StatusRow>
        {missing && <PanelNote className="mt-3">{t(`missing.${missing}`)}</PanelNote>}
        <Facts className={cn(missing && 'mt-1')}>
          <Fact label={t('facts.does')}>{t(`list.${agent}.text`)}</Fact>
          {enService && <Fact label={t('facts.where')}>{t('whereHome')}</Fact>}
          <Fact label={t('facts.needs')}>{t(`needs.${NEEDS[agent]}`)}</Fact>
          <Fact label={t('facts.who')}>{t('whoYou')}</Fact>
        </Facts>
      </div>
    </div>
  );
}
