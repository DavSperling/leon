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
};
