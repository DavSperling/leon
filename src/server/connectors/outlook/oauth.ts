import { microsoftOAuth } from '../microsoft';

// Le bouton « Se connecter avec Outlook » : l'appli Microsoft de Leon (microsoft.ts), comptes professionnels et
// personnels (outlook.com, hotmail.fr : choix de David du 27/11/2026). Tout le courrier et l'agenda sont demandés
// d'avance ; aujourd'hui Leon ne lit que la boîte de réception, les éléments envoyés et l'agenda.
//
// https://learn.microsoft.com/en-us/graph/permissions-reference, relu le 27/11/2026 : Mail.ReadWrite (« Does not
// include permission to send mail »), Mail.Send, Calendars.ReadWrite et MailboxSettings.Read n'exigent pas en
// eux-mêmes l'accord de l'administrateur (le réglage par défaut des annuaires le réclame quand même, voir
// microsoft.ts) et sont « available for consent in personal Microsoft accounts ». MailboxSettings.ReadWrite
// (réponse d'absence) n'est pas demandé : c'est aussi le droit des règles de la boîte, qui peuvent transférer le
// courrier (mailfolder-post-messagerules, `forwardTo`), et Leon ne demande pas le transfert.
export const outlookOAuth = microsoftOAuth('outlook', 'common', [
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'MailboxSettings.Read',
]);
