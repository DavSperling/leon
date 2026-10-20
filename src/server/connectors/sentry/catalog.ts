import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const sentryCatalog: CatalogEntry = {
  id: 'sentry',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’intégration interne',
      kind: 'secret',
      help: 'Lecture seule suffit : la portée event:read (problèmes). Leon ne lit ni les traces de pile ni les données des événements.',
    },
    {
      name: 'organization',
      label: 'Organisation',
      kind: 'text',
      placeholder: 'acme',
      help: 'L’identifiant (slug) de l’organisation, visible dans les adresses de Sentry : …/organizations/<identifiant>/.',
    },
    {
      name: 'region',
      label: 'Région des données',
      kind: 'select',
      options: [
        { value: 'sentry.io', label: 'États-Unis (sentry.io)' },
        { value: 'de.sentry.io', label: 'Europe (de.sentry.io)' },
      ],
      help: 'Celle où Sentry stocke les données de l’organisation, indiquée dans ses réglages.',
    },
  ],
  keyHelp:
    'Dans Sentry : Settings › Developer Settings › New Internal Integration, avec la lecture seule (Read) sur les problèmes (Issue & Event) ; le jeton s’affiche à la création et n’expire pas.',
  docsUrl:
    'https://docs.sentry.io/organization/integrations/integration-platform/internal-integration/',
  triedForReal: false,
  warning:
    'À faire lire avant tout client : le §2.3 b des conditions de Sentry interdit d’utiliser le service pour le compte de tiers.',
};
