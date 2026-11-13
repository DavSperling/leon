import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge doit connaître les tailles, rayons et ombres de globals.css, sinon « text-meta text-muted » perdrait la taille.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['meta', 'label', 'ui', 'body', 'lead', 'title', 'h2', 'answer', 'head', 'h1'],
      radius: ['panel', 'box', 'card', 'field', 'item', 'chip', 'mark'],
      shadow: ['hi', 'sheet', 'lift', 'panel', 'float'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
