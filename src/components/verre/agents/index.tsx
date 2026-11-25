'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { answerAgentAction } from '@/app/(app)/settings/actions';
import {
  Badge,
  Button,
  DoneMark,
  Fact,
  Facts,
  Notice,
  PageHeader,
  PanelClose,
  PanelNote,
  Section,
  SidePanel,
  StatusRow,
  Switch,
  ThingGrid,
  toast,
} from '@/components/verre';
import { cn } from '@/lib/verre/cn';
import type { AgentId, Missing } from '@/server/portrait/agents';
import type { AgentState } from '@/server/portrait/propositions';
import type { AgentsScreen, FicheEtat } from '@/server/portrait/screen';
import { AgentPile, AgentSheet, BlankPile, TONE } from './sheet';

// L'écran Agents (/agents) : chaque agent de départ montré par la feuille qu'il laisse sur le bureau. Deux sections :
// « Prêts à l'emploi » (en service, en grand : l'état de chacun sur sa carte, Actif ou Activer) et « Bientôt » (pas
// encore en service), que ferme la bande « Vos propres agents ». Une carte ne porte que la feuille, le nom, le
// déclencheur et l'état ; tout le reste vit dans son panneau : l'exemple en grand, l'interrupteur, ce que fait
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
  // L'ordre d'arrivée des feuilles, d'une section à l'autre.
  let order = 0;
  const card = (one: AgentState, wide?: boolean) => (
    <AgentCard key={one.agent} state={one} wide={wide} order={order++} onOpen={show} />
  );

  return (
    <>
      <PageHeader title={t('title')} />
      <Setup etat={data.etat} />
      {ready.length > 0 && (
        <Section id="prets" title={t('ready')} description={t('promise')}>
          <ThingGrid className="things-2">{ready.map((one) => card(one, true))}</ThingGrid>
        </Section>
      )}
      <Section id="bientot" title={t('soon')}>
        {soon.length > 0 && <ThingGrid cols={3}>{soon.map((one) => card(one))}</ThingGrid>}
        <OwnAgents order={order} />
      </Section>
      <AgentPanel
        ready={ready}
        soon={soon}
        shown={shown}
        onShow={show}
        open={open}
        onOpenChange={setOpen}
      />
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

// Un agent sur le bureau : la bande où sa feuille est posée, puis son nom, son déclencheur et son état. Toute la carte
// ouvre son panneau ; la pastille « Activer » n'est pas un second bouton.
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
  const on = isOn(state);
  return (
    <button
      type="button"
      data-agent={agent}
      className={cn('agent', wide && 'agent--wide', `hl-${TONE[agent]}`)}
      onClick={() => onOpen(agent)}
    >
      <span aria-hidden="true" className="agent__desk">
        <AgentPile agent={agent} order={order} />
      </span>
      <span className="agent__foot">
        <span className="agent__id">
          <span className="agent__name">
            <span className="mark">{t(`list.${agent}.name`)}</span>
          </span>
          <span className="agent__when">{t(`list.${agent}.when`)}</span>
        </span>
        {on ? (
          <span className="agent__on">{t('active')}</span>
        ) : state.enService && !missing ? (
          <span className="tl__pill">{t('activate')}</span>
        ) : !state.enService && state.oui ? (
          <span className="agent__asked">{t('asked')}</span>
        ) : (
          <ChevronRight aria-hidden="true" strokeWidth={1.6} className="tl__chev" />
        )}
      </span>
    </button>
  );
}

// Ce qui ferme la page : les agents qu'on construira soi-même, des feuilles vierges en pointillé. Rien ne s'y ouvre
// encore.
function OwnAgents({ order }: { order: number }) {
  const t = useTranslations('agents');
  return (
    <div className="agent-own">
      <span aria-hidden="true" className="agent-own__desk">
        <BlankPile order={order} />
      </span>
      <span className="agent-own__text">
        <span className="agent__name">{t('own')}</span>
        <span className="agent__when">{t('ownCaption')}</span>
      </span>
    </div>
  );
}

// Le panneau d'un agent : la grande fenêtre centrée (SidePanel wide), comme celle des brouillons de réponse. À gauche,
// les agents de la page rangés comme elle, un clic montre le sien ; sous 768 px la liste se cache et le pied garde
// « Précédent » et « Suivant ». Le corps est rendu par agent (key) : passer d'un agent à l'autre ne garde
// pas l'état du précédent.
export function AgentPanel({
  ready,
  soon,
  shown,
  onShow,
  open,
  onOpenChange,
}: {
  ready: AgentState[];
  soon: AgentState[];
  shown: AgentId | null;
  onShow: (agent: AgentId) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('agents');
  const c = useTranslations('common');
  const agents = [...ready, ...soon];
  const at = agents.findIndex((one) => one.agent === shown);
  const state = agents[at];
  if (!state) return null;
  const previous = agents[at - 1];
  const next = agents[at + 1];
  const group = (title: string, items: AgentState[]) =>
    items.length > 0 && (
      <div>
        <h3 className="px-3 pt-3 pb-1.5 text-label text-muted">{title}</h3>
        <ol className="grid gap-1">
          {items.map((one) => (
            <li key={one.agent}>
              <button
                type="button"
                aria-current={one.agent === state.agent || undefined}
                onClick={() => onShow(one.agent)}
                className="grid w-full gap-0.5 rounded-item px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover aria-[current]:bg-sheet aria-[current]:shadow-sheet"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn('flag agent-row__flag', `c${TONE[one.agent]}`)}
                  />
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">
                    {t(`list.${one.agent}.name`)}
                  </span>
                  {isOn(one) ? (
                    <span className="agent__on">{t('active')}</span>
                  ) : (
                    !one.enService && one.oui && <span className="agent__asked">{t('asked')}</span>
                  )}
                </span>
                <span className="truncate pl-[22px] text-label text-muted">
                  {t(`list.${one.agent}.when`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      wide
      aside={
        <>
          {group(t('ready'), ready)}
          {group(t('soon'), soon)}
        </>
      }
      title={t(`list.${state.agent}.name`)}
      sub={t(`list.${state.agent}.when`)}
      foot={
        <>
          {previous && (
            <Button
              variant="quiet"
              className="-ml-4 md:hidden"
              onClick={() => onShow(previous.agent)}
            >
              {c('previous')}
            </Button>
          )}
          {next && (
            <Button variant="quiet" className="md:hidden" onClick={() => onShow(next.agent)}>
              {c('next')}
            </Button>
          )}
          <PanelClose asChild>
            <Button variant="secondary" className="ml-auto">
              {c('done')}
            </Button>
          </PanelClose>
        </>
      }
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
