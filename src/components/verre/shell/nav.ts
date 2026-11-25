import {
  Bot,
  FileText,
  House,
  type LucideIcon,
  MessageSquare,
  Plug,
  Settings2,
  Users,
} from 'lucide-react';

// Les sept sections, partagées par la barre latérale, la feuille mobile et la barre de commande. La barre les montre en
// deux groupes : les deux premières (où l'on demande), puis les cinq autres, Agents en tête.
// `label` : le libellé français que les guides citent (docs/guides, guides-docs.test.ts) ; ce que l'écran écrit vient de
// `labelKey`, sa clé dans les messages (navigation) : « / » s'y appelle Accueil.
export type NavItem = {
  href: string;
  label: string;
  labelKey: 'home' | 'discussions' | 'agents' | 'documents' | 'team' | 'connections' | 'settings';
  icon: LucideIcon;
  end?: boolean;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Recherche', labelKey: 'home', icon: House, end: true },
  { href: '/discussions', label: 'Discussions', labelKey: 'discussions', icon: MessageSquare },
  { href: '/agents', label: 'Agents', labelKey: 'agents', icon: Bot },
  { href: '/documents', label: 'Documents', labelKey: 'documents', icon: FileText },
  { href: '/team', label: 'Équipe', labelKey: 'team', icon: Users },
  { href: '/connections', label: 'Connexions', labelKey: 'connections', icon: Plug },
  { href: '/settings', label: 'Réglages', labelKey: 'settings', icon: Settings2 },
];

/** La section d'une adresse : « /discussions/acme » → Discussions. */
export const sectionOf = (pathname: string): NavItem | undefined =>
  NAV.find((n) =>
    n.end ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`),
  );
