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
// `label` : le libellé français, que les guides citent ; `labelKey` : sa clé dans les messages (navigation).
export type NavItem = {
  href: string;
  label: string;
  labelKey: 'search' | 'discussions' | 'documents' | 'connections' | 'settings';
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

/** La section d'une adresse : « /discussions/acme » → Discussions. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  NAV.find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
