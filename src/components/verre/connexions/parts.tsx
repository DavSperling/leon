import {
  CircleCheck,
  CircleStop,
  CircleX,
  type LucideIcon,
  Pause,
  TriangleAlert,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { statusLine } from '@/lib/connection-form';
import { cn, nb } from '@/lib/verre';
import type { ConnectionView } from '@/server/connectors/connections';

type StatusView = Pick<
  ConnectionView,
  'status' | 'lastSyncAt' | 'itemsSynced' | 'lastError' | 'createdBy' | 'creatorLeft'
>;

/** Lignes étroites : jamais « 18 / min » ni un « · » en début de ligne (le point reste avec ce qui le précède). */
export const keepTogether = (s: string): string =>
  s
    .replace(/(\d) (?=(?:min|h|j|éléments?|passages?)(?!\p{L}))/gu, '$1 ')
    .replace(/ · /g, ' · ')
    .replace(/il y a /g, 'il y a ');

export type StatusTone = 'success' | 'muted' | 'destructive' | 'warning';
// Tout va bien : seule l'icône est verte, le texte reste discret ; un problème s'écrit dans son ton pour ressortir.
const TONES: Record<StatusTone, { icon: LucideIcon; cls: string; iconCls?: string }> = {
  success: { icon: CircleCheck, cls: 'text-fg-2', iconCls: 'text-success' },
  muted: { icon: Pause, cls: 'text-muted' },
  destructive: { icon: CircleX, cls: 'text-destructive' },
  warning: { icon: TriangleAlert, cls: 'text-warning' },
};

/** Ligne d'état : le sens passe par l'icône et le mot, jamais par la couleur seule. */
export function StatusText({
  tone,
  children,
  className,
  ...props
}: { tone: StatusTone; children: string } & Omit<ComponentProps<'p'>, 'children'>) {
  const { icon: Icon, cls, iconCls } = TONES[tone];
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-[12.5px] leading-[1.45] tabular-nums',
        cls,
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.8}
        className={cn('mt-[2px] size-3.5 shrink-0', iconCls)}
      />
      <span className="min-w-0 break-words">{keepTogether(nb(children))}</span>
    </p>
  );
}

/** L'état d'une connexion en un mot, avec son icône : Actif, En pause, En erreur, Arrêtée (créateur parti). */
export function connState(c: Pick<ConnectionView, 'status' | 'creatorLeft'>): {
  word: string;
  tone: StatusTone;
  icon: LucideIcon;
} {
  if (c.creatorLeft) return { word: 'Arrêtée', tone: 'destructive', icon: CircleStop };
  if (c.status === 'error') return { word: 'En erreur', tone: 'destructive', icon: CircleX };
  if (c.status === 'paused') return { word: 'En pause', tone: 'muted', icon: Pause };
  return { word: 'Actif', tone: 'success', icon: CircleCheck };
}

/** Le mot d'état seul, icône en ligne : il s'aligne sur la ligne de base du texte voisin. */
export function StateWord({ c, className }: { c: ConnectionView; className?: string }) {
  const { word, tone, icon: Icon } = connState(c);
  return (
    <p className={cn('text-[12.5px] font-medium whitespace-nowrap', TONES[tone].cls, className)}>
      <Icon
        aria-hidden="true"
        strokeWidth={1.8}
        className={cn('mr-1.5 inline size-3.5 align-[-2.5px]', TONES[tone].iconCls)}
      />
      {word}
    </p>
  );
}

/** La ligne d'état sans son premier mot : « Clé refusée par Intercom. », « X n'est plus membre » ; null pour « En pause ». */
export const stateDetail = (c: StatusView, now: Date): string | null =>
  statusLine(c, now).match(/^[^·:]*[·:]\s*(.+)$/s)?.[1] ?? null;

export const ConnStatus = ({
  c,
  now,
  className,
}: {
  c: StatusView;
  now: Date;
  className?: string;
}) => (
  <StatusText tone={connState(c).tone} className={className}>
    {statusLine(c, now)}
  </StatusText>
);
