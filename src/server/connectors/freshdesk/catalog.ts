import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const freshdeskCatalog: CatalogEntry = {
  id: 'freshdesk',
  fields: [
    {
      name: 'domain',
      label: 'Domaine Freshdesk',
      kind: 'text',
      placeholder: 'acme',
      help: 'Le début de l’adresse de votre Freshdesk : acme pour acme.freshdesk.com.',
    },
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      help: 'Leon ne fait que lire ce que le compte de la clé voit : prenez celle d’un agent qui voit les tickets de l’équipe. Une clé réinitialisée coupe aussi les autres outils qui l’utilisent.',
    },
  ],
  keyHelp:
    'Dans Freshdesk : votre photo de profil en haut à droite › Paramètres du profil, puis « Afficher la clé d’API » (il faut valider un captcha).',
  docsUrl:
    'https://support.freshdesk.com/support/solutions/articles/215517-how-to-find-your-api-key',
  triedForReal: false,
  warning: 'L’API de Freshdesk est fermée au plan gratuit : il faut un plan payant ou un essai.',
  en: {
    fields: {
      domain: {
        label: 'Freshdesk domain',
        help: 'The start of your Freshdesk URL: acme for acme.freshdesk.com.',
      },
      apiKey: {
        label: 'API key',
        help: 'Leon only reads what the key’s account sees: use the key of an agent who sees the team’s tickets. A reset key also cuts off the other tools that use it.',
      },
    },
    keyHelp:
      'In Freshdesk: your profile picture at the top right › Profile settings, then “View API Key” (you have to solve a captcha).',
    warning: 'Freshdesk’s API is closed to the free plan: a paid plan or a trial is required.',
  },
};
