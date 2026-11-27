import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const onedriveCatalog: CatalogEntry = {
  id: 'onedrive',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à tous les fichiers que vous pouvez ouvrir, dans OneDrive comme dans les sites SharePoint : les lire, les créer, les modifier et les supprimer. Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il ne fait que lire votre OneDrive et les bibliothèques de documents de vos sites (PDF, fichiers Word, Excel et PowerPoint, fichiers texte), et ne modifie ni ne supprime rien. Un compte personnel (outlook.com, hotmail.fr) se branche directement : Leon n’en lit que le OneDrive. Pour un compte d’entreprise, l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Le texte des fichiers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les images et les PDF scannés ne sont pas lus, ni les fichiers de plus de 10 Mo.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon full access to every file you can open, in OneDrive and in SharePoint sites: read, create, edit, and delete. Leon asks for these permissions up front so it won’t need to ask you again later; today it only reads your OneDrive and the document libraries of your sites (PDFs, Word, Excel, and PowerPoint files, text files), and changes or deletes nothing. A personal account (outlook.com, hotmail.com) connects directly: Leon reads only its OneDrive. For a work account, your company’s Microsoft admin must first have approved Leon, once for the whole company: without that, Microsoft refuses the connection.',
    warning:
      'The text of files can be read, like a conversation, by you and, on the Leon website, by the managers above you. Images, scanned PDFs, and files over 10 MB are not read.',
  },
};
