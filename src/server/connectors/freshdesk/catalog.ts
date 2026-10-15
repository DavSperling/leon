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
};
