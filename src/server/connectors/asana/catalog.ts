import type { CatalogEntry } from '../types';

export const asanaCatalog: CatalogEntry = {
  id: 'asana',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès personnel',
      kind: 'secret',
      help: 'Le jeton lit tout ce que votre compte Asana voit : les projets privés dont vous êtes membre en font partie.',
    },
    {
      name: 'workspace',
      label: 'Espace de travail (facultatif)',
      kind: 'text',
      placeholder: 'Acme',
      help: 'Le nom ou l’identifiant de l’espace à lire. Laissé vide : le premier espace de votre compte.',
    },
  ],
  keyHelp:
    'Sur app.asana.com/0/my-apps (console des développeurs d’Asana) : Jetons d’accès personnels › Créer un jeton, puis donnez-lui un nom.',
  oauthHelp:
    'Asana vous demande d’autoriser Leon à lire vos tâches, vos projets, leurs commentaires et votre profil. L’accès permet aussi d’écrire des tâches et des commentaires ; Leon ne s’en sert pas encore. Leon ne lit que ce que votre compte Asana voit.',
  docsUrl: 'https://developers.asana.com/docs/personal-access-token',
  triedForReal: false,
};
