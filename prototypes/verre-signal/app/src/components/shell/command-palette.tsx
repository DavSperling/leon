import { KeyRound, type LucideIcon, MessageSquarePlus, Moon, PanelLeftClose, PanelLeftOpen, Plug, RotateCcwClock, Search, Sun } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import { type KeyboardEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Kbd } from '@/components/ui/kbd';
import { RECENT_SEARCHES } from '@/data/search';
import { cn } from '@/lib/cn';
import { NOW } from '@/lib/format';
import { nb } from '@/lib/nb';
import { fold } from '@/lib/text';
import { useTheme } from '@/lib/theme';
import { NAV } from './nav';
import { desktop, toggleRail, useRailCollapsed } from './rail';

const RECENT = 'Recherches récentes';

type Option = { id: string; group: string | null; label: string; icon: LucideIcon; meta?: string; run: () => void };

/** « 2 h », « hier », « 3 j » : l'ancienneté courte des recherches récentes. */
function ago(at: Date): string {
  const h = Math.floor((NOW.getTime() - at.getTime()) / 3_600_000);
  if (h < 24) return `${Math.max(1, h)} h`;
  return h < 48 ? 'hier' : `${Math.floor(h / 24)} j`;
}

/**
 * Palette ⌘K de la planche : recherches récentes, sections, actions ; filtre sans accent ; surbrillance qui glisse ;
 * ↑ ↓ Entrée Échap (« ↵ » sur la ligne active et « esc » dans le champ suffisent : pas de pied de raccourcis) ; le champ garde le focus (combobox + listbox, aria-activedescendant). À la fermeture, le focus
 * revient à l'élément qui l'avait à l'ouverture, ou va au contenu (<main>) après une navigation.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const collapsed = useRailCollapsed();
  // La palette se centre sur le panneau ; elle garde la place prise à l'ouverture (repliée ou non) jusqu'à sa sortie.
  const [railAtOpen, setRailAtOpen] = useState(collapsed);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [more, setMore] = useState(false);
  const jump = useRef(true);
  const navigated = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLSpanElement>(null);

  // Avant que Radix ne déplace le focus dans le champ (ses effets passent après les effets de mise en page).
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.activeElement;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    setRailAtOpen(collapsed);
    setQ('');
    setActive(0);
    jump.current = true;
  }, [open]);

  const query = q.trim();
  const visible = useMemo<Option[]>(() => {
    const go = (to: string) => () => {
      navigated.current = true;
      onOpenChange(false);
      navigate(to);
    };
    const all: Option[] = [
      ...RECENT_SEARCHES.map((r, i) => ({ id: `r${i}`, group: RECENT, label: nb(r.q), icon: RotateCcwClock, meta: ago(r.at), run: go(`/?q=${encodeURIComponent(r.q)}`) })),
      ...NAV.map((n, i) => ({ id: `n${i}`, group: 'Aller à', label: n.label, icon: n.icon, run: go(n.to) })),
      { id: 'a0', group: 'Actions', label: 'Nouvelle discussion', icon: MessageSquarePlus, run: go('/discussions?nouvelle=1') },
      { id: 'a1', group: 'Actions', label: 'Brancher un outil', icon: Plug, run: go('/connexions') },
      { id: 'a2', group: 'Actions', label: 'Créer un jeton', icon: KeyRound, run: go('/reglages?creer=1') },
      { id: 'a3', group: 'Actions', label: 'Basculer le thème', icon: theme === 'dark' ? Sun : Moon, meta: theme === 'dark' ? 'sombre' : 'clair', run: () => (toggle(), onOpenChange(false)) },
    ];
    // sous 861 px, pas de barre latérale à replier
    if (desktop.matches)
      all.push({ id: 'a4', group: 'Actions', label: collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale', icon: collapsed ? PanelLeftOpen : PanelLeftClose, meta: '[', run: () => (toggleRail(), onOpenChange(false)) });
    const f = fold(query);
    const matches = all.filter((o) => !f || fold(o.label).includes(f));
    if (!query) return matches;
    const free: Option = { id: 'q', group: null, label: nb(`Rechercher « ${query} »`), icon: Search, run: go(`/?q=${encodeURIComponent(query)}`) };
    // Le début d'un mot d'une section ou d'une action (« sources », « régl », « jeton ») : Entrée y va, sections et actions
    // passent devant les recherches récentes et le texte libre finit la liste. Sinon, Entrée lance la recherche telle quelle.
    const recent = (o: Option) => o.group === RECENT;
    const named = matches.some((o) => !recent(o) && ` ${fold(o.label)}`.includes(` ${f}`));
    return named ? [...matches.filter((o) => !recent(o)), ...matches.filter(recent), free] : [free, ...matches];
  }, [query, theme, toggle, collapsed, navigate, onOpenChange]);

  const current = visible[Math.min(active, visible.length - 1)];

  // Les options regroupées pour le lecteur d'écran (role=group nommé par son titre) ; la ligne de texte libre reste seule.
  const groups = useMemo(() => {
    const out: Array<{ group: string | null; options: Array<{ o: Option; i: number }> }> = [];
    visible.forEach((o, i) => {
      const last = out.at(-1);
      if (last && last.group === o.group) last.options.push({ o, i });
      else out.push({ group: o.group, options: [{ o, i }] });
    });
    return out;
  }, [visible]);

  // La surbrillance glisse sous l'option active (saute sans transition après un filtrage). Placée à chaque rendu et au
  // montage de la liste : le portail Radix ne la monte qu'après le premier rendu de la palette.
  const place = () => {
    const list = listRef.current;
    const hl = hlRef.current;
    const el = current && list?.querySelector<HTMLElement>(`#pal-${current.id}`);
    if (list) setMore(list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    if (!hl || !el || !list) return;
    hl.style.transition = jump.current ? 'none' : '';
    hl.style.transform = `translateY(${el.offsetTop}px)`; // offsetTop : insensible à l'échelle de l'animation d'entrée
    jump.current = false;
  };
  useLayoutEffect(place);

  const move = (to: number) => {
    if (!visible.length) return;
    const i = (to + visible.length) % visible.length;
    setActive(i);
    requestAnimationFrame(() => listRef.current?.querySelector(`#pal-${visible[i]!.id}`)?.scrollIntoView({ block: 'nearest' }));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (step) {
      e.preventDefault();
      move(active + step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      current?.run();
    } else if (e.key === 'Tab') e.preventDefault(); // le champ est le seul élément focalisable
  };

  const option = ({ o, i }: { o: Option; i: number }) => {
    const selected = o === current;
    return (
      <div
        key={o.id}
        id={`pal-${o.id}`}
        role="option"
        aria-selected={selected}
        onPointerMove={() => i !== active && setActive(i)}
        onClick={o.run}
        className={cn('group relative z-[1] flex h-9 cursor-pointer items-center gap-3 rounded-item pr-2.5 pl-3 text-[13.5px] text-fg-2', selected && 'text-fg')}
      >
        <o.icon aria-hidden="true" strokeWidth={1.6} className={cn('size-4 shrink-0 transition-colors duration-150', selected ? 'text-accent' : 'text-muted')} />
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {/* « [ » est une touche (Kbd, muet : aria-keyshortcuts du bouton de la barre le dit) ; « 2 h », « clair » sont des mots */}
        {o.meta === '[' ? <Kbd>[</Kbd> : o.meta && <span className="text-label text-muted tabular-nums">{o.meta}</span>}
        <Kbd className={cn('transition-opacity duration-150 max-shell:hidden', selected ? 'opacity-100' : 'opacity-0')}>↵</Kbd>
      </div>
    );
  };

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="layer-scrim fixed inset-0 z-50 bg-scrim" />
        <RDialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // ouverte sans déclencheur Radix (⌘K, boutons) : on rend le focus nous-mêmes
            e.preventDefault();
            // après une navigation, la nouvelle page a pu poser le focus (champ de ?nouvelle=1) : on le lui laisse
            if (!navigated.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
            navigated.current = false;
            // rien à retrouver (ouverte depuis la page, ou page changée) : le focus va au contenu
            if (document.activeElement === document.body) document.getElementById('contenu')?.focus({ preventScroll: true });
          }}
          onMouseDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}
          // centre du panneau : la moitié de (barre + marge droite de 10 px) à droite du milieu ; 32 px de marge en tout
          className={cn(
            'layer-dialog glass-float signal-line fixed top-[78px] left-1/2 z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[20px] border border-line-strong shadow-float outline-none max-shell:top-[62px]',
            railAtOpen ? 'shell:left-[calc(50%+27px)] shell:w-[min(620px,calc(100vw-106px))]' : 'shell:left-[calc(50%+119px)] shell:w-[min(620px,calc(100vw-290px))]',
          )}
        >
          <RDialog.Title className="sr-only">Palette de commandes</RDialog.Title>
          <div className="flex h-14 items-center gap-3 border-b border-line pr-3.5 pl-[18px] transition-colors duration-200 focus-within:border-accent-line">
            <Search aria-hidden="true" className="size-[18px] shrink-0 text-muted" strokeWidth={1.6} />
            <input
              value={q}
              onChange={(e) => (setQ(e.target.value), setActive(0), (jump.current = true), listRef.current?.scrollTo(0, 0))}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={visible.length > 0}
              aria-controls="pal-list"
              aria-autocomplete="list"
              aria-activedescendant={current ? `pal-${current.id}` : undefined}
              aria-label="Rechercher ou aller à"
              placeholder="Rechercher ou aller à…"
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.015em] text-fg outline-none placeholder:font-normal placeholder:text-muted"
            />
            <Kbd className="max-shell:hidden">esc</Kbd>
          </div>
          <div
            ref={(el) => ((listRef.current = el), place())}
            id="pal-list"
            role="listbox"
            aria-label="Suggestions"
            onScroll={() => {
              const l = listRef.current;
              if (l) setMore(l.scrollTop + l.clientHeight < l.scrollHeight - 2);
            }}
            // Toute la liste tient dès 760 px de haut ; plus bas, un fondu signale la suite.
            className={cn(
              'relative max-h-[min(620px,calc(100dvh-140px))] overflow-y-auto overscroll-contain p-1.5 max-shell:max-h-[calc(100dvh-124px)]',
              more && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]',
            )}
          >
            <span ref={hlRef} aria-hidden="true" className="pointer-events-none absolute top-0 right-1.5 left-1.5 h-9 rounded-item bg-ink shadow-[inset_0_0_0_1px_var(--line),inset_0_1px_0_var(--hi)] transition-transform duration-[180ms] ease-[var(--ease-out)] before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent before:content-['']" />
            {groups.map(({ group, options }, gi) =>
              group ? (
                <div key={group} role="group" aria-labelledby={`pal-g${gi}`}>
                  <div id={`pal-g${gi}`} className="px-2.5 pt-2.5 pb-1.5 text-meta font-semibold text-muted">{group}</div>
                  {options.map(option)}
                </div>
              ) : (
                options.map(option)
              ),
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
