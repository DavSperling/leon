import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const driveCatalog: CatalogEntry = {
  id: 'drive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Google vous demande d’autoriser « leonmemory.com » (Leon) à accéder à tout votre Drive : voir, créer, modifier, partager et supprimer vos fichiers. L’appli n’étant pas encore validée par Google, un écran d’avertissement s’affiche d’abord : cliquez sur « Paramètres avancés », puis sur « Accéder à leonmemory.com (non sécurisé) ». Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il ne fait que lire les documents, présentations et feuilles de calcul Google, les PDF, les fichiers Word, Excel et PowerPoint, et les fichiers texte, et ne modifie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des fichiers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les images et les PDF scannés ne sont pas lus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Google asks you to allow “leonmemory.com” (Leon) full access to Drive: see, create, edit, share, and delete your files. Google hasn’t verified the app yet, so a warning screen comes first: click “Advanced”, then “Go to leonmemory.com (unsafe)”. Leon asks for these permissions up front so it won’t need to ask you again later; today it only reads Google documents, presentations, and spreadsheets, PDFs, Word, Excel, and PowerPoint files, and text files, and changes nothing.',
    warning:
      'The text of files can be read, like a conversation, by you and, on the Leon website, by the managers above you. Images and scanned PDFs are not read.',
  },
};
