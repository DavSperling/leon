'use client';

import { Inbox, type LucideIcon, MessagesSquare, Plug, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const SECTIONS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Recherche', icon: Search },
  { href: '/discussions', label: 'Discussions', icon: MessagesSquare },
  { href: '/sources', label: 'Sources', icon: Inbox },
  { href: '/connexions', label: 'Connexions', icon: Plug },
  { href: '/reglages', label: 'Réglages', icon: Settings },
];

// Sections de la barre latérale ; Réglages, l'utilitaire, descend en bas.
export function SidebarSections() {
  const pathname = usePathname();
  const item = ({ href, label, icon: Icon }: (typeof SECTIONS)[number]) => {
    const current =
      href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] leading-5 text-foreground-2 transition-colors hover:bg-black/[0.04] hover:text-foreground',
            current &&
              'bg-card font-medium text-foreground shadow-xs ring-1 ring-border hover:bg-card',
          )}
        >
          <Icon
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={
              current ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
            }
          />
          {label}
        </Link>
      </li>
    );
  };
  const main = SECTIONS.filter((section) => section.href !== '/reglages');
  const utilities = SECTIONS.filter((section) => section.href === '/reglages');
  return (
    <>
      <ul className="space-y-0.5">{main.map(item)}</ul>
      <ul className="mt-auto space-y-0.5">{utilities.map(item)}</ul>
    </>
  );
}
