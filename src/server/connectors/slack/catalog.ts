import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const slackCatalog: CatalogEntry = {
  id: 'slack',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'La connexion passe par Pipedream, le service qui garde l’accès pour Leon : Slack vous demande d’autoriser l’appli de Pipedream dans votre espace. Leon ne lit que les canaux dont vous êtes membre, jamais vos messages directs ; il n’écrit rien.',
  docsUrl: 'https://slack.com/help/articles/360003125231',
  triedForReal: false,
  warning:
    'Copier les messages de Slack pour les indexer va contre ses conditions : à faire confirmer avant de brancher l’espace d’un client. Le texte reste privé : vous seul le voyez.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'The connection goes through Pipedream, the service that holds the access for Leon: Slack asks you to authorize Pipedream’s app in your workspace. Leon only reads the channels you’re a member of, never your direct messages; it writes nothing.',
    warning:
      'Copying Slack messages in order to index them goes against its terms: get this confirmed before connecting a client’s workspace. The text stays private: only you can see it.',
  },
};
