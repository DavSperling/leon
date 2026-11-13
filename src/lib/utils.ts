import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge doit connaître les tailles, rayons et ombres de globals.css, sinon « text-label text-muted » perdrait la taille.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['label', 'ui', 'body', 'lead', 'title', 'h2', 'answer', 'head', 'h1'],
      radius: ['card', 'field', 'item', 'chip', 'mark'],
      shadow: ['sheet', 'lift', 'float'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
