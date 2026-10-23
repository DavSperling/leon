import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const outlookCatalog: CatalogEntry = {
  id: 'outlook',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon sur votre courrier et votre agenda. Leon ne lit que la boîte de réception, les éléments envoyés et l’agenda ; l’accès permet aussi d’écrire (jamais d’envoyer), Leon ne s’en sert pas encore. L’administrateur Microsoft de votre entreprise doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
  triedForReal: false,
  warning:
    'Le texte des courriers et de l’agenda reste privé, comme une conversation : vous seul le voyez. Les événements personnels, privés ou confidentiels ne sont pas lus.',
};
