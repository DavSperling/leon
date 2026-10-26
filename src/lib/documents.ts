// Contrat de l'écran Documents entre le serveur et la page. Le navigateur n'importe rien de `@/server` : le plafond
// de taille (vérifié des deux côtés) et les codes d'erreur que l'action renvoie vivent ici ; la page les traduit.

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type DocumentErrorCode = 'missing' | 'unreadable' | 'empty' | 'too_long' | 'failed';
