import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const outlookCatalog: CatalogEntry = {
  id: 'outlook',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande « Autoriser Leon à lire votre courrier et votre agenda ? ». Leon ne lit que la boîte de réception, les éléments envoyés et l’agenda, en lecture seule. L’administrateur Microsoft de votre entreprise doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
  triedForReal: false,
  warning: 'Les courriers et événements lus deviennent visibles de toute l’équipe.',
};
