import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const gmailCatalog: CatalogEntry = {
  id: 'gmail',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Google vous demande d’autoriser « Leon » à lire vos courriers. L’appli n’étant pas encore validée par Google, un écran d’avertissement s’affiche d’abord : cliquez sur « Paramètres avancés », puis sur « Accéder à Leon (non sécurisé) ». Leon ne fait que lire (hors promotions, réseaux sociaux, brouillons et indésirables) ; il n’écrit et n’envoie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des courriers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Google asks you to allow “Leon” to read your email. Google hasn’t verified the app yet, so a warning screen comes first: click “Advanced”, then “Go to Leon (unsafe)”. Leon only reads (excluding Promotions, Social, drafts, and spam); it writes and sends nothing.',
    warning:
      'The text of emails can be read, like a conversation, by you and, on the Leon website, by the managers above you.',
  },
};
