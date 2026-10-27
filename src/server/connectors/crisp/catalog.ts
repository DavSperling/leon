import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const crispCatalog: CatalogEntry = {
  id: 'crisp',
  fields: [
    {
      name: 'websiteId',
      label: 'Identifiant du site',
      kind: 'text',
      placeholder: '5d3f2a10-7b44-4c1e-9a30-0b1e6c2d4f01',
      help: 'Dans Crisp : Settings › Workspace Settings › Setup Instructions (le « Website ID »).',
    },
    {
      name: 'identifier',
      label: 'Identifiant du jeton',
      kind: 'secret',
      help: 'Crisp ne l’affiche qu’une fois, à la création du jeton : copiez aussi la clé.',
    },
    {
      name: 'key',
      label: 'Clé du jeton',
      kind: 'secret',
      help: 'Leon ne fait que lire : les conversations du site, avec leurs messages et leurs notes internes.',
    },
  ],
  keyHelp:
    'Dans Crisp : Settings › Workspace Settings › Advanced configuration › API Token › Generate Token (réservé au propriétaire de l’espace de travail).',
  docsUrl: 'https://docs.crisp.chat/guides/rest-api/authentication/website-token/',
  triedForReal: false,
  warning:
    'Jeton de site seulement (un jeton de plugin n’est pas pris en charge). Crisp limite ce jeton à 10 000 requêtes par jour : un premier passage sur une longue période peut en consommer une bonne part.',
  en: {
    fields: {
      websiteId: {
        label: 'Website ID',
        help: 'In Crisp: Settings › Workspace Settings › Setup Instructions (the “Website ID”).',
      },
      identifier: {
        label: 'Token identifier',
        help: 'Crisp shows it only once, when the token is created: copy the key too.',
      },
      key: {
        label: 'Token key',
        help: 'Leon only reads: the website’s conversations, with their messages and internal notes.',
      },
    },
    keyHelp:
      'In Crisp: Settings › Workspace Settings › Advanced configuration › API Token › Generate Token (workspace owner only).',
    warning:
      'Website token only (a plugin token is not supported). Crisp limits this token to 10,000 requests per day: a first sync over a long period can use a good share of them.',
  },
};
