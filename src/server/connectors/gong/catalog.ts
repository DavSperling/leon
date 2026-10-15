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
    { name: 'accessKey', label: 'Clé d’accès', kind: 'text' },
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
};
