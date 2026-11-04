'use client';

import { Blocks, ShieldCheck, UserRound, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Tabs } from 'radix-ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ROW, ROW_ICON } from '@/components/verre/shell/sidebar';
import { cn, spring, useMinWidth } from '@/lib/verre';

const TABS = ['profil', 'securite', 'equipe', 'integrations'] as const;
type Tab = (typeof TABS)[number];
const LABELS = {
  profil: 'tabProfile',
  securite: 'tabSecurity',
  equipe: 'tabTeam',
  integrations: 'tabIntegrations',
} as const;
const ICONS = { profil: UserRound, securite: ShieldCheck, equipe: Users, integrations: Blocks };

// Les ancres des sections (liens de Connexions, « un jeton créé ci-dessus ») ouvrent l'onglet qui les contient.
const SECTIONS: Record<string, Tab> = {
  membres: 'equipe',
  ordinateurs: 'integrations',
  jetons: 'integrations',
  assistants: 'integrations',
  extension: 'integrations',
};
export const tabOf = (hash: string): Tab | undefined => {
  const anchor = decodeURIComponent(hash.slice(1));
  return TABS.find((tab) => tab === anchor) ?? SECTIONS[anchor];
};

// Les onglets suivent l'ancre de l'URL (/reglages#securite) : un lien ou un rechargement ouvre le bon.
// Panneau large : une colonne à gauche, mêmes lignes que la barre latérale ; étroit, les mêmes lignes en rangée au-dessus.
export function SettingsTabs({ panels }: { panels: Record<Tab, ReactNode> }) {
  const t = useTranslations('settings');
  const [active, setActive] = useState<Tab>('profil');
  const root = useRef<HTMLDivElement>(null);
  const wide = useMinWidth(root, 720);

  useEffect(() => {
    const follow = () => {
      const tab = tabOf(window.location.hash);
      if (tab) setActive(tab);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const choose = (value: string) => {
    setActive(value as Tab);
    window.history.replaceState(null, '', `#${value}`);
  };

  return (
    <Tabs.Root
      ref={root}
      value={active}
      onValueChange={choose}
      orientation={wide ? 'vertical' : 'horizontal'}
      className={cn(wide && 'grid grid-cols-[200px_minmax(0,1fr)] items-start gap-12')}
    >
      <Tabs.List
        aria-label={t('tabsLabel')}
        className={cn(
          'flex gap-0.5',
          wide
            ? 'sticky top-6 flex-col'
            : 'mb-7 overflow-x-auto border-b border-line pb-2 [scrollbar-width:none]',
        )}
      >
        {TABS.map((tab) => {
          const Icon = ICONS[tab];
          const isActive = tab === active;
          return (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className={cn(ROW, !wide && 'w-auto shrink-0', isActive && 'font-semibold text-fg')}
            >
              {isActive && (
                <motion.span
                  layoutId="settings-ink"
                  transition={spring}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-field border border-line bg-ink shadow-hi"
                />
              )}
              <Icon
                aria-hidden="true"
                strokeWidth={1.6}
                className={cn(
                  ROW_ICON,
                  isActive ? 'text-accent' : 'text-muted group-hover:text-fg-2',
                )}
              />
              <span className="relative whitespace-nowrap">{t(LABELS[tab])}</span>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      {TABS.map((tab) => (
        <Tabs.Content key={tab} value={tab} className="min-w-0 max-w-[760px]">
          {panels[tab]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
