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
    'Notion vous demande de choisir l’espace, puis les pages à partager avec Leon : seules celles-là seront lues, avec leurs commentaires non résolus. Pour en partager d’autres plus tard, utilisez Reconnecter.',
  docsUrl: 'https://developers.notion.com/guides/get-started/authorization',
  triedForReal: false,
  warning:
    'Seules les pages partagées avec la connexion sont lues, avec leurs commentaires non résolus.',
};
