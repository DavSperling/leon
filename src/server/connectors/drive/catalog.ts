import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const driveCatalog: CatalogEntry = {
  id: 'drive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'La connexion passe par Pipedream, le service qui garde l’accès pour Leon : Google vous demande d’autoriser « Pipedream » à voir, modifier et supprimer vos fichiers Drive. Leon ne fait que lire les documents, présentations et feuilles de calcul Google, et les fichiers texte ; il ne modifie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: false,
  warning:
    'Le texte des fichiers reste privé, comme une conversation : vous seul le voyez. Les PDF, fichiers Word et images ne sont pas lus. L’accès est gardé par Pipedream, hébergé aux États-Unis.',
};
