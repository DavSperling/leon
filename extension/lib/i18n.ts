// L'extension n'a pas next-intl : anglais par défaut, français si le navigateur est en français.
// Le français reste écrit dans le HTML (le texte de consentement en dépend : son empreinte, voir
// consent-version.test.ts) et l'anglais à côté : `data-en` pour le texte d'un élément, `data-en-label` pour son
// aria-label. Dans le code, `t(français, anglais)`.

export const isFrench = navigator.language.toLowerCase().startsWith('fr');

export const t = (fr: string, en: string): string => (isFrench ? fr : en);

// Pour toLocaleString() : la date d'une capture dans la langue de l'interface.
export const dateLocale = isFrench ? 'fr-FR' : 'en-US';

// À appeler au démarrage d'une page : remplace le français du HTML par son anglais.
export function translatePage(): void {
  if (isFrench) return;
  document.documentElement.lang = 'en';
  for (const element of document.querySelectorAll<HTMLElement>('[data-en]')) {
    element.textContent = element.dataset.en ?? '';
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-en-label]')) {
    element.setAttribute('aria-label', element.dataset.enLabel ?? '');
  }
}
