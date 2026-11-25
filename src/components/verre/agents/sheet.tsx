import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { AgentId } from '@/server/portrait/agents';
import type { FlagTone } from '../ui/marks';

// La feuille qu'un agent laisse sur le bureau : ce qu'il produit, en petit (le brouillon, la relance, le compte rendu,
// le brief, le point du matin). Un exemple fictif, dans les mots de l'écran (messages, agents.list.<id>.sheet) : sur une
// carte, elle dit ce que fait l'agent sans phrase d'explication ; dans le panneau, l'exemple en grand. Le sérif est
// celui des mots écrits par l'agent, comme dans l'original d'une source (kit.css, .doc__body). Formes dans kit.css.

/** La couleur de chaque agent : son drapeau et le trait de surligneur sur sa feuille. */
export const TONE: Record<AgentId, FlagTone> = {
  'suite-reunion': 2,
  'brouillon-reponse': 3,
  'brief-rendez-vous': 1,
  relance: 4,
  'point-du-jour': 3,
};

// Posées à la main sur le bureau : chaque feuille a sa pente, redressée quand on pointe la carte.
const TILT: Record<AgentId, string> = {
  'suite-reunion': '-1.6deg',
  'brouillon-reponse': '-1deg',
  'brief-rendez-vous': '1.2deg',
  relance: '0.8deg',
  'point-du-jour': '-0.8deg',
};

// Ce que porte chaque feuille en plus de sa première ligne : une seconde ligne, et le pied (le bouton « Envoyer » d'un
// brouillon prêt, en encre, ou une étiquette).
const SECOND = new Set<AgentId>(['suite-reunion', 'brief-rendez-vous', 'point-du-jour']);
const FOOT: Partial<Record<AgentId, 'ink' | 'label'>> = {
  'suite-reunion': 'label',
  'brouillon-reponse': 'ink',
  relance: 'ink',
};

// Les mots balisés <hl> passent sous le surligneur de l'agent. Les espaces du français tiennent (nb), et une heure ne
// se coupe pas en fin de ligne (« 10 h », « 9 h 00 »).
const marked = (text: string) =>
  nb(text)
    .replace(/(\d) h(?: (\d))?/g, (_, d: string, m?: string) =>
      m ? `${d}\u00a0h\u00a0${m}` : `${d}\u00a0h`,
    )
    .split(/<hl>(.*?)<\/hl>/)
    .map((part, i) =>
      i % 2 ? (
        <span key={part} className="hl">
          {part}
        </span>
      ) : (
        part
      ),
    );

/**
 * La feuille d'exemple d'un agent. `large` : dans le panneau, droite et entière ; sinon sur la pile d'une carte
 * (AgentPile). Décorative : l'appelant la cache aux lecteurs d'écran.
 */
export function AgentSheet({ agent, large }: { agent: AgentId; large?: boolean }) {
  const t = useTranslations('agents.list');
  const foot = FOOT[agent];
  return (
    <span className={cn('agent-sheet', large && 'agent-sheet--lg', `c${TONE[agent]}`)}>
      <span className="flag flag--left" />
      <span className="agent-sheet__meta">{marked(t.raw(`${agent}.sheet.meta`))}</span>
      <span className="agent-sheet__body hl-arrive">
        <span className="agent-sheet__row">{marked(t.raw(`${agent}.sheet.a`))}</span>
        {SECOND.has(agent) && (
          <span className="agent-sheet__row">
            {marked(t.raw(`${agent}.sheet.b` as `suite-reunion.sheet.b`))}
          </span>
        )}
      </span>
      {foot && (
        <span className={cn('agent-sheet__foot', foot === 'ink' && 'is-ink')}>
          {t(`${agent}.sheet.foot` as `suite-reunion.sheet.foot`)}
        </span>
      )}
    </span>
  );
}

/**
 * La feuille d'un agent posée sur la bande de bureau d'une carte, sur celle d'avant (la pile : un agent en laisse une
 * à chaque passage). `order` règle quand elle s'y pose à l'arrivée.
 */
export function AgentPile({ agent, order }: { agent: AgentId; order: number }) {
  return (
    <span className="agent-pile" style={{ '--tilt': TILT[agent], '--i': order } as CSSProperties}>
      <AgentSheet agent={agent} />
    </span>
  );
}

/** Les agents qu'on construira soi-même : une feuille vierge, réglée, en pointillé, sur une autre. */
export function BlankPile({ order }: { order: number }) {
  return (
    <span
      className="agent-pile agent-pile--blank"
      style={{ '--tilt': '-2deg', '--i': order } as CSSProperties}
    >
      <span className="agent-sheet agent-sheet--blank">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
