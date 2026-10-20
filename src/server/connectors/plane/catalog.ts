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
};
