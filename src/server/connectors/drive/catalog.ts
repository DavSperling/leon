import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const driveCatalog: CatalogEntry = {
  id: 'drive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Google vous demande d’autoriser « Leon » à voir vos fichiers Drive. L’appli n’étant pas encore validée par Google, un écran d’avertissement s’affiche d’abord : cliquez sur « Paramètres avancés », puis sur « Accéder à Leon (non sécurisé) ». Leon ne fait que lire les documents, présentations et feuilles de calcul Google, les PDF, les fichiers Word, Excel et PowerPoint, et les fichiers texte ; il ne modifie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des fichiers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les images et les PDF scannés ne sont pas lus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Google asks you to allow “Leon” to see your Drive files. Google hasn’t verified the app yet, so a warning screen comes first: click “Advanced”, then “Go to Leon (unsafe)”. Leon only reads Google documents, presentations, and spreadsheets, PDFs, Word, Excel, and PowerPoint files, and text files; it changes nothing.',
    warning:
      'The text of files can be read, like a conversation, by you and, on the Leon website, by the managers above you. Images and scanned PDFs are not read.',
  },
};
