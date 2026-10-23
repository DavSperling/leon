import type { CatalogEntry } from '../types';

export const notionCatalog: CatalogEntry = {
  id: 'notion',
  fields: [
    {
      name: 'token',
      label: 'Secret d’intégration interne',
      kind: 'secret',
      help: 'Dans la connexion, cochez Lire le contenu, Lire les commentaires et Lire les informations des utilisateurs, adresses e-mail comprises.',
    },
  ],
  keyHelp:
    'Dans Notion, en tant que propriétaire de l’espace : portail des développeurs (app.notion.com/developers/connections) › nouvelle connexion interne › onglet Configuration, pour copier le secret ; puis, sur chaque page voulue, menu … › Ajouter des connexions.',
  oauthHelp:
    'Notion vous fait choisir les pages à partager avec Leon : seules celles-là sont lues, avec leurs commentaires. L’accès permet aussi d’y écrire ; Leon ne s’en sert pas encore.',
  docsUrl: 'https://developers.notion.com/guides/get-started/authorization',
  triedForReal: false,
  warning:
    'Seules les pages partagées avec la connexion sont lues, avec leurs commentaires non résolus.',
};
