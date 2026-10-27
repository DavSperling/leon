import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const attioCatalog: CatalogEntry = {
  id: 'attio',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès',
      kind: 'secret',
      help: 'Donnez au jeton la lecture des notes (note:read), des commentaires (comment:read), des membres (user_management:read) et des fiches (object_configuration:read, record_permission:read). Leon ne fait que lire. Les notes modifiées après leur création ne sont pas relues.',
    },
  ],
  keyHelp:
    'Dans Attio, en tant qu’administrateur : menu à côté du nom de l’espace › Workspace settings › onglet Developers › + New access token, puis réglez les droits en lecture et copiez le jeton.',
  oauthHelp:
    'Attio vous demande d’autoriser Leon à lire les notes, les commentaires, les membres et les fiches de votre espace. L’accès permet aussi d’écrire des notes et des commentaires ; Leon ne s’en sert pas encore. Seul un administrateur de l’espace peut donner cette autorisation. Tant que l’appli n’est pas validée par Attio, un avertissement « pas encore approuvée » s’affiche : vous pouvez continuer.',
  docsUrl: 'https://docs.attio.com/rest-api/guides/authentication',
  triedForReal: false,
  warning: 'Revue d’Attio nécessaire au-delà de 25 espaces.',
  en: {
    fields: {
      token: {
        label: 'Access token',
        help: 'Give the token read access to notes (note:read), comments (comment:read), members (user_management:read), and records (object_configuration:read, record_permission:read). Leon only reads. Notes edited after they were created are not read again.',
      },
    },
    keyHelp:
      'In Attio, as an admin: menu next to the workspace name › Workspace settings › Developers tab › + New access token, then set the read permissions and copy the token.',
    oauthHelp:
      'Attio asks you to authorize Leon to read your workspace’s notes, comments, members, and records. The access also allows writing notes and comments; Leon doesn’t use it yet. Only a workspace admin can give this authorization. Until the app is approved by Attio, a “not yet approved” warning is shown: you can continue.',
    warning: 'Attio review required beyond 25 workspaces.',
  },
};
