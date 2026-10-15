import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const linearCatalog: CatalogEntry = {
  id: 'linear',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API personnelle',
      kind: 'secret',
      placeholder: 'lin_api_…',
      help: 'La clé donne accès à ce que votre compte voit dans Linear. Choisissez l’accès en lecture seule.',
    },
  ],
  keyHelp: 'Dans Linear : Réglages › Compte › Sécurité et accès › Clés d’API personnelles.',
  docsUrl: 'https://linear.app/docs/api-and-webhooks',
  triedForReal: false,
};
