import type { CatalogEntry } from '../types';

export const confluenceCatalog: CatalogEntry = {
  id: 'confluence',
  fields: [
    {
      name: 'site',
      label: 'Site Atlassian',
      kind: 'text',
      placeholder: 'acme',
      help: 'La partie avant .atlassian.net dans l’adresse de votre Confluence (acme pour acme.atlassian.net).',
    },
    {
      name: 'email',
      label: 'Adresse e-mail du compte Atlassian',
      kind: 'text',
      placeholder: 'marie@acme.com',
    },
    {
      name: 'apiToken',
      label: 'Jeton d’API',
      kind: 'secret',
      help: 'Un jeton créé sans portées : un jeton avec portées sera refusé.',
    },
  ],
  keyHelp:
    'Sur id.atlassian.com › Sécurité › Jetons d’API : créer un jeton d’API (sans portées), puis le copier ; Leon lit ce que ce compte peut lire.',
  docsUrl:
    'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  triedForReal: false,
  warning:
    'Pages et commentaires de pied de page lus avec les droits du compte. Les commentaires en ligne ne sont pas lus. Atlassian fait expirer les jetons (un an par défaut) : en cas d’erreur, créez-en un nouveau.',
};
