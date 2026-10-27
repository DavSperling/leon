import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const helpscoutCatalog: CatalogEntry = {
  id: 'helpscout',
  fields: [
    {
      name: 'appId',
      label: 'Identifiant de l’appli',
      kind: 'text',
      help: 'L’identifiant (App ID) affiché sur la fiche de l’appli que vous avez créée.',
    },
    {
      name: 'appSecret',
      label: 'Secret de l’appli',
      kind: 'secret',
      help: 'Le secret (App Secret) de la même appli. Leon ne fait que lire les conversations.',
    },
  ],
  keyHelp:
    'Dans Help Scout : Your Profile › My apps › Create My App (une adresse de redirection quelconque suffit, par exemple https://example.com), puis copiez l’identifiant (App ID) et le secret (App Secret) de l’appli.',
  oauthHelp:
    'Help Scout vous demande d’autoriser Leon. Son accès suit vos droits dans Help Scout (l’API n’a pas de droits séparés), mais Leon ne fait que lire les conversations. Il faut être un utilisateur actif du compte.',
  docsUrl: 'https://developer.helpscout.com/mailbox-api/overview/authentication/',
  triedForReal: false,
  warning:
    'Plan Standard ou supérieur requis (pas d’API en gratuit). L’appli doit être créée par un utilisateur actif du compte, qui doit avoir accès aux boîtes à lire.',
  en: {
    fields: {
      appId: {
        label: 'App ID',
        help: 'The ID (App ID) shown on the page of the app you created.',
      },
      appSecret: {
        label: 'App secret',
        help: 'The secret (App Secret) of the same app. Leon only reads conversations.',
      },
    },
    keyHelp:
      'In Help Scout: Your Profile › My apps › Create My App (any redirect URL will do, for example https://example.com), then copy the app’s ID (App ID) and secret (App Secret).',
    oauthHelp:
      'Help Scout asks you to authorize Leon. Its access follows your permissions in Help Scout (the API has no separate permissions), but Leon only reads conversations. You must be an active user of the account.',
    warning:
      'Standard plan or higher required (no API on the free plan). The app must be created by an active user of the account, who must have access to the mailboxes to read.',
  },
};
