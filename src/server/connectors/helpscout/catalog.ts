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
};
