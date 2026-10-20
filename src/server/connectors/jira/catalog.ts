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
    'Atlassian vous demande d’autoriser Leon à lire vos tickets, leurs commentaires et les profils de votre site Jira (lecture seule), et de choisir le site si votre compte en a plusieurs. Leon ne peut rien modifier.',
  docsUrl:
    'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  triedForReal: false,
};
