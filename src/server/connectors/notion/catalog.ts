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
    'Notion vous fait choisir les pages à partager avec Leon : seules celles-là sont lues, avec leurs commentaires. Leon n’y crée une page que quand vous le confirmez d’un clic dans une discussion.',
  docsUrl: 'https://developers.notion.com/guides/get-started/authorization',
  triedForReal: false,
  warning:
    'Seules les pages partagées avec la connexion sont lues, avec leurs commentaires non résolus.',
  en: {
    fields: {
      token: {
        label: 'Internal integration secret',
        help: 'In the integration, check Read content, Read comments, and Read user information, including email addresses.',
      },
    },
    keyHelp:
      'In Notion, as workspace owner: developer portal (app.notion.com/developers/connections) › new internal connection › Configuration tab, to copy the secret; then, on each page you want, … menu › Add connections.',
    oauthHelp:
      'Notion has you choose the pages to share with Leon: only those are read, with their comments. Leon creates a page there only when you confirm it with a click in a discussion.',
    warning: 'Only pages shared with the connection are read, with their unresolved comments.',
  },
};
