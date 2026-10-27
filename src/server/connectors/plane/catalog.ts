import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const planeCatalog: CatalogEntry = {
  id: 'plane',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      placeholder: 'plane_api_…',
      help: 'La clé ne s’affiche qu’une fois, à sa création. Elle a les droits de son propriétaire : créez-la avec un compte qui ne voit que les projets voulus.',
    },
    {
      name: 'workspace',
      label: 'Espace de travail',
      kind: 'text',
      placeholder: 'mon-equipe',
      help: 'L’identifiant qui figure dans l’adresse de Plane : dans app.plane.so/mon-equipe/projects/, c’est mon-equipe.',
    },
  ],
  keyHelp:
    'Dans Plane : votre profil › Paramètres du profil › Jetons d’accès personnels › Ajouter un jeton d’accès personnel (donnez-lui un titre et, si vous voulez, une date d’expiration).',
  docsUrl: 'https://developers.plane.so/api-reference/v2/authentication',
  triedForReal: false,
  warning:
    'Seul Plane en ligne (app.plane.so) est pris en charge, pas une installation de Plane hébergée par vous.',
  en: {
    fields: {
      apiKey: {
        label: 'API key',
        help: 'The key is shown only once, when it is created. It has its owner’s permissions: create it with an account that only sees the projects you want.',
      },
      workspace: {
        label: 'Workspace',
        placeholder: 'my-team',
        help: 'The identifier in your Plane URL: in app.plane.so/my-team/projects/, it’s my-team.',
      },
    },
    keyHelp:
      'In Plane: your profile › Profile settings › Personal access tokens › Add personal access token (give it a title and, if you like, an expiration date).',
    warning:
      'Only Plane Cloud (app.plane.so) is supported, not a Plane installation you host yourself.',
  },
};
