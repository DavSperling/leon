import { Inbox, type LucideIcon, MessagesSquare, Plug, Settings2, TextSearch } from 'lucide-react';

// Les cinq sections, partagées par la barre latérale, la feuille mobile et la palette. Recherche a sa loupe sur des
// lignes ; le bouton « Rechercher ⌘K » juste au-dessus a le glyphe ⌘ (dans le rail, deux loupes empilées se confondaient).
export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export const NAV: NavItem[] = [
  { to: '/', label: 'Recherche', icon: TextSearch, end: true },
  { to: '/discussions', label: 'Discussions', icon: MessagesSquare },
  { to: '/sources', label: 'Sources', icon: Inbox },
  { to: '/connexions', label: 'Connexions', icon: Plug },
  { to: '/reglages', label: 'Réglages', icon: Settings2 },
];

/** La section d'une adresse : « /discussions/acme » → Discussions. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  NAV.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));
