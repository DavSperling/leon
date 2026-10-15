import type { AnyExtension } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

// Seuls http, https et mailto font un lien : jamais javascript: ni data:. Un autre lien reste du
// texte, et l'éditeur n'en écrit pas l'adresse dans le DOM.
export const isAllowedLink = (url: string): boolean => /^(?:https?|mailto):/i.test(url.trim());

// Ce que l'éditeur sait écrire, et donc lire : le Markdown de la description et des commentaires.
// Pas de souligné : le Markdown n'en a pas. `maxLength` compte les caractères du texte ; la
// borne du Markdown reste vérifiée par le serveur, qui seul fait foi.
export function markdownExtensions(placeholder: string, maxLength?: number): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, isAllowedUri: isAllowedLink },
      underline: false,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: { checkboxLabel: (node) => `Case à cocher : ${node.textContent || 'élément vide'}` },
    }),
    Placeholder.configure({ placeholder }),
    ...(maxLength === undefined ? [] : [CharacterCount.configure({ limit: maxLength })]),
    Markdown,
  ];
}
