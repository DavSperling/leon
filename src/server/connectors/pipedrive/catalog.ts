import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const pipedriveCatalog: CatalogEntry = {
  id: 'pipedrive',
  fields: [
    {
      name: 'company',
      label: 'Entreprise Pipedrive',
      kind: 'text',
      placeholder: 'acme',
      help: 'Le début de l’adresse de votre Pipedrive : acme pour acme.pipedrive.com.',
    },
    {
      name: 'token',
      label: 'Jeton d’API personnel',
      kind: 'secret',
      help: 'Leon lit les notes et les activités que votre compte voit. Si l’option API n’apparaît pas dans vos préférences, un administrateur doit l’activer pour votre compte. Pipedrive limite le nombre d’appels par jour selon votre forfait.',
    },
  ],
  keyHelp:
    'Dans Pipedrive : votre nom en haut à droite › Paramètres de l’entreprise › Préférences personnelles › API.',
  docsUrl: 'https://pipedrive.readme.io/docs/how-to-find-the-api-token',
  triedForReal: false,
};
