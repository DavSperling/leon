import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const gmailCatalog: CatalogEntry = {
  id: 'gmail',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Google vous demande d’autoriser « leonmemory.com » (Leon) à accéder à tout votre Gmail : lire, écrire, envoyer et supprimer des courriers, et changer les filtres, la signature et la réponse d’absence. L’appli n’étant pas encore validée par Google, un écran d’avertissement s’affiche d’abord : cliquez sur « Paramètres avancés », puis sur « Accéder à leonmemory.com (non sécurisé) ». Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il ne fait que lire (hors promotions, réseaux sociaux, brouillons et indésirables) et n’écrit, n’envoie ni ne supprime rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des courriers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Google asks you to allow “leonmemory.com” (Leon) full access to Gmail: read, write, send, and delete email, and change your filters, signature, and vacation reply. Google hasn’t verified the app yet, so a warning screen comes first: click “Advanced”, then “Go to leonmemory.com (unsafe)”. Leon asks for these permissions up front so it won’t need to ask you again later; today it only reads (excluding Promotions, Social, drafts, and spam) and writes, sends, or deletes nothing.',
    warning:
      'The text of emails can be read, like a conversation, by you and, on the Leon website, by the managers above you.',
  },
};
