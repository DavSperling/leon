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
  docsUrl: 'https://developer.monday.com/api-reference/docs/authentication',
  triedForReal: false,
  warning:
    'Conditions d’utilisation de monday.com : l’API est réservée à un usage interne. À faire confirmer par écrit avant tout client.',
};
