import { slugify } from '@/lib/slug';

const REF_PATTERN = /^([A-Za-z][A-Za-z0-9]{1,9})-([1-9]\d{0,8})$/;
const DEFAULT_PROJECT_KEY = 'TCH';
const MIN_KEY_LETTERS = 2;
const MAX_KEY_LETTERS = 3;
const MAX_BRANCH_CHARS = 60;

// « LEO », 12 → « LEO-12 »
export const formatTaskRef = (key: string, number: number): string => `${key}-${number}`;

// « leo-12 » → { key: 'LEO', number: 12 } ; null si le texte n'est pas un identifiant.
export function parseTaskRef(text: string): { key: string; number: number } | null {
  const match = REF_PATTERN.exec(text);
  if (!match) return null;
  return { key: (match[1] as string).toUpperCase(), number: Number(match[2]) };
}

// « amos/leo-12-titre-court » : 60 caractères au plus, sans tiret final, prénom omis s'il est vide.
export function branchName(ref: string, title: string, firstName: string): string {
  const owner = slugify(firstName);
  const name = `${owner ? `${owner}/` : ''}${slugify(`${ref} ${title}`)}`;
  return name.slice(0, MAX_BRANCH_CHARS).replace(/[-/]+$/, '');
}

// « Rénov'Ouest » → « REN » ; « TCH » si le nom n'a pas deux lettres.
export function projectKeyFrom(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, MAX_KEY_LETTERS)
    .toUpperCase();
  return letters.length >= MIN_KEY_LETTERS ? letters : DEFAULT_PROJECT_KEY;
}
