import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const gitlabCatalog: CatalogEntry = {
  id: 'gitlab',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès personnel',
      kind: 'secret',
      placeholder: 'glpat-…',
      help: 'Cochez seulement la portée read_api : le jeton ne donne alors que la lecture.',
    },
    {
      name: 'projects',
      label: 'Projets',
      kind: 'list',
      placeholder: 'acme/leon',
      help: 'Un projet par ligne, au format groupe/projet ou groupe/sous-groupe/projet (20 au plus). Ses tickets et ses demandes de fusion sont lus, avec leurs commentaires.',
    },
  ],
  keyHelp:
    'Sur gitlab.com : votre avatar › Modifier le profil › Accès › Jetons d’accès personnels › Générer un jeton (jeton classique), avec la portée read_api. Le jeton expire au plus tard dans un an : il faudra alors le remplacer.',
  oauthHelp:
    'Leon lit les tickets et les demandes de fusion des 20 projets les plus actifs dont vous êtes membre. L’accès permet aussi d’écrire ; Leon ne s’en sert pas encore.',
  docsUrl: 'https://docs.gitlab.com/user/profile/personal_access_tokens/',
  triedForReal: false,
  warning: 'Seul gitlab.com est pris en charge, pas une installation de GitLab hébergée par vous.',
  en: {
    fields: {
      token: {
        label: 'Personal access token',
        help: 'Check only the read_api scope: the token then gives read-only access.',
      },
      projects: {
        label: 'Projects',
        help: 'One project per line, as group/project or group/subgroup/project (20 max). Its issues and merge requests are read, with their comments.',
      },
    },
    keyHelp:
      'On gitlab.com: your avatar › Edit profile › Access › Personal access tokens › Generate token (classic token), with the read_api scope. The token expires after one year at most: you will then have to replace it.',
    oauthHelp:
      'Leon reads the issues and merge requests of the 20 most active projects you are a member of. The access also allows writing; Leon doesn’t use it yet.',
    warning: 'Only gitlab.com is supported, not a GitLab installation you host yourself.',
  },
};
