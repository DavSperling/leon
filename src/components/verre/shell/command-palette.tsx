'use client';

import {
  FileText,
  KeyRound,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  Plug,
  Search,
  Sun,
} from 'lucide-react';
import { unstable_rethrow, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog as RDialog } from 'radix-ui';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { searchShellAction } from '@/app/(app)/actions';
import { newDiscussionAction } from '@/app/(app)/discussions/actions';
import { PROVIDER_IDS } from '@/capture/turn';
import { Avatar } from '@/components/verre/ui/avatar';
import { ToolLogo } from '@/components/verre/ui/chips';
import { Kbd } from '@/components/verre/ui/kbd';
import { Strokes } from '@/components/verre/ui/marks';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { fold } from '@/lib/verre/text';
import { useTheme } from '@/lib/verre/theme';
import type { ShellFound } from '@/server/shell/shell';
import { NAV, sectionOf } from './nav';
import { isDesktop, toggleRail, useRailCollapsed } from './rail';
import type { SidebarData } from './sidebar';

/** Le bouton « Demander ou chercher… » de la barre du haut : la barre de commande s'ouvre posée sur lui. */
export const ASK_ID = 'demander';

type Option = {
  id: string;
  group: string | null;
  label: string;
  /** Une icône de 18 px, le logo d'un outil, le rond d'une personne, les trois traits. */
  picture: ReactNode;
  meta?: string;
  /** Ce qui ne va pas (un outil à reconnecter) : la ligne discrète en rouge. */
  alert?: boolean;
  /** Une touche à droite (« [ »), muette : aria-keyshortcuts du bouton de la barre la dit. */
  kbd?: string;
  busy?: boolean;
  run: () => void;
};

const ICON = { 'aria-hidden': true, strokeWidth: 1.6 } as const;
const within = (text: string, f: string) => fold(text).includes(f);

/**
 * La barre de commande (⌘K, ou la barre du haut). Des mots tapés : « Demander à Leon » ouvre une discussion (la vraie
 * action), « Chercher » ouvre les résultats ; puis les outils, les personnes, les documents et les discussions que le
 * serveur trouve sous les droits de la personne ; puis les écrans. Sans rien de tapé : ce qui demande de l'attention,
 * les discussions récentes, les écrans, les actions. Filtre sans accent ; ↑ ↓ Entrée Échap ; le champ garde le focus
 * (combobox + listbox, aria-activedescendant). À la fermeture, le focus revient à l'élément qui l'avait à l'ouverture,
 * ou va au contenu (<main>) après une navigation.
 */
export function CommandPalette({
  open,
  onOpenChange,
  recents,
  reconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & Pick<SidebarData, 'recents' | 'reconnect'>) {
  const router = useRouter();
  const pathname = usePathname();
  const navT = useTranslations('navigation');
  const t = useTranslations('shell');
  const { theme, toggle } = useTheme();
  const collapsed = useRailCollapsed();
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [found, setFound] = useState<ShellFound | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [asking, startAsking] = useTransition();
  const [place, setPlace] = useState<CSSProperties | undefined>();
  const [more, setMore] = useState(false);
  const navigated = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latest = useRef('');

  // Avant que Radix ne déplace le focus dans le champ (ses effets passent après les effets de mise en page). La barre
  // s'ouvre à la place de la barre du haut ; sur un écran qui a son propre champ, en haut de la page ; au doigt, sur
  // toute la largeur (les classes).
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.activeElement;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    setQ('');
    setActiveId(null);
    setFound(null);
    setRefusal(null);
    const bar = document.getElementById(ASK_ID)?.getBoundingClientRect();
    const page = document.getElementById('contenu')?.getBoundingClientRect();
    if (!isDesktop() || !page) setPlace(undefined);
    else if (bar?.width)
      setPlace({ left: bar.left, top: Math.max(8, bar.top), width: bar.width, translate: 'none' });
    else {
      const width = Math.min(720, page.width - 64);
      setPlace({ left: page.left + (page.width - width) / 2, top: 12, width, translate: 'none' });
    }
  }, [open]);

  // Une page est arrivée (une ligne choisie, ou la discussion que « Demander à Leon » vient d'ouvrir) : la barre se ferme.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement au changement de page
  useEffect(() => {
    if (!open) return;
    navigated.current = true;
    onOpenChange(false);
  }, [pathname]);

  const query = q.trim();

  // Ce que le serveur trouve, un instant après la dernière frappe ; une réponse en retard sur la frappe est ignorée.
  useEffect(() => {
    latest.current = query;
    if (!open || !query) return;
    const timer = setTimeout(async () => {
      const result = await searchShellAction(query).catch(() => null);
      if (result && latest.current === query) setFound(result);
    }, 160);
    return () => clearTimeout(timer);
  }, [open, query]);

  const visible = useMemo<Option[]>(() => {
    const go = (to: string) => () => {
      navigated.current = true;
      onOpenChange(false);
      router.push(to);
    };
    const f = fold(query);
    const here = sectionOf(pathname);
    const screens: Option[] = NAV.map((n, i) => ({
      id: `n${i}`,
      group: t('goTo'),
      label: navT(n.labelKey),
      picture: <n.icon {...ICON} />,
      meta: n === here ? t('youAreHere') : undefined,
      run: go(n.href),
    }));
    const actions: Option[] = [
      {
        id: 'a0',
        group: t('actions'),
        label: t('newDiscussion'),
        picture: <MessageSquarePlus {...ICON} />,
        run: go('/discussions'),
      },
      {
        id: 'a1',
        group: t('actions'),
        label: t('connectTool'),
        picture: <Plug {...ICON} />,
        run: go('/connexions'),
      },
      {
        id: 'a2',
        group: t('actions'),
        label: t('createToken'),
        picture: <KeyRound {...ICON} />,
        run: go('/reglages'),
      },
      {
        id: 'a3',
        group: t('actions'),
        label: t('toggleTheme'),
        picture: theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />,
        meta: theme === 'dark' ? t('darkTheme') : t('lightTheme'),
        run: () => {
          toggle();
          onOpenChange(false);
        },
      },
    ];
    // sous 861 px, pas de barre latérale à replier
    if (isDesktop())
      actions.push({
        id: 'a4',
        group: t('actions'),
        label: collapsed ? t('expandSidebar') : t('collapseSidebar'),
        picture: <PanelLeft {...ICON} />,
        kbd: '[',
        run: () => {
          toggleRail();
          onOpenChange(false);
        },
      });
    const discussion = (group: string) => (d: { id: string; title: string }) => ({
      id: `c-${d.id}`,
      group,
      label: d.title,
      picture: <MessageSquare {...ICON} />,
      run: go(`/discussions/${d.id}`),
    });

    if (!query)
      return [
        ...reconnect.slice(0, 5).map((tool) => ({
          id: `r-${tool}`,
          group: t('needsAttention'),
          label: t('reconnectTool', { tool: PROVIDER_LABELS[tool] }),
          picture: <ToolLogo kind={tool} size={18} />,
          run: go(`/connexions?outil=${tool}`),
        })),
        ...recents.map(discussion(t('recentDiscussions'))),
        ...screens,
        ...actions,
      ];

    const ask: Option = {
      id: 'ask',
      group: null,
      label: asking ? t('askingLeon') : nb(t('askLeon', { query })),
      picture: <Strokes className="scale-[0.8]" />,
      busy: asking,
      run: () => {
        if (asking) return;
        setRefusal(null);
        startAsking(async () => {
          const form = new FormData();
          form.set('question', query);
          // La discussion créée, l'action redirige vers elle et ne rend rien ; un retour est un refus, dit sur place.
          // Une panne (réseau, serveur) se dit aussi : jamais d'attente muette.
          try {
            const state = await newDiscussionAction({ error: null }, form);
            if (state?.error) setRefusal(state.error);
          } catch (error) {
            unstable_rethrow(error);
            setRefusal(t('askFailed'));
          }
        });
      },
    };
    const search: Option = {
      id: 'find',
      group: null,
      label: nb(t('searchQuery', { query })),
      picture: <Search {...ICON} />,
      run: go(`/?q=${encodeURIComponent(query)}`),
    };
    // Les outils viennent du catalogue, connu ici : ils s'affichent à la frappe, triés comme le serveur les trie (ceux
    // qui commencent par les lettres d'abord, cinq au plus) ; sa réponse ajoute seulement leur état, comme leur carte.
    const stateOf = new Map(found?.tools.map((tool) => [tool.id, tool.state]));
    const tools: Option[] = PROVIDER_IDS.map((id) => ({ id, label: PROVIDER_LABELS[id] }))
      .filter((tool) => within(tool.label, f))
      .sort(
        (a, b) =>
          Number(fold(b.label).startsWith(f)) - Number(fold(a.label).startsWith(f)) ||
          a.label.localeCompare(b.label),
      )
      .slice(0, 5)
      .map((tool) => {
        const state = stateOf.get(tool.id);
        return {
          id: `t-${tool.id}`,
          group: t('tools'),
          label: tool.label,
          picture: <ToolLogo kind={tool.id} size={18} />,
          meta:
            state === 'broken'
              ? t('toReconnectShort')
              : state === 'paused'
                ? t('paused')
                : state === 'connected'
                  ? t('connected')
                  : undefined,
          alert: state === 'broken',
          run: go(`/connexions?outil=${tool.id}`),
        };
      });
    // Les résultats d'avant restent le temps que les nouveaux arrivent, filtrés par les lettres d'à présent.
    const things: Option[] = [
      ...tools,
      ...(found
        ? [
            ...found.people
              .filter((p) => within(p.name, f))
              .map((p) => ({
                id: `p-${p.id}`,
                group: t('people'),
                label: p.name,
                picture: <Avatar name={p.name} src={p.image} size={24} />,
                run: go(`/equipe?personne=${p.id}`),
              })),
            ...found.documents
              .filter((d) => within(d.title, f))
              .map((d) => ({
                id: `d-${d.id}`,
                group: t('documents'),
                label: d.title,
                picture: <FileText {...ICON} />,
                meta: d.private ? t('onlyYou') : undefined,
                run: go(`/documents?document=${d.id}`),
              })),
            ...found.discussions
              .filter((d) => within(d.title, f))
              .map(discussion(t('discussions'))),
          ]
        : []),
    ];
    const named = [...screens, ...actions].filter((o) => within(o.label, f));
    // Le début d'un mot d'un écran ou d'une action (« régl », « jeton ») : Entrée y va, et la question suit. Sinon,
    // Entrée demande à Leon. Une seule lettre ne désigne rien. Ce que le serveur trouve arrive toujours sous les
    // lignes déjà là : rien ne bouge sous Entrée.
    const first = f.length > 1 ? named.filter((o) => ` ${fold(o.label)}`.includes(` ${f}`)) : [];
    return [...first, ask, search, ...things, ...named.filter((o) => !first.includes(o))];
  }, [
    query,
    found,
    asking,
    recents,
    reconnect,
    pathname,
    theme,
    toggle,
    collapsed,
    router,
    onOpenChange,
    t,
    navT,
  ]);

  const current = visible.find((o) => o.id === activeId) ?? visible[0];

  // Les options regroupées pour le lecteur d'écran (role=group nommé par son titre) ; les lignes de texte libre restent seules.
  const groups = useMemo(() => {
    const out: Array<{ group: string | null; options: Option[] }> = [];
    for (const o of visible) {
      const last = out.at(-1);
      if (last && last.group === o.group) last.options.push(o);
      else out.push({ group: o.group, options: [o] });
    }
    return out;
  }, [visible]);

  const fade = () => {
    const l = listRef.current;
    if (l) setMore(l.scrollTop + l.clientHeight < l.scrollHeight - 2);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: la suite de la liste se mesure quand ses lignes changent
  useLayoutEffect(fade, [visible]);

  const move = (step: number) => {
    if (!visible.length) return;
    const at = current ? visible.indexOf(current) : 0;
    const next = visible[(at + step + visible.length) % visible.length];
    if (!next) return;
    setActiveId(next.id);
    requestAnimationFrame(() =>
      document.getElementById(`pal-${next.id}`)?.scrollIntoView({ block: 'nearest' }),
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (step) {
      e.preventDefault();
      move(step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      current?.run();
    } else if (e.key === 'Tab') e.preventDefault(); // le champ est le seul élément focalisable
  };

  const option = (o: Option) => {
    const selected = o === current;
    // Option d'une listbox : le clavier reste dans le champ (aria-activedescendant), la souris clique.
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: le clavier passe par le champ (↑ ↓ Entrée)
      // biome-ignore lint/a11y/useFocusableInteractive: le focus reste dans le champ (aria-activedescendant)
      <div
        key={o.id}
        id={`pal-${o.id}`}
        role="option"
        aria-selected={selected}
        aria-busy={o.busy || undefined}
        onPointerMove={() => !selected && setActiveId(o.id)}
        onClick={o.run}
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-item px-2.5 py-1.5 text-ui leading-[1.3] text-fg max-shell:min-h-11',
          selected && 'bg-selected',
        )}
      >
        <span
          className={cn(
            'grid w-6 shrink-0 place-items-center text-icon transition-colors duration-150 [&>svg]:size-[18px]',
            selected && 'text-fg',
          )}
        >
          {o.picture}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {/* « en cours » : le surligneur passe une fois sous les mots, pas sur toute la ligne */}
          <span className={o.busy ? 'mark is-working' : undefined}>{o.label}</span>
        </span>
        {o.kbd ? (
          <Kbd>{o.kbd}</Kbd>
        ) : (
          o.meta && (
            <span
              className={cn(
                'shrink-0 text-label max-sm:hidden',
                o.alert ? 'text-destructive' : 'text-muted',
              )}
            >
              {o.meta}
            </span>
          )
        )}
        <Kbd className={cn('max-shell:hidden', !selected && 'invisible')}>↵</Kbd>
      </div>
    );
  };

  return (
    // Pendant « Envoi à Leon… », ni Échap ni un clic dehors ne ferment : la discussion se crée et la page y mène.
    <RDialog.Root open={open} onOpenChange={(next) => (next || !asking) && onOpenChange(next)}>
      <RDialog.Portal>
        <RDialog.Overlay className="layer-scrim fixed inset-0 z-50 bg-scrim" />
        <RDialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // ouverte sans déclencheur Radix (⌘K, boutons) : on rend le focus nous-mêmes
            e.preventDefault();
            // après une navigation, la nouvelle page a pu poser le focus (le champ d'une discussion) : on le lui laisse
            if (!navigated.current && opener.current?.isConnected)
              opener.current.focus({ preventScroll: true });
            navigated.current = false;
            // rien à retrouver (ouverte depuis la page, ou page changée) : le focus va au contenu
            if (document.activeElement === document.body)
              document.getElementById('contenu')?.focus({ preventScroll: true });
          }}
          onMouseDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}
          style={place}
          className="layer-scrim fixed top-[var(--inset)] left-1/2 z-50 w-[min(720px,calc(100vw-16px))] -translate-x-1/2 overflow-hidden rounded-card border border-float-line bg-menu text-fg shadow-float outline-none"
        >
          <RDialog.Title className="sr-only">{t('paletteTitle')}</RDialog.Title>
          <div className="flex h-[52px] items-center gap-3.5 border-b border-line pr-3.5 pl-[18px] max-shell:h-12 max-shell:pl-3.5">
            <Strokes />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveId(null);
                setRefusal(null);
                listRef.current?.scrollTo(0, 0);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={visible.length > 0}
              aria-controls="pal-list"
              aria-autocomplete="list"
              aria-activedescendant={current ? `pal-${current.id}` : undefined}
              aria-label={t('searchAndGo')}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-lead text-fg outline-none placeholder:text-muted max-shell:text-[16px]"
            />
            <Kbd className="max-shell:hidden">esc</Kbd>
          </div>
          {refusal && (
            <p
              role="alert"
              className="border-b border-line px-[18px] py-2.5 text-ui text-destructive"
            >
              {refusal}
            </p>
          )}
          <div
            ref={listRef}
            id="pal-list"
            role="listbox"
            aria-label={t('suggestions')}
            onScroll={fade}
            // Plus haute que la fenêtre, la liste défile ; un fondu signale la suite.
            className={cn(
              'max-h-[min(584px,calc(100dvh-160px))] overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin] max-shell:max-h-[calc(100dvh-124px)]',
              more && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]',
            )}
          >
            {groups.map(({ group, options }) =>
              group ? (
                // biome-ignore lint/a11y/useSemanticElements: groupe d'options d'une listbox, pas un formulaire
                <div key={group} role="group" aria-label={group}>
                  <div
                    aria-hidden="true"
                    className="px-2.5 pt-2.5 pb-1 text-label leading-[1.4] font-medium text-muted"
                  >
                    {group}
                  </div>
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
