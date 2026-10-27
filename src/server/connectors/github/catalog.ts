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
    'Leon lit les tickets et les pull requests des dépôts où vous installez son appli GitHub. L’accès couvre aussi le code et permet d’y écrire (branches, commits, pull requests, fusion) ; Leon ne s’en sert pas encore, chaque action demandera votre accord.',
  docsUrl:
    'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  triedForReal: false,
  en: {
    fields: {
      token: { label: 'Fine-grained access token' },
      repos: {
        label: 'Repositories',
        help: 'One repository per line, as owner/name (20 max). Repository not accessible? An organization may require the token to be approved by an admin.',
      },
    },
    keyHelp:
      'On github.com: Settings › Developer settings › Personal access tokens › Fine-grained tokens; choose the account or organization that owns the repositories as the resource owner, limit access to the repositories you want, and give it read access to Issues, Pull requests, and Metadata.',
    oauthHelp:
      'Leon reads the issues and pull requests of the repositories where you install its GitHub app. The access also covers code and allows writing to them (branches, commits, pull requests, merges); Leon doesn’t use it yet, and every action will ask for your approval.',
  },
};
