// La langue dans laquelle la personne écrit, reconnue par le code : les prompts sont en français, et un modèle à qui
// on dit seulement « dans la langue de ses messages » écrit souvent en français à quelqu'un qui écrit en anglais
// (étude docs/etudes/resumes-2026-11 : 5 points du matin anglais sur 5 en français avec Sonnet). Lui dire la langue
// en clair, en tête du message, corrige. Le nom rendu est celui que le prompt écrit (« Écris en anglais »).
// Module pur.

import type { Locale } from '@/i18n/request';

// Les langues de l'écran, du nom que le prompt leur donne : celle qu'une personne a choisie pour son compte (0094),
// dans laquelle s'écrit ce que le modèle écrit pour elle, quelle que soit la langue de sa matière.
export const ACCOUNT_LANGUAGES: Record<Locale, string> = { fr: 'français', en: 'anglais' };

// Une écriture à elle seule dit la langue.
const SCRIPTS: Array<[RegExp, string]> = [
  [/\p{Script=Hebrew}/gu, 'hébreu'],
  [/\p{Script=Arabic}/gu, 'arabe'],
  [/\p{Script=Greek}/gu, 'grec'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/gu, 'japonais'],
  [/\p{Script=Hangul}/gu, 'coréen'],
  [/\p{Script=Han}/gu, 'chinois'],
];

// Les petits mots les plus courants de chaque langue en alphabet latin : ceux qu'un texte technique garde aussi.
const WORDS: Record<string, ReadonlySet<string>> = {
  anglais: new Set(
    "the and is are was were you we i it's i'm don't can't this that what with for not have has can should would will let's be of to in on it my your our they there if or but just".split(
      ' ',
    ),
  ),
  français: new Set(
    "le la les des une est sont je tu il elle nous vous on pas que qui mais avec dans pour sur ce cette c'est j'ai il y a du au aux ça faut fais peux veux ne".split(
      ' ',
    ),
  ),
  allemand: new Set(
    'der die das und ist nicht ich wir sie mit für auf ein eine einen zu es kannst bitte noch auch aber oder wenn dass bei von den dem'.split(
      ' ',
    ),
  ),
  espagnol: new Set(
    'el los las y es que para con por una pero está están necesito hay como lo del se muy también cuando porque yo'.split(
      ' ',
    ),
  ),
  italien: new Set(
    'il lo gli che è non per con una sono questo questa anche perché ho hai abbiamo della delle nel sul come ma'.split(
      ' ',
    ),
  ),
  // Sans les mots qu'il partage avec l'espagnol (que, por, para, está…) : ils feraient match nul.
  portugais: new Set(
    'os as é uma não você vocês estão preciso tem do da dos das em no na mas também isso'.split(
      ' ',
    ),
  ),
  néerlandais: new Set(
    'de het een en is niet ik we wij je jij met voor op dat dit van zijn maar ook nog wel er'.split(
      ' ',
    ),
  ),
};

// Sous ce nombre de petits mots, ou sans avance nette sur la deuxième langue, on ne devine pas : le prompt garde sa
// consigne (« dans la langue de ses messages »).
const MIN_WORDS = 3;
const LEAD = 1.5;

export function detectLanguage(texts: readonly string[]): string | null {
  const text = texts.join('\n');
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return null;
  for (const [pattern, language] of SCRIPTS) {
    if ((text.match(pattern)?.length ?? 0) > letters * 0.3) return language;
  }
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^\p{L}'’]+/u)) {
    const token = word.replace(/’/g, "'");
    for (const [language, words] of Object.entries(WORDS)) {
      if (words.has(token)) counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  if (!first || first[1] < MIN_WORDS) return null;
  if (second && first[1] < second[1] * LEAD) return null;
  return first[0];
}

// La ligne qui ouvre le message du modèle, ou null quand la langue n'est pas reconnue. `of` : de quoi la langue est
// tirée (« ses messages », « sa recherche ») ; sans `of`, la ligne dit seulement la langue (un choix par défaut).
export function languageLine(language: string | null, of?: string): string | null {
  if (language === null) return null;
  return of
    ? `Écris ta réponse en ${language} : c'est la langue de ${of}.`
    : `Écris ta réponse en ${language}.`;
}
