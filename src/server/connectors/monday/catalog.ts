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
    'monday.com vous demande d’autoriser Leon sur vos tableaux. Leon lit les tableaux, les éléments, les mises à jour et votre profil, avec vos propres droits : il ne voit que les tableaux que vous voyez. L’accès permet aussi d’écrire ; Leon ne s’en sert pas encore.',
  docsUrl: 'https://developer.monday.com/api-reference/docs/authentication',
  triedForReal: false,
  warning:
    'Conditions d’utilisation de monday.com : l’API est réservée à un usage interne. À faire confirmer par écrit avant tout client.',
  en: {
    fields: {
      token: {
        label: 'Personal API token',
        help: 'The token carries your permissions in monday.com: Leon reads the boards you can see. Viewers and guests don’t have a token.',
      },
    },
    keyHelp:
      'In monday.com: profile picture › Developers › API token › Show (an admin can also find it under Administration › Connections › Personal API token).',
    oauthHelp:
      'monday.com asks you to authorize Leon on your boards. Leon reads boards, items, updates, and your profile, with your own permissions: it only sees the boards you see. The access also allows writing; Leon doesn’t use it yet.',
    warning:
      'monday.com terms of use: the API is reserved for internal use. Get this confirmed in writing before any client.',
  },
};
