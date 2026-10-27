import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const missiveCatalog: CatalogEntry = {
  id: 'missive',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’API personnel',
      kind: 'secret',
      help: 'Leon lit les conversations des équipes de votre compte, avec leurs messages et leurs commentaires, mais pas votre courrier personnel. Missive limite le débit à une requête par seconde en continu : un premier passage sur beaucoup de conversations prend plusieurs minutes.',
    },
  ],
  keyHelp: 'Dans Missive : Préférences › onglet API › « Créer un nouveau jeton ».',
  docsUrl: 'https://missiveapp.com/docs/developers/rest-api',
  triedForReal: false,
  warning:
    'Forfait Productive requis : Missive ne permet de créer un jeton d’API qu’aux organisations qui l’ont. Tout ce que la boîte « Tout » de vos équipes contient devient visible de toute l’équipe dans Leon ; une conversation personnelle que vous avez partagée avec une équipe en fait partie.',
  en: {
    fields: {
      token: {
        label: 'Personal API token',
        help: 'Leon reads the conversations of your account’s teams, with their messages and comments, but not your personal email. Missive limits the rate to one request per second on a sustained basis: a first sync over many conversations takes several minutes.',
      },
    },
    keyHelp: 'In Missive: Preferences › API tab › “Create a new token”.',
    warning:
      'Productive plan required: Missive only lets organizations that have it create an API token. Everything in your teams’ “All” mailbox becomes visible to the whole team in Leon; a personal conversation you’ve shared with a team is part of it.',
  },
};
