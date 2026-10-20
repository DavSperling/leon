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
            'flex h-8 items-center gap-2.5 rounded-md px-2 text-[14px] leading-5 text-foreground-2 transition-colors hover:bg-sidebar-accent hover:text-foreground',
            current && 'bg-sidebar-accent text-foreground',
          )}
        >
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
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
