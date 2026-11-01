import {
  Code,
  FileText,
  type LucideIcon,
  MessagesSquare,
  Plug,
  Settings2,
  TextSearch,
} from 'lucide-react';

// Les cinq sections, partagées par la barre latérale, la feuille mobile et la palette. Recherche a sa loupe sur des
// lignes ; le bouton « Rechercher ⌘K » juste au-dessus a le glyphe ⌘ (dans le rail, deux loupes empilées se confondaient).
// `label` : le libellé français, que les guides citent ; `labelKey` : sa clé dans les messages (navigation).
export type NavItem = {
  href: string;
  label: string;
  labelKey: 'search' | 'discussions' | 'documents' | 'connections' | 'developers' | 'settings';
  icon: LucideIcon;
  end?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Recherche', labelKey: 'search', icon: TextSearch, end: true },
  { href: '/discussions', label: 'Discussions', labelKey: 'discussions', icon: MessagesSquare },
  { href: '/documents', label: 'Documents', labelKey: 'documents', icon: FileText },
  { href: '/connexions', label: 'Connexions', labelKey: 'connections', icon: Plug },
  { href: '/reglages', label: 'Réglages', labelKey: 'settings', icon: Settings2 },
];

// Réservée aux membres qui codent (une session Claude Code ou une note de passation) : hors de NAV, que les guides
// citent telle quelle.
export const DEVELOPERS_NAV: NavItem = {
  href: '/developpeurs',
  label: 'Développeurs',
  labelKey: 'developers',
  icon: Code,
};

/** Les sections que voit un membre : « Développeurs » avant Réglages, s'il code. */
export const navFor = (developer: boolean): NavItem[] =>
  developer ? [...NAV.slice(0, -1), DEVELOPERS_NAV, ...NAV.slice(-1)] : NAV;

/** La section d'une adresse : « /discussions/acme » → Discussions. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  [...NAV, DEVELOPERS_NAV].find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
