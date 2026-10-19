'use client';

import { Inbox, type LucideIcon, Plug, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const SECTIONS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Recherche', icon: Search },
  { href: '/sources', label: 'Sources', icon: Inbox },
  { href: '/connexions', label: 'Connexions', icon: Plug },
  { href: '/reglages', label: 'Réglages', icon: Settings },
];

// Sections de la barre latérale.
export function SidebarSections() {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {SECTIONS.map(({ href, label, icon: Icon }) => {
        const current =
          href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-base leading-5 text-foreground-2 transition-colors hover:bg-sidebar-accent hover:text-foreground',
                current && 'bg-sidebar-accent font-medium text-primary hover:text-primary',
              )}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
