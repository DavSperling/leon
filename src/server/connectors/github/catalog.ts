import type { CatalogEntry } from '../types';

export const githubCatalog: CatalogEntry = {
  id: 'github',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès à grain fin',
      kind: 'secret',
      placeholder: 'github_pat_…',
    },
    {
      name: 'repos',
      label: 'Dépôts',
      kind: 'list',
      placeholder: 'acme/leon',
      help: 'Un dépôt par ligne, au format propriétaire/nom (20 au plus). Dépôt inaccessible ? Une organisation peut exiger que le jeton soit approuvé par un administrateur.',
    },
  ],
  keyHelp:
    'Sur github.com : Settings › Developer settings › Personal access tokens › Fine-grained tokens ; choisissez comme propriétaire le compte ou l’organisation des dépôts, limitez l’accès aux dépôts voulus et donnez-lui la lecture de Issues, Pull requests et Metadata.',
  oauthHelp:
    'Leon lit actuellement les tickets et les pull requests des dépôts où vous installez son appli GitHub. Il ne peut pas encore lire le code ni effectuer d’actions sur GitHub.',
  docsUrl:
    'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  triedForReal: false,
};
