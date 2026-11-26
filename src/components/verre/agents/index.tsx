'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useState, useTransition } from 'react';
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
import { AgentFace, followPointer } from './face';
import { AgentSheet, TONE } from './sheet';

// L'écran Agents (/agents) : chaque agent est un badge, son personnage sur un aplat de sa couleur. Deux sections en
// grille : « Prêts à l'emploi » (en service, deux par rangée) et « Bientôt » (trois par rangée), que ferme le badge en
// pointillé « Vos propres agents ». Le personnage dit l'état : éveillé et levé (actif), endormi au bas du cadre (à
// activer), une silhouette (pas encore en service). Un badge ne porte que le personnage, le nom, le déclencheur et
// l'état, chacun une fois ; tout le reste vit dans son panneau : l'exemple en grand, l'interrupteur, ce que fait
// l'agent, où le retrouver, ce qu'il lui faut et qui voit son travail. `?agent=<id>` ouvre ce panneau. Rien ne se
// calcule ici : l'état vient de la page (portrait/screen.ts, readAgentsScreen).

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
  useEffect(followPointer, []);

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
  // L'ordre d'arrivée des badges, d'une section à l'autre.
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
        <ul className="agents-grid">
          {soon.map((one) => card(one))}
          <li>
            <OwnAgents order={order} />
          </li>
        </ul>
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

// Un agent : son badge. À gauche son personnage sur l'aplat de sa couleur, la fente du cordon percée dedans ; à
// droite son nom, son déclencheur et son état. Tout le badge ouvre son panneau ; la pastille « Activer » n'est pas un
// second bouton. `order` règle quand il arrive : les badges se posent l'un après l'autre, puis les agents actifs se
// lèvent (kit.css).
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
      className={cn('agent', wide && 'agent--wide', `hl-${TONE[agent]}`, pose(state))}
      style={{ '--i': order } as CSSProperties}
      onClick={() => onOpen(agent)}
    >
      <span className="agent__photo">
        <AgentFace agent={agent} />
      </span>
      <span className="agent__text">
        <span className="agent__name">
          <span className="mark">{t(`list.${agent}.name`)}</span>
        </span>
        <span className="agent__when">{t(`list.${agent}.when`)}</span>
        <span className="agent__state">
          {isOn(state) ? (
            <span className="agent__on">{t('active')}</span>
          ) : state.enService && !missing ? (
            <span className="tl__pill agent__pill">{t('activate')}</span>
          ) : (
            !state.enService && state.oui && <span className="agent__asked">{t('asked')}</span>
          )}
        </span>
      </span>
    </button>
  );
}

// La pose du personnage : levé et éveillé, endormi (rien), ou la silhouette d'un agent à venir, qui se hausse quand
// elle l'a demandé.
const pose = (state: AgentState, oui = state.oui === true) =>
  state.enService ? oui && 'is-on' : cn('is-soon', oui && 'is-wanted');

// Ce qui ferme la page : les agents qu'on construira soi-même, un badge en pointillé et une silhouette sans couleur.
// Rien ne s'y ouvre encore : rien n'y bouge au pointeur.
function OwnAgents({ order }: { order: number }) {
  const t = useTranslations('agents');
  return (
    <div className="agent agent-own is-soon" style={{ '--i': order } as CSSProperties}>
      <span className="agent__photo">
        <AgentFace />
      </span>
      <span className="agent__text">
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
  // À gauche l'agent derrière son exemple, sur sa bande de bureau qui prend sa couleur quand il est actif ; à droite
  // l'état, le geste et ce qu'est l'agent (kit.css, .agent-open). L'interrupteur le réveille sous ses yeux.
  return (
    <div className="agent-open">
      <div aria-hidden="true" className={cn('agent-well', `hl-${TONE[agent]}`, pose(state, oui))}>
        <AgentFace agent={agent} className="agent-well__face" />
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
