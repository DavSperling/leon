import type { CatalogEntry } from '../types';

export const granolaCatalog: CatalogEntry = {
  id: 'granola',
  fields: [{ name: 'apiKey', label: 'Clé d’API', kind: 'secret', placeholder: 'grn_…' }],
  keyHelp:
    'Dans l’application Granola : Settings › Connectors › API keys › Create new key, avec les accès « Personal notes » et « Public notes ».',
  docsUrl: 'https://docs.granola.ai/introduction',
  triedForReal: false,
  warning:
    'Plan Business ou Enterprise requis. Seules les notes qui ont un résumé et une transcription sont lues, et seulement celles que la clé peut voir.',
  en: {
    fields: { apiKey: { label: 'API key' } },
    keyHelp:
      'In the Granola app: Settings › Connectors › API keys › Create new key, with “Personal notes” and “Public notes” access.',
    warning:
      'Business or Enterprise plan required. Only notes that have a summary and a transcript are read, and only those the key can see.',
  },
};
