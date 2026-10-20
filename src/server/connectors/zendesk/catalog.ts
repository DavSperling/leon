import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const zendeskCatalog: CatalogEntry = {
  id: 'zendesk',
  fields: [
    {
      name: 'subdomain',
      label: 'Sous-domaine Zendesk',
      kind: 'text',
      placeholder: 'acme',
      help: 'Le début de l’adresse de votre Zendesk : acme pour acme.zendesk.com.',
    },
    {
      name: 'email',
      label: 'E-mail de l’administrateur',
      kind: 'text',
      placeholder: 'prenom@entreprise.fr',
      help: 'L’adresse du compte administrateur qui a créé le jeton.',
    },
    {
      name: 'apiToken',
      label: 'Jeton d’API Zendesk',
      kind: 'secret',
      help: 'Le jeton agit au nom de cet administrateur ; Leon ne fait que lire. Il lit tous les tickets, notes internes comprises. Zendesk le décrit comme déconseillé au profit d’OAuth, mais il fonctionne toujours.',
    },
  ],
  keyHelp:
    'Dans le Centre d’administration Zendesk : Applications et intégrations › API › API Zendesk › Ajouter un jeton d’API (l’accès par jeton doit être activé).',
  docsUrl: 'https://developer.zendesk.com/api-reference/introduction/security-and-auth/',
  triedForReal: false,
  warning:
    'Il faut le jeton d’un administrateur : Zendesk réserve l’export des tickets aux administrateurs.',
};
