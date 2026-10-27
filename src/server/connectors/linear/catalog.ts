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
      help: 'La clé donne accès à ce que votre compte voit dans Linear ; Leon n’en lit que les équipes publiques. Choisissez l’accès en lecture seule.',
    },
  ],
  keyHelp: 'Dans Linear : Réglages › Compte › Sécurité et accès › Clés d’API personnelles.',
  oauthHelp:
    'Linear vous demande d’autoriser Leon sur votre espace. Leon lit les tickets des équipes publiques, jamais ceux des équipes privées ; l’accès permet aussi d’écrire, Leon ne s’en sert pas encore.',
  docsUrl: 'https://linear.app/docs/api-and-webhooks',
  triedForReal: false,
};
