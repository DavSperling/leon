'use client';

import { Ellipsis, PanelLeft, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { deleteDiscussionAction } from '@/app/(app)/discussions/actions';
import type { ProviderId } from '@/capture/turn';
import { AlertDialog } from '@/components/verre/ui/dialog';
import { Kbd } from '@/components/verre/ui/kbd';
import { Flag } from '@/components/verre/ui/marks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/verre/ui/menu';
import { toast } from '@/components/verre/ui/toast';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import type { ChannelHealth } from '@/server/memory/sources';
import { Brand } from './brand';
import { NAV, type NavItem, sectionOf } from './nav';
import { EASE, EASE_FOLD, LABEL, railOnly, toggleRail, useRailCollapsed } from './rail';
import { AccountMenu, type Viewer } from './workspace-menu';

// La barre latérale est une feuille posée sur le bureau (256 px ; repliée, un rail de 60 px). Toutes ses icônes sont
// centrées sur la même colonne (le milieu du rail) : en repliant, rien ne bouge, les libellés s'effacent.

// Une ligne de la barre : 34 px, 44 sous 861 px (doigt). Reprise par les onglets des Réglages.
export const ROW =
  'group relative flex h-[34px] w-full items-center gap-2.5 rounded-item pr-2 pl-2 text-ui font-medium text-fg transition-colors duration-150 hover:bg-hover active:bg-n-150 max-shell:h-11';
export const ROW_ICON =
  'relative size-[18px] shrink-0 text-icon transition-colors duration-150 group-hover:text-fg';
const CURRENT = 'bg-selected font-semibold hover:bg-selected';

/** Ce que la barre lit en plus de l'identité : les discussions récentes, les outils à reconnecter, la mémoire en retard. */
export type SidebarData = {
  recents: { id: string; title: string }[];
  reconnect: ProviderId[];
  stale: ChannelHealth[];
};

/**
 * Les sections, en deux groupes. Connexions porte le drapeau qui compte les outils à reconnecter : il dépasse du bord
 * de la feuille, comme sur un document ; dans le rail, un point rouge sur l'icône ; dans la feuille mobile, en bout de ligne.
 */
export function NavList({
  onNavigate,
  reconnect = 0,
}: {
  onNavigate?: () => void;
  reconnect?: number;
}) {
  // section active calculée ici : sous l'infobulle (Slot de Radix), une className en fonction serait changée en texte
  const current = sectionOf(usePathname());
  const t = useTranslations('navigation');
  const shellT = useTranslations('shell');
  const entry = (item: NavItem) => {
    const { href, labelKey, icon: Icon } = item;
    const label = t(labelKey);
    const isActive = item === current;
    const flag = href === '/connexions' && reconnect > 0 ? reconnect : 0;
    const toReconnect = flag ? shellT('toReconnect', { count: flag }) : '';
    return (
      <li key={href}>
        <Tooltip content={flag ? `${label} · ${toReconnect}` : label} side="right">
          <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            onPointerMove={railOnly}
            onFocus={railOnly}
            className={cn(ROW, isActive && CURRENT)}
          >
            <Icon
              aria-hidden="true"
              strokeWidth={1.6}
              className={cn(ROW_ICON, isActive && 'text-fg')}
            />
            <span className={cn(LABEL, 'min-w-0 flex-1 truncate')}>{label}</span>
            {flag > 0 && (
              <>
                <i
                  aria-hidden="true"
                  className="absolute top-1.5 left-[21px] hidden size-2 rounded-full bg-destructive shadow-[0_0_0_2px_var(--glass)] group-data-[rail=replie]/rail:block"
                />
                <Flag
                  tone={4}
                  className="absolute top-1.5 -right-[27px] group-data-[rail=replie]/rail:hidden max-shell:static max-shell:-mr-0.5"
                >
                  <span aria-hidden="true">{flag}</span>
                  <span className="sr-only">{toReconnect}</span>
                </Flag>
              </>
            )}
          </Link>
        </Tooltip>
      </li>
    );
  };
  return (
    <>
      <ul className="grid grid-cols-[minmax(0,1fr)]">{NAV.slice(0, 2).map(entry)}</ul>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)]">{NAV.slice(2).map(entry)}</ul>
    </>
  );
}

/**
 * « Récentes » : les cinq dernières discussions de la personne, celle qui est ouverte marquée. Chaque ligne a ses trois
 * points (au survol, au clavier, toujours au doigt) : « Supprimer », confirmé, pour de bon. Supprimer la discussion
 * ouverte mène à une nouvelle discussion. Sans discussion, rien ne s'affiche.
 */
export function Recents({
  recents,
  onNavigate,
  className,
}: {
  recents: SidebarData['recents'];
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  const labelId = useId();
  // la discussion visée reste nommée pendant que la fenêtre se referme
  const [asked, setAsked] = useState<SidebarData['recents'][number] | null>(null);
  const [asking, setAsking] = useState(false);
  const toAsk = useRef(false);
  const [deleting, startDeleting] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  // Après une suppression, le focus restait sur les trois points de la ligne partie : il va à la ligne qui prend sa
  // place, sinon à « Nouvelle discussion » de la même barre (latérale ou feuille mobile). La liste relue arrive souvent
  // avant que la confirmation ne se referme : on attend qu'elle soit partie (elle rendrait le focus aux trois points
  // disparus, donc à <body>), et la cible n'est oubliée qu'une fois le focus posé.
  const refocus = useRef<{ at: number; scope: Element | null } | null>(null);
  useEffect(() => {
    if (!refocus.current || (asked && recents.some((d) => d.id === asked.id))) return;
    let frame = 0;
    const place = () => {
      const target = refocus.current;
      if (!target) return;
      if (document.querySelector('[role="alertdialog"]')) {
        frame = requestAnimationFrame(place);
        return;
      }
      refocus.current = null;
      // une autre page a pris le focus (la discussion ouverte supprimée mène à une nouvelle)
      const at = document.activeElement;
      if (at && at !== document.body && at.id !== 'contenu') return;
      const rows = listRef.current?.querySelectorAll<HTMLElement>(':scope > li > a');
      (
        rows?.[target.at] ?? target.scope?.querySelector<HTMLElement>('a[href="/discussions"]')
      )?.focus();
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [recents, asked]);
  if (recents.length === 0) return null;

  const remove = (id: string) =>
    startDeleting(async () => {
      // On quitte d'abord la discussion ouverte : relue après sa suppression, sa page serait « introuvable ».
      if (pathname === `/discussions/${id}`) {
        onNavigate?.();
        router.push('/discussions');
      }
      refocus.current = {
        at: recents.findIndex((d) => d.id === id),
        scope: listRef.current?.closest('aside, [role="dialog"]') ?? null,
      };
      // L'action revalide : le layout relit la liste, la ligne part d'elle-même.
      const { ok } = await deleteDiscussionAction(id);
      if (!ok) {
        refocus.current = null;
        toast.error(t('deleteDiscussionFailed'));
      }
    });

  return (
    <div className={cn('min-h-0 overflow-hidden', className)} aria-busy={deleting || undefined}>
      <p id={labelId} className="mt-5 mb-1 px-2 text-label leading-[1.4] font-medium text-muted">
        {t('recent')}
      </p>
      <ul ref={listRef} aria-labelledby={labelId} className="grid grid-cols-[minmax(0,1fr)]">
        {recents.map((d) => {
          const open = pathname === `/discussions/${d.id}`;
          return (
            <li key={d.id} className="group/rec relative">
              <Link
                href={`/discussions/${d.id}`}
                aria-current={open ? 'true' : undefined}
                // un titre coupé se lit en entier au survol
                title={d.title}
                onClick={onNavigate}
                // au repos, le titre prend toute la ligne ; les trois points prennent leur place au survol, au clavier,
                // menu ouvert, et toujours au doigt
                className={cn(
                  'flex h-8 items-center rounded-item pr-2 pl-2 text-ui text-fg transition-colors duration-150 group-focus-within/rec:pr-9 group-hover/rec:pr-9 group-has-[[aria-expanded=true]]/rec:pr-9 hover:bg-hover active:bg-n-150 max-shell:h-11 max-shell:pr-12 shell:[@media(hover:none)]:pr-9',
                  open && CURRENT,
                )}
              >
                <span className="truncate">{d.title}</span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={nb(t('discussionMenu', { title: d.title }))}
                  className="absolute top-0.5 right-0.5 grid size-7 place-items-center rounded-item text-fg-2 opacity-0 transition-[opacity,background-color,color] duration-150 group-hover/rec:opacity-100 hover:bg-n-150 hover:text-fg focus-visible:opacity-100 data-[state=open]:bg-n-150 data-[state=open]:opacity-100 max-shell:top-0 max-shell:right-0 max-shell:size-11 max-shell:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Ellipsis aria-hidden="true" strokeWidth={1.8} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[180px]"
                  // la confirmation s'ouvre une fois le menu refermé : en se fermant à son tour, elle rend le focus aux trois points
                  onCloseAutoFocus={() => {
                    if (toAsk.current) setAsking(true);
                    toAsk.current = false;
                  }}
                >
                  <DropdownMenuItem
                    icon={Trash2}
                    destructive
                    onSelect={() => {
                      setAsked(d);
                      toAsk.current = true;
                    }}
                  >
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <AlertDialog
        open={asking}
        onOpenChange={setAsking}
        title={t('deleteDiscussionTitle', { title: asked?.title ?? '' })}
        description={t('deleteDiscussionText')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => asked && remove(asked.id)}
      />
    </div>
  );
}

const ALERT =
  'flex h-[34px] w-full items-center gap-2.5 rounded-item pr-2 pl-2 text-label font-medium transition-colors duration-150 max-shell:h-11';

/**
 * La barre ne dit quelque chose que si quelque chose ne va pas. Un outil que la personne doit reconnecter : une ligne
 * rouge qui ouvre cet outil sur Connexions ; plusieurs : « N outils à reconnecter », vers Connexions. Un canal de capture en retard (staleChannels) :
 * une ligne qui mène aux Réglages, où se branchent les captures ; repliée, son icône reste, avec son infobulle.
 */
export function Alerts({
  reconnect,
  stale,
  onNavigate,
}: Pick<SidebarData, 'reconnect' | 'stale'> & { onNavigate?: () => void }) {
  const t = useTranslations('shell');
  const tool = reconnect[0];
  const late =
    stale.length > 0 ? `${t('memoryLate')} · ${stale.map((c) => c.kindLabel).join(', ')}` : null;
  if (!tool && !late) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 pb-1">
      {tool && (
        <Link
          href={reconnect.length > 1 ? '/connexions' : `/connexions?outil=${tool}`}
          onClick={onNavigate}
          className={cn(
            ALERT,
            'text-destructive hover:bg-destructive-soft group-data-[rail=replie]/rail:hidden',
          )}
        >
          {/* le point est centré sur la colonne des icônes de 18 px */}
          <i aria-hidden="true" className="mx-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="truncate">
            {reconnect.length > 1
              ? t('toolsNeedReconnecting', { count: reconnect.length })
              : t('needsReconnecting', { tool: PROVIDER_LABELS[tool] })}
          </span>
        </Link>
      )}
      {late && (
        <Tooltip content={late} side="right">
          <Link
            href="/reglages"
            onClick={onNavigate}
            onPointerMove={railOnly}
            onFocus={railOnly}
            className={cn(ALERT, 'text-fg-2 hover:bg-hover hover:text-fg')}
          >
            <TriangleAlert
              aria-hidden="true"
              strokeWidth={1.6}
              className="size-[18px] shrink-0 text-warning"
            />
            <span className={cn(LABEL, 'truncate')}>{late}</span>
          </Link>
        </Tooltip>
      )}
    </div>
  );
}

export type SidebarProps = Viewer & SidebarData & { className?: string };

export function Sidebar({ recents, reconnect, stale, className, ...viewer }: SidebarProps) {
  const t = useTranslations('shell');
  const collapsed = useRailCollapsed();
  const toggleLabel = collapsed ? t('expandSidebar') : t('collapseSidebar');

  return (
    <aside
      id="barre-laterale"
      aria-label={t('sidebar')}
      data-rail={collapsed ? 'replie' : 'deplie'}
      className={cn(
        'group/rail fixed top-[var(--inset)] bottom-[var(--inset)] left-[var(--inset)] z-30 flex flex-col rounded-card border border-line bg-sheet p-3 shadow-lift transition-[width]',
        EASE,
        collapsed ? cn('w-[var(--rail-w)]', EASE_FOLD) : 'w-[var(--side-w)]',
        className,
      )}
    >
      {/* Dépliée : la marque à gauche, le bouton au bout. Repliée : le symbole seul (la marque est coupée après lui),
          et le bouton dessous : le chemin du retour se voit, à la souris comme au doigt. */}
      <div className="flex h-9 shrink-0 items-center justify-between pl-2 group-data-[rail=replie]/rail:h-auto group-data-[rail=replie]/rail:flex-col group-data-[rail=replie]/rail:gap-2 group-data-[rail=replie]/rail:pt-1.5 group-data-[rail=replie]/rail:pl-0">
        <Brand className="h-5 min-w-0 group-data-[rail=replie]/rail:w-[26px]" />
        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {toggleLabel}
              <Kbd>[</Kbd>
            </span>
          }
          side="right"
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls="barre-laterale"
            aria-keyshortcuts="["
            className="grid size-8 shrink-0 place-items-center rounded-item text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg active:bg-n-150"
          >
            <PanelLeft aria-hidden="true" strokeWidth={1.6} className="size-[18px]" />
          </button>
        </Tooltip>
      </div>
      <nav aria-label={t('primaryNavigation')} className="mt-3 shrink-0">
        <NavList reconnect={reconnect.length} />
      </nav>
      <Recents recents={recents} className="group-data-[rail=replie]/rail:hidden" />
      <div className="mt-auto flex shrink-0 flex-col pt-3">
        <Alerts reconnect={reconnect} stale={stale} />
        <AccountMenu {...viewer} />
      </div>
    </aside>
  );
}
