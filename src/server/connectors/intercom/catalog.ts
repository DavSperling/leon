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
  en: {
    fields: {
      token: {
        label: 'Access token',
        help: 'Leon only reads. The app must have the “Read conversations” permission; without it, Intercom refuses to let conversations be read.',
      },
      region: {
        label: 'Workspace region',
        options: {
          'api.intercom.io': 'United States (api.intercom.io)',
          'api.eu.intercom.io': 'Europe (api.eu.intercom.io)',
          'api.au.intercom.io': 'Australia (api.au.intercom.io)',
        },
        help: 'The one where Intercom hosts the workspace’s data: app.intercom.com (United States), app.eu.intercom.com (Europe), or app.au.intercom.com (Australia) in the URL of your inbox.',
      },
    },
    keyHelp:
      'In Intercom: Developer Hub › Your apps › New app (installed in your workspace), then the app’s Authentication page shows the access token to copy.',
    warning:
      'The token acts on behalf of the app: it reads all the workspace’s conversations, internal notes included. Intercom doesn’t give a link to a conversation, so the source doesn’t carry one.',
  },
};
