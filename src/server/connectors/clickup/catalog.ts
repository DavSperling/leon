import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const clickupCatalog: CatalogEntry = {
  id: 'clickup',
  fields: [
    {
      name: 'token',
      label: 'Jeton personnel',
      kind: 'secret',
      placeholder: 'pk_…',
      help: 'Le jeton agit au nom de votre compte ; Leon ne fait que lire. Il donne accès à tous vos espaces de travail ClickUp : les tâches (fermées comprises) et leurs commentaires sont lus.',
    },
  ],
  keyHelp:
    'Dans ClickUp : cliquez sur votre avatar › Settings › Apps › API Token › Generate, puis copiez le jeton (il commence par pk_ et n’expire pas).',
  oauthHelp:
    'ClickUp vous demande de choisir les espaces de travail que Leon peut ouvrir, puis d’autoriser l’accès. ClickUp ne propose pas de droit en lecture seule : l’autorisation donne les mêmes droits que votre compte sur ces espaces, mais Leon ne fait que lire les tâches et leurs commentaires.',
  docsUrl: 'https://developer.clickup.com/docs/authentication',
  triedForReal: false,
  warning:
    'À faire confirmer par écrit avant tout client : les conditions de ClickUp interdisent d’entraîner des modèles sur les données des utilisateurs sans leur accord exprès.',
  en: {
    fields: {
      token: {
        label: 'Personal token',
        help: 'The token acts on behalf of your account; Leon only reads. It gives access to all your ClickUp workspaces: tasks (closed ones included) and their comments are read.',
      },
    },
    keyHelp:
      'In ClickUp: click your avatar › Settings › Apps › API Token › Generate, then copy the token (it starts with pk_ and doesn’t expire).',
    oauthHelp:
      'ClickUp asks you to choose the workspaces Leon can open, then to authorize the access. ClickUp has no read-only permission: the authorization gives the same rights as your account on those workspaces, but Leon only reads tasks and their comments.',
    warning:
      'Get this confirmed in writing before any client use: ClickUp’s terms forbid training models on users’ data without their express consent.',
  },
};
