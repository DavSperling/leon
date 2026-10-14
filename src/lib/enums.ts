// Énumérations partagées par le schéma, la mémoire, le pipeline et l'interface. Module pur : aucun import.
export const CARD_STATUSES = ['confirmed', 'unconfirmed'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const FACT_STATUSES = ['active', 'superseded', 'conflict', 'pending_review'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
export const SENSITIVE_CATEGORIES = ['rh', 'remuneration', 'juridique', 'sante', 'perso'] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];
