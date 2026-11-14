'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type DragEvent, useState } from 'react';
import { Avatar, GlassCard, Thing } from '@/components/verre';
import { cn } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';

export type ChartMember = Pick<
  MemberRow,
  'id' | 'name' | 'managerId' | 'department' | 'job' | 'self'
> & { invited?: boolean };

// L'organigramme vu depuis une personne, comme Google et Microsoft : ses managers au-dessus (`chain`, du haut vers
// elle), sa rangée (elle et ses collègues, même manager), ses directs dans `children`. Sans manager, ou rattachée à
// quelqu'un qui n'est plus là, elle est dans la rangée des racines, celles qui ont une équipe d'abord.
export function orgView(members: ChartMember[], focusId: string | null) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const children = new Map<string, ChartMember[]>();
  for (const m of members)
    if (m.managerId && byId.has(m.managerId))
      children.set(m.managerId, [...(children.get(m.managerId) ?? []), m]);
  const byName = (a: ChartMember, b: ChartMember) => a.name.localeCompare(b.name, 'fr');
  for (const list of children.values()) list.sort(byName);
  const focus = byId.get(focusId ?? '') ?? members.find((m) => m.self) ?? members[0];
  const chain: ChartMember[] = [];
  for (
    let m = byId.get(focus?.managerId ?? '');
    m && m !== focus && !chain.includes(m);
    m = byId.get(m.managerId ?? '')
  )
    chain.unshift(m);
  const manager = chain.at(-1);
  const row = manager
    ? (children.get(manager.id) ?? [])
    : members
        .filter((m) => !m.managerId || !byId.has(m.managerId))
        .sort((a, b) => Number(children.has(b.id)) - Number(children.has(a.id)) || byName(a, b));
  return { focus, chain, row, children };
}

// L'arbre entier : en haut les racines qui ont une équipe ; à part, « Pas encore placés », ceux qui ne sont rattachés à
// personne et que personne n'a sous lui (le lecteur reste dans l'arbre si l'arbre serait vide). Une boucle écrite hors
// de Leon ne fait perdre personne : qui n'est pas atteint depuis une racine est aussi « pas encore placé ».
export function chartLayout(people: ChartMember[]) {
  const { children } = orgView(people, null);
  const ids = new Set(people.map((p) => p.id));
  const byName = (a: ChartMember, b: ChartMember) => a.name.localeCompare(b.name, 'fr');
  const roots = people.filter((p) => !p.managerId || !ids.has(p.managerId)).sort(byName);
  let top = roots.filter((p) => children.has(p.id));
  if (top.length === 0) {
    const first = roots.find((p) => p.self) ?? roots.find((p) => !p.invited);
    top = first ? [first] : [];
  }
  const reached = new Set<string>();
  const walk = (p: ChartMember) => {
    if (reached.has(p.id)) return;
    reached.add(p.id);
    for (const c of children.get(p.id) ?? []) walk(c);
  };
  for (const p of top) walk(p);
  const unplaced = people.filter((p) => !reached.has(p.id)).sort(byName);
  return { top, unplaced, children };
}

// La personne du lecteur reste en vue quand l'arbre dépasse la largeur de la feuille.
const keepInView = (el: HTMLElement | null) =>
  el?.scrollIntoView({ block: 'nearest', inline: 'center' });

/**
 * L'organigramme de l'équipe (.org-tree, globals.css) : chaque personne une tuile, des traits fins entre elles. Un
 * clic ouvre sa fiche. Pour qui peut inviter : un « + » sous chaque personne invite quelqu'un sous elle (ils paraissent
 * tous dès que le pointeur entre dans l'arbre : rien à chercher, et l'arbre reste net au repos), et une
 * personne glissée sur une autre passe sous elle (la fiche le fait aussi : jamais le seul moyen). Une personne déposée
 * sur « Pas encore placés » n'est plus rattachée à personne.
 */
export function OrgChart({
  people,
  caption,
  admin,
  movingId,
  onOpen,
  onAdd,
  onMove,
}: {
  people: ChartMember[];
  caption: (p: ChartMember) => string | null;
  admin: boolean;
  movingId: string | null;
  onOpen: (id: string) => void;
  onAdd: (managerId: string) => void;
  onMove: (memberId: string, managerId: string | null) => void;
}) {
  const t = useTranslations('team');
  const { top, unplaced, children } = chartLayout(people);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // Glisser une personne sous quelqu'un qui est déjà sous elle ferait une boucle : la cible ne s'allume pas (le
  // serveur le refuse de toute façon).
  const under = (id: string, root: string): boolean =>
    (children.get(root) ?? []).some((c) => c.id === id || under(id, c.id));
  const accepts = (target: ChartMember | null) =>
    dragging !== null &&
    (target === null
      ? people.find((p) => p.id === dragging)?.managerId != null
      : target.id !== dragging && !target.invited && !under(target.id, dragging));
  const dropProps = (target: ChartMember | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!accepts(target)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(target?.id ?? '');
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragging && accepts(target)) onMove(dragging, target?.id ?? null);
      setDragging(null);
      setOver(null);
    },
  });

  const tile = (p: ChartMember, wide = false) => {
    const movable = admin && !p.invited;
    return (
      <Thing
        ref={p.self ? keepInView : undefined}
        picture={<Avatar name={p.name} size={28} />}
        name={p.name}
        caption={caption(p)}
        // la tuile garde sa largeur : le texte entier au survol
        title={[p.name, caption(p)].filter(Boolean).join(' · ')}
        working={movingId === p.id}
        chevron={false}
        onClick={() => onOpen(p.id)}
        draggable={movable}
        onDragStart={
          movable
            ? (e: DragEvent) => {
                e.dataTransfer.setData('text/plain', p.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragging(p.id);
              }
            : undefined
        }
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        {...dropProps(p)}
        className={cn(
          wide ? 'w-full' : 'w-[200px]',
          dragging === p.id && 'opacity-50',
          over === p.id && 'border-fg ring-1 ring-fg',
        )}
      />
    );
  };

  const node = (p: ChartMember) => {
    const team = children.get(p.id);
    return (
      <li key={p.id}>
        <div className="relative">
          {tile(p)}
          {admin && !p.invited && (
            <button
              type="button"
              aria-label={t('addUnder', { name: p.name })}
              title={t('addUnder', { name: p.name })}
              onClick={() => onAdd(p.id)}
              className="absolute top-[calc(100%+6px)] left-1/2 z-[2] grid size-6 -translate-x-1/2 place-items-center rounded-full border border-line-strong bg-sheet text-fg-2 opacity-0 transition-opacity duration-150 group-hover/tree:opacity-100 hover:border-fg hover:text-fg focus-visible:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100"
            >
              <Plus aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
            </button>
          )}
        </div>
        {team && <ul>{team.map(node)}</ul>}
      </li>
    );
  };

  const showAside = unplaced.length > 0 || (dragging !== null && accepts(null));
  return (
    <GlassCard
      aria-busy={movingId !== null || undefined}
      className="flex overflow-hidden max-[1400px]:flex-col"
    >
      {/* le défilement reste dans la feuille : la page ne défile jamais en largeur ; sur un téléphone, les bords
          s'effacent (dans la marge, sur 24 px) pour dire que l'arbre continue */}
      <div className="group/tree min-w-0 flex-1 overflow-x-auto px-2 pt-7 pb-9">
        <div className="flex w-max min-w-full flex-wrap justify-center gap-x-10 gap-y-8">
          {top.map((p) => (
            <ul key={p.id} className="org-tree">
              {node(p)}
            </ul>
          ))}
        </div>
      </div>
      {showAside && (
        <aside
          aria-labelledby="pas-places"
          {...dropProps(null)}
          className={cn(
            'w-[280px] shrink-0 border-l border-line px-5 pt-6 pb-6 transition-colors duration-150 max-[1400px]:w-auto max-[1400px]:border-t max-[1400px]:border-l-0',
            over === '' && 'bg-hover',
          )}
        >
          <h3 id="pas-places" className="mb-3 text-label font-medium text-muted">
            {t('notPlaced')}
          </h3>
          {unplaced.length > 0 ? (
            <ul className="grid gap-2 max-[1400px]:grid-cols-[repeat(auto-fill,minmax(208px,1fr))]">
              {unplaced.map((p) => (
                <li key={p.id}>{tile(p, true)}</li>
              ))}
            </ul>
          ) : (
            <p className="grid min-h-[52px] place-items-center rounded-item border border-dashed border-line-strong px-3 text-center text-label text-muted">
              {t('dropHere')}
            </p>
          )}
        </aside>
      )}
    </GlassCard>
  );
}
