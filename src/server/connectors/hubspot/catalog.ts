import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const hubspotCatalog: CatalogEntry = {
  id: 'hubspot',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’appli privée',
      kind: 'secret',
      placeholder: 'pat-eu1-…',
      help: 'Leon ne fait que lire : les notes, appels, réunions et e-mails de votre compte HubSpot, avec le nom de l’entreprise, de l’affaire ou du contact auxquels ils sont liés.',
    },
  ],
  keyHelp:
    'Dans HubSpot : Développement › Applis héritées (Legacy apps) › Créer une appli héritée › Privée ; onglet Portées (Scopes), cochez en lecture crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.owners.read et sales-email-read ; onglet Authentification (Auth) › Afficher le jeton.',
  oauthHelp:
    'HubSpot vous demande d’autoriser Leon à lire les notes, appels, réunions et e-mails de votre compte, avec le nom des contacts, entreprises et affaires auxquels ils sont liés. Seul un super administrateur du compte peut installer l’appli. L’accès permet aussi d’écrire ; Leon ne s’en sert pas encore.',
  docsUrl: 'https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview',
  triedForReal: false,
};
