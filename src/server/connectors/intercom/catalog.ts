import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const intercomCatalog: CatalogEntry = {
  id: 'intercom',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès',
      kind: 'secret',
      help: 'Leon ne fait que lire. L’appli doit avoir la permission « Read conversations » ; sans elle, Intercom refuse la lecture des conversations.',
    },
    {
      name: 'region',
      label: 'Région de l’espace',
      kind: 'select',
      options: [
        { value: 'api.intercom.io', label: 'États-Unis (api.intercom.io)' },
        { value: 'api.eu.intercom.io', label: 'Europe (api.eu.intercom.io)' },
        { value: 'api.au.intercom.io', label: 'Australie (api.au.intercom.io)' },
      ],
      help: 'Celle où Intercom héberge les données de l’espace : app.intercom.com (États-Unis), app.eu.intercom.com (Europe) ou app.au.intercom.com (Australie) dans l’adresse de la boîte de réception.',
    },
  ],
  keyHelp:
    'Dans Intercom : Developer Hub › Your apps › New app (installée dans votre espace), puis la page Authentication de l’appli affiche le jeton d’accès à copier.',
  docsUrl: 'https://developers.intercom.com/docs/build-an-integration/getting-started',
  triedForReal: false,
  warning:
    'Le jeton agit au nom de l’appli : il lit toutes les conversations de l’espace, notes internes comprises. Intercom ne donne pas de lien vers une conversation : la source n’en porte pas.',
};
