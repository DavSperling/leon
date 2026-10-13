'use client';

import { BookOpen, ClipboardCheck, Inbox, type LucideIcon, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const SECTIONS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/a-verifier', label: 'À vérifier', icon: ClipboardCheck },
  { href: '/sources', label: 'Sources', icon: Inbox },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/reglages', label: 'Réglages', icon: Settings },
];

// Pied de la barre latérale : les quatre sections, « À vérifier » avec son compteur.
export function SidebarSections({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <ul className="border-t py-2">
      {SECTIONS.map(({ href, label, icon: Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-7 items-center gap-2 border-l-2 border-transparent px-3 text-[13px] leading-[18px] hover:bg-accent',
                current && 'border-primary bg-primary-soft text-primary',
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              {label}
              {href === '/a-verifier' && reviewCount > 0 && (
                <span className="ml-auto rounded-sm bg-warning-soft px-1.5 font-mono text-xs leading-4 text-warning">
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
