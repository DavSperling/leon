'use client';

import { useTranslations } from 'next-intl';
import { Tabs } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';

const TABS = ['profil', 'securite', 'equipe', 'integrations'] as const;
type Tab = (typeof TABS)[number];
const LABELS = {
  profil: 'tabProfile',
  securite: 'tabSecurity',
  equipe: 'tabTeam',
  integrations: 'tabIntegrations',
} as const;

// Les ancres des sections (liens de Connexions, « un jeton créé ci-dessus ») ouvrent l'onglet qui les contient.
const SECTIONS: Record<string, Tab> = {
  membres: 'equipe',
  jetons: 'integrations',
  'claude-code': 'integrations',
  extension: 'integrations',
};
const tabOf = (hash: string): Tab | undefined => {
  const anchor = decodeURIComponent(hash.slice(1));
  return TABS.find((tab) => tab === anchor) ?? SECTIONS[anchor];
};

// Les onglets suivent l'ancre de l'URL (/reglages#securite) : un lien ou un rechargement ouvre le bon.
export function SettingsTabs({ panels }: { panels: Record<Tab, ReactNode> }) {
  const t = useTranslations('settings');
  const [active, setActive] = useState<Tab>('profil');

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
    <Tabs.Root value={active} onValueChange={choose}>
      <Tabs.List
        aria-label={t('tabsLabel')}
        className="mb-7 flex gap-2 overflow-x-auto border-b border-line [scrollbar-width:none]"
      >
        {TABS.map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            className="-mb-px shrink-0 rounded-t-chip border-b-2 border-transparent px-4 py-2.5 text-ui text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-fg"
          >
            {t(LABELS[tab])}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TABS.map((tab) => (
        <Tabs.Content key={tab} value={tab}>
          {panels[tab]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
