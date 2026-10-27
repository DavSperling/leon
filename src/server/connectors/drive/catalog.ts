import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const driveCatalog: CatalogEntry = {
  id: 'drive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'La connexion passe par Pipedream, le service qui garde l’accès pour Leon : Google vous demande d’autoriser « Pipedream » à voir, modifier et supprimer vos fichiers Drive. Leon ne fait que lire les documents, présentations et feuilles de calcul Google, les PDF, les fichiers Word, Excel et PowerPoint, et les fichiers texte ; il ne modifie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des fichiers reste privé, comme une conversation : vous seul le voyez. Les images et les PDF scannés ne sont pas lus. L’accès est gardé par Pipedream, hébergé aux États-Unis.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'The connection goes through Pipedream, the service that holds the access for Leon: Google asks you to authorize “Pipedream” to view, edit, and delete your Drive files. Leon only reads Google documents, presentations, and spreadsheets, PDFs, Word, Excel, and PowerPoint files, and text files; it changes nothing.',
    warning:
      'The text of files stays private, like a conversation: only you can see it. Images and scanned PDFs are not read. The access is held by Pipedream, hosted in the United States.',
  },
};
