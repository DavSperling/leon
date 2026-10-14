'use client';

import { BookOpen, ClipboardCheck, Inbox, Layers, type LucideIcon, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export const SECTIONS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Briefing', icon: Layers },
  { href: '/a-verifier', label: 'À vérifier', icon: ClipboardCheck },
  { href: '/sources', label: 'Sources', icon: Inbox },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/reglages', label: 'Réglages', icon: Settings },
];

// Sections de la barre latérale, « À vérifier » avec son compteur.
export function SidebarSections({ reviewCount }: { reviewCount: number }) {
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
                'flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] leading-5 text-foreground-2 transition-colors hover:bg-sidebar-accent hover:text-foreground',
                current && 'bg-sidebar-accent font-medium text-primary hover:text-primary',
              )}
            >
              <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
              {label}
              {href === '/a-verifier' && reviewCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 text-xs leading-4 font-medium text-primary tabular-nums">
                  {formatNumber(reviewCount)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
