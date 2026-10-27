import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const folkCatalog: CatalogEntry = {
  id: 'folk',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      help: 'La clé agit au nom de votre compte folk ; Leon ne fait que lire. Les notes publiques des contacts et des entreprises sont lues ; les notes privées ne le sont pas.',
    },
  ],
  keyHelp: 'Dans folk : réglages de l’espace › API › créez une clé d’API, puis copiez-la.',
  docsUrl: 'https://developer.folk.app/api-reference/authentication',
  triedForReal: false,
  warning:
    'API récente. Seules les notes sont lues : les interactions (appels, e-mails, rendez-vous) sont encore en bêta chez folk et ne sont pas reprises.',
  en: {
    fields: {
      apiKey: {
        label: 'API key',
        help: 'The key acts on behalf of your folk account; Leon only reads. Public notes on contacts and companies are read; private notes are not.',
      },
    },
    keyHelp: 'In folk: workspace settings › API › create an API key, then copy it.',
    warning:
      'Recent API. Only notes are read: interactions (calls, emails, meetings) are still in beta at folk and are not imported.',
  },
};
