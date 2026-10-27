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
  en: {
    fields: {
      company: {
        label: 'Pipedrive company',
        help: 'The start of your Pipedrive URL: acme for acme.pipedrive.com.',
      },
      token: {
        label: 'Personal API token',
        help: 'Leon reads the notes and activities your account sees. If the API option doesn’t appear in your preferences, an admin must enable it for your account. Pipedrive limits the number of calls per day depending on your plan.',
      },
    },
    keyHelp:
      'In Pipedrive: your name at the top right › Company settings › Personal preferences › API.',
  },
};
