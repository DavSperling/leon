import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const mondayCatalog: CatalogEntry = {
  id: 'monday',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’API personnel',
      kind: 'secret',
      help: 'Le jeton reprend vos droits dans monday.com : Leon lit les tableaux que vous voyez. Les observateurs et les invités n’ont pas de jeton.',
    },
  ],
  keyHelp:
    'Dans monday.com : photo de profil › Développeurs › Jeton d’API › Afficher (un administrateur le trouve aussi dans Administration › Connexions › Jeton d’API personnel).',
  oauthHelp:
    'monday.com vous demande « Autoriser Leon à lire vos tableaux ? ». Leon ne demande que la lecture (tableaux, éléments, mises à jour et votre profil), avec vos propres droits : il ne voit que les tableaux que vous voyez.',
  docsUrl: 'https://developer.monday.com/api-reference/docs/authentication',
  triedForReal: false,
  warning:
    'Conditions d’utilisation de monday.com : l’API est réservée à un usage interne. À faire confirmer par écrit avant tout client.',
};
