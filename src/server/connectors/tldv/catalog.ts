import type { CatalogEntry } from '../types';

export const tldvCatalog: CatalogEntry = {
  id: 'tldv',
  fields: [{ name: 'apiKey', label: 'Clé d’API', kind: 'secret' }],
  keyHelp:
    'Dans tl;dv : Paramètres personnels › Clés d’API (tldv.io/app/settings/personal-settings/api-keys).',
  docsUrl: 'https://doc.tldv.io',
  triedForReal: false,
  warning:
    'API réservée aux offres Pro, Business et Entreprise (selon l’offre de l’organisateur de la réunion). Conditions de tl;dv à faire confirmer avant usage client : elles interdisent de copier ou de stocker une partie importante du contenu.',
  en: {
    fields: { apiKey: { label: 'API key' } },
    keyHelp:
      'In tl;dv: Personal settings › API keys (tldv.io/app/settings/personal-settings/api-keys).',
    warning:
      'API reserved for the Pro, Business, and Enterprise plans (depending on the meeting organizer’s plan). Get tl;dv’s terms confirmed before client use: they forbid copying or storing a significant part of the content.',
  },
};
