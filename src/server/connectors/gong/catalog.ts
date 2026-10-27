import type { CatalogEntry } from '../types';

export const gongCatalog: CatalogEntry = {
  id: 'gong',
  fields: [
    {
      name: 'baseUrlHost',
      label: 'Sous-domaine de l’API',
      kind: 'text',
      placeholder: 'us-12345',
      help: 'La partie avant « .api.gong.io » dans l’adresse de base affichée sur la page API de Gong.',
    },
    {
      name: 'accessKey',
      label: 'Clé d’accès',
      kind: 'secret',
      help: 'Une clé remplacée a une nouvelle clé d’accès : elle se saisit aussi.',
    },
    {
      name: 'accessKeySecret',
      label: 'Secret de la clé d’accès',
      kind: 'secret',
      help: 'La clé doit permettre de lire les appels et leurs transcriptions.',
    },
  ],
  keyHelp:
    'Dans Gong : Centre d’administration › Paramètres › API (sous Écosystème), puis « Obtenir une clé d’API » ; seul un administrateur technique peut la créer, et le secret ne s’affiche qu’une fois.',
  docsUrl: 'https://help.gong.io/docs/receive-access-to-the-api',
  triedForReal: false,
  en: {
    fields: {
      baseUrlHost: {
        label: 'API subdomain',
        help: 'The part before “.api.gong.io” in the base URL shown on Gong’s API page.',
      },
      accessKey: {
        label: 'Access key',
        help: 'A replaced key comes with a new access key: enter that one too.',
      },
      accessKeySecret: {
        label: 'Access key secret',
        help: 'The key must allow reading calls and their transcripts.',
      },
    },
    keyHelp:
      'In Gong: Admin center › Settings › Ecosystem › API, then “Get API Key”; only a technical administrator can create it, and the secret is shown only once.',
  },
};
