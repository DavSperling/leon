import type { CatalogEntry } from '../types';

export const confluenceCatalog: CatalogEntry = {
  id: 'confluence',
  fields: [
    {
      name: 'site',
      label: 'Site Atlassian',
      kind: 'text',
      placeholder: 'acme',
      help: 'La partie avant .atlassian.net dans l’adresse de votre Confluence (acme pour acme.atlassian.net). Avec le bouton, facultatif : utile si votre compte a plusieurs sites Atlassian et que vous voulez choisir celui à lire.',
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
  oauthHelp:
    'Atlassian vous fait choisir votre site Confluence. Leon lit les pages et leurs commentaires ; l’accès permet aussi d’écrire, Leon ne s’en sert pas encore.',
  docsUrl:
    'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  triedForReal: false,
  warning:
    'Pages et commentaires de pied de page lus avec les droits du compte. Les commentaires en ligne ne sont pas lus. Atlassian fait expirer les jetons (un an par défaut) : en cas d’erreur, créez-en un nouveau.',
  en: {
    fields: {
      site: {
        label: 'Atlassian site',
        help: 'The part before .atlassian.net in your Confluence URL (acme for acme.atlassian.net). With the button, optional: useful if your account has several Atlassian sites and you want to choose the one to read.',
      },
      email: { label: 'Atlassian account email address' },
      apiToken: {
        label: 'API token',
        help: 'A token created without scopes: a token with scopes will be rejected.',
      },
    },
    keyHelp:
      'At id.atlassian.com › Security › API tokens: create an API token (without scopes), then copy it; Leon reads what this account can read.',
    oauthHelp:
      'Atlassian has you choose your Confluence site. Leon reads pages and their comments; the access also allows writing, but Leon doesn’t use it yet.',
    warning:
      'Pages and footer comments are read with the account’s permissions. Inline comments are not read. Atlassian expires tokens (after one year by default): if you get an error, create a new one.',
  },
};
