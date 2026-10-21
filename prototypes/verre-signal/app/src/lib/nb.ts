// Typographie française : espace fine insécable (U+202F) avant ; : ? ! % » et après «.
// Ne touche qu'une espace déjà écrite : « 14:12 », « outil:github » ou « https:// » restent intacts.
const NNBSP = ' ';

export function nb(text: string): string {
  return text.replace(/[   ]+([;:?!%»])/g, `${NNBSP}$1`).replace(/«[   ]+/g, `«${NNBSP}`);
}

console.assert(
  nb('Depuis : 7 jours ; « ACME » ? 15 % ! outil:github 14:12') ===
    `Depuis${NNBSP}: 7 jours${NNBSP}; «${NNBSP}ACME${NNBSP}»${NNBSP}? 15${NNBSP}%${NNBSP}! outil:github 14:12`,
  'nb() : espaces fines mal posées',
);
