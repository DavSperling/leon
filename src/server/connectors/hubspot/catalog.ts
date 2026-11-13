import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
// HubSpot ne laisse plus créer d'appli privée (28/09/2026 pour les nouveaux comptes, 26/10/2026 pour
// les autres) : l'aide mène à une clé de service, qui s'envoie pareil. Un jeton d'appli privée déjà
// créé reste accepté dans le même champ.
export const hubspotCatalog: CatalogEntry = {
  id: 'hubspot',
  fields: [
    {
      name: 'token',
      label: 'Clé de service',
      kind: 'secret',
      placeholder: 'pat-eu1-…',
      help: 'Leon ne fait que lire : les notes, appels, réunions et e-mails de votre compte HubSpot, avec le nom de l’entreprise, de l’affaire ou du contact auxquels ils sont liés. Un jeton d’appli privée déjà créé marche aussi.',
    },
  ],
  keyHelp:
    'Dans HubSpot : Paramètres › Intégrations › Clés de service (Service Keys), ou Développement › Clés › Clés de service ; Créer une clé de service, donnez-lui un nom, puis Ajouter une portée (Add new scope) : cochez crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.owners.read et sales-email-read ; Mettre à jour, Créer, puis copiez la clé. Il faut être super administrateur ou avoir l’accès aux outils de développement, et la clé ne reçoit que les portées que vous avez vous-même.',
  oauthHelp:
    'HubSpot vous demande d’autoriser Leon à lire les notes, appels, réunions et e-mails de votre compte, avec le nom des contacts, entreprises et affaires auxquels ils sont liés. Seul un super administrateur du compte peut installer l’appli. L’accès permet aussi d’écrire ; Leon ne s’en sert pas encore.',
  docsUrl:
    'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys',
  triedForReal: false,
  en: {
    fields: {
      token: {
        label: 'Service key',
        help: 'Leon only reads: the notes, calls, meetings, and emails of your HubSpot account, with the name of the company, deal, or contact they’re linked to. An existing private app token works too.',
      },
    },
    keyHelp:
      'In HubSpot: Settings › Integrations › Service Keys, or Development › Keys › Service keys; Create service key, give it a name, then Add new scope: check crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.owners.read, and sales-email-read; Update, Create, then copy the key. You need to be a super admin or have Developer tools access, and the key only gets the scopes you have yourself.',
    oauthHelp:
      'HubSpot asks you to authorize Leon to read the notes, calls, meetings, and emails of your account, with the names of the contacts, companies, and deals they’re linked to. Only a super admin of the account can install the app. The access also allows writing; Leon doesn’t use it yet.',
  },
};
