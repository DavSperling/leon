import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge doit connaître les tailles, rayons et ombres de globals.css, sinon « text-meta text-muted » perdrait la taille.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['meta', 'label', 'ui', 'body', 'lead', 'title', 'h2', 'h1'],
      radius: ['panel', 'box', 'card', 'field', 'item', 'chip'],
      shadow: ['hi', 'panel', 'float'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
