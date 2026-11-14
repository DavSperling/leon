'use client';

import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { PageHeader, Pill } from '@/components/verre';

// Les cinq groupes : Profil, Sécurité, Assistants (l'ancien onglet « Intégrations », même id), Espace de travail
// (l'ancien onglet « Équipe », même id : Connexions mène à /reglages#equipe pour les dépôts d'équipe) et Mémoire.
const TABS = ['profil', 'securite', 'integrations', 'equipe', 'memoire'] as const;
type Tab = (typeof TABS)[number];
const LABELS = {
  profil: 'tabProfile',
  securite: 'tabSecurity',
  integrations: 'tabAssistants',
  equipe: 'tabWorkspace',
  memoire: 'tabMemory',
} as const;

// Les ancres des sections (liens de Connexions, de l'onboarding) ouvrent le groupe qui les contient.
const SECTIONS: Record<string, Tab> = {
  membres: 'equipe',
  ordinateurs: 'integrations',
  jetons: 'integrations',
  assistants: 'integrations',
  extension: 'integrations',
  sso: 'equipe',
  managers: 'equipe',
  'depots-equipe': 'equipe',
  // les ancres du prototype, en anglais
  profile: 'profil',
  security: 'securite',
  workspace: 'equipe',
};
export const tabOf = (hash: string): Tab | undefined => {
  const anchor = decodeURIComponent(hash.slice(1));
  return TABS.find((tab) => tab === anchor) ?? SECTIONS[anchor];
};

// Les membres, l'organigramme et les groupes vivent dans l'écran Équipe : leurs anciennes ancres y mènent.
const TEAM_ANCHORS = new Set(['#membres', '#organigramme', '#groupes']);

// L'emplacement de la pastille d'encre, à droite du titre : le groupe qui en a une (« Enregistrer ») l'y pose.
const HeadSlot = createContext<HTMLElement | null>(null);
export const useHeadSlot = () => useContext(HeadSlot);

/**
 * Le titre, les cinq puces et le groupe choisi. Le groupe suit l'ancre de l'URL (/reglages#securite) : un lien ou un
 * rechargement ouvre le bon. Tous restent montés (un champ modifié survit à un changement de puce).
 */
export function SettingsTabs({ title, panels }: { title: string; panels: Record<Tab, ReactNode> }) {
  const t = useTranslations('settings');
  const [active, setActive] = useState<Tab>('profil');
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const follow = () => {
      if (TEAM_ANCHORS.has(window.location.hash)) return window.location.replace('/equipe');
      const tab = tabOf(window.location.hash);
      if (tab) setActive(tab);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const choose = (tab: Tab) => {
    setActive(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };

  return (
    <>
      <PageHeader title={title} actions={<span ref={setSlot} className="contents" />} />
      {/* une seule rangée (écart et marges resserrés sur un téléphone) ; quand les cinq puces ne tiennent pas, elle
          défile de côté ; la marge de 4 px garde l'anneau du focus entier */}
      {/* biome-ignore lint/a11y/useSemanticElements: un groupe de boutons bascule, pas un formulaire (fieldset) */}
      <div
        role="group"
        aria-label={t('tabsLabel')}
        className="-m-1 mb-3 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] max-[480px]:gap-1.5 max-[480px]:[&>button]:px-2.5"
      >
        {TABS.map((tab) => (
          <Pill key={tab} aria-pressed={tab === active} onClick={() => choose(tab)}>
            {t(LABELS[tab])}
          </Pill>
        ))}
      </div>
      {TABS.map((tab) => (
        <section key={tab} aria-label={t(LABELS[tab])} hidden={tab !== active}>
          {/* seul le groupe affiché pose sa pastille : « Enregistrer » ne reste pas sur Sécurité */}
          <HeadSlot.Provider value={tab === active ? slot : null}>{panels[tab]}</HeadSlot.Provider>
        </section>
      ))}
    </>
  );
}
