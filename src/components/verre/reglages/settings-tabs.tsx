'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

const tabs = ['Profil', 'Sécurité', 'Équipe', 'Intégrations'] as const;
type Tab = (typeof tabs)[number];
type SettingsTabsProps = {
  profile: ReactNode;
  security: ReactNode;
  team: ReactNode;
  integrations: ReactNode;
};

export function SettingsTabs({ profile, security, team, integrations }: SettingsTabsProps) {
  const [active, setActive] = useState<Tab>('Profil');
  const content: Record<Tab, ReactNode> = {
    Profil: profile,
    Sécurité: security,
    Équipe: team,
    Intégrations: integrations,
  };
  return (
    <>
      <div
        role="tablist"
        aria-label="Sections des réglages"
        className="mb-7 flex flex-wrap gap-2 border-b border-line"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setActive(tab)}
            className={`rounded-t-chip px-4 py-2.5 text-ui transition-colors ${active === tab ? 'border-b-2 border-accent font-semibold text-fg' : 'text-muted hover:text-fg'}`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div role="tabpanel">{content[active]}</div>
    </>
  );
}
