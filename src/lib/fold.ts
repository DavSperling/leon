// Sans accents ni majuscules : « ete » trouve « Été ». Sert aux recherches dans les menus.
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
