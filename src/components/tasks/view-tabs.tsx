import Link from 'next/link';
import { cn } from '@/lib/utils';

export type ViewTab = { key: string; label: string; href: string; current: boolean };

type ViewTabsProps = { label: string; tabs: ViewTab[]; className?: string };

// Des onglets qui sont des adresses, donc des liens : le retour arrière retrouve l'onglet précédent.
export function ViewTabs({ label, tabs, className }: ViewTabsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              className={cn(
                'flex h-7 max-w-48 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                tab.current && 'bg-accent font-medium text-foreground',
              )}
            >
              <span className="truncate">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
