import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const onedriveCatalog: CatalogEntry = {
  id: 'onedrive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à lire votre OneDrive et les sites SharePoint auxquels vous avez accès. Leon ne fait que lire les PDF, les fichiers Word, Excel et PowerPoint, et les fichiers texte ; il ne modifie rien. L’administrateur Microsoft de votre entreprise doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Le texte des fichiers reste privé, comme une conversation : vous seul le voyez. Les images et les PDF scannés ne sont pas lus, ni les fichiers de plus de 10 Mo.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to authorize Leon to read your OneDrive and the SharePoint sites you can access. Leon only reads PDFs, Word, Excel, and PowerPoint files, and text files; it changes nothing. Your company’s Microsoft admin must first have approved Leon, once for the whole company: without that, Microsoft refuses the connection.',
    warning:
      'The text of files stays private, like a conversation: only you can see it. Images, scanned PDFs, and files over 10 MB are not read.',
  },
};
