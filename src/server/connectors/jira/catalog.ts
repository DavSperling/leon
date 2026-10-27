import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const jiraCatalog: CatalogEntry = {
  id: 'jira',
  fields: [
    {
      name: 'site',
      label: 'Site Atlassian',
      kind: 'text',
      placeholder: 'acme',
      help: 'Le début de l’adresse de votre Jira : acme pour acme.atlassian.net. Avec le bouton, facultatif : utile si votre compte a plusieurs sites Atlassian et que vous voulez choisir celui à lire.',
    },
    {
      name: 'email',
      label: 'E-mail du compte Atlassian',
      kind: 'text',
      placeholder: 'prenom@entreprise.fr',
    },
    {
      name: 'apiToken',
      label: 'Jeton d’API Atlassian',
      kind: 'secret',
      help: 'Créez un jeton d’API ordinaire, pas un jeton « avec portées » : celui-ci ne marche pas avec l’adresse du site. Leon lit ce que votre compte voit dans Jira. Le jeton expire au bout d’un an au plus.',
    },
  ],
  keyHelp: 'Sur id.atlassian.com : Sécurité › Jetons d’API › Créer un jeton d’API.',
  oauthHelp:
    'Atlassian vous fait choisir votre site Jira. Leon lit les tickets et leurs commentaires ; l’accès permet aussi d’écrire, Leon ne s’en sert pas encore.',
  docsUrl:
    'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  triedForReal: false,
  en: {
    fields: {
      site: {
        label: 'Atlassian site',
        help: 'The start of your Jira URL: acme for acme.atlassian.net. With the button, optional: useful if your account has several Atlassian sites and you want to choose the one to read.',
      },
      email: { label: 'Atlassian account email', placeholder: 'first.last@company.com' },
      apiToken: {
        label: 'Atlassian API token',
        help: 'Create a regular API token, not a “scoped” one: that kind doesn’t work with the site URL. Leon reads what your account sees in Jira. The token expires after one year at most.',
      },
    },
    keyHelp: 'At id.atlassian.com: Security › API tokens › Create API token.',
    oauthHelp:
      'Atlassian has you choose your Jira site. Leon reads issues and their comments; the access also allows writing, but Leon doesn’t use it yet.',
  },
};
