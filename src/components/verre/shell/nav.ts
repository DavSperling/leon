import {
  FileText,
  type LucideIcon,
  MessagesSquare,
  Plug,
  Settings2,
  TextSearch,
} from 'lucide-react';

// Les cinq sections, partagées par la barre latérale, la feuille mobile et la palette. Recherche a sa loupe sur des
// lignes ; le bouton « Rechercher ⌘K » juste au-dessus a le glyphe ⌘ (dans le rail, deux loupes empilées se confondaient).
export type NavItem = { href: string; label: string; icon: LucideIcon; end?: boolean };

export const NAV: NavItem[] = [
  { href: '/', label: 'Recherche', icon: TextSearch, end: true },
  { href: '/discussions', label: 'Discussions', icon: MessagesSquare },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/connexions', label: 'Connexions', icon: Plug },
  { href: '/reglages', label: 'Réglages', icon: Settings2 },
];

/** La section d'une adresse : « /discussions/acme » → Discussions. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  NAV.find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
