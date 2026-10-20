import { oneLine } from '@/server/memory/labels';

export const ACCOUNT_MAX = 120;

// Le compte vient de l'outil : une seule ligne, coupée, avant de devenir l'intitulé de la connexion.
export const accountLabel = (account: string, fallback: string): string =>
  Array.from(oneLine(account)).slice(0, ACCOUNT_MAX).join('') || fallback;
