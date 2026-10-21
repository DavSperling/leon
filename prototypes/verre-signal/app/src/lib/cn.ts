import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge doit connaître nos tailles et rayons, sinon « text-meta text-muted » perdrait la taille.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['meta', 'label', 'ui', 'body', 'lead', 'title', 'h2', 'h1'],
      radius: ['panel', 'box', 'card', 'field', 'item', 'chip'],
      shadow: ['hi', 'panel', 'float'],
    },
  },
});

export const cn = (...inputs: ClassValue[]): string => merge(clsx(inputs));
