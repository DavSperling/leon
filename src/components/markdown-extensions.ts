import type { AnyExtension } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

// Seuls http, https et mailto font un lien : jamais javascript: ni data:. L'éditeur n'écrit pas
// l'adresse d'un autre lien dans le DOM (href vide) et markdown-editor.css le rend inerte.
export const isAllowedLink = (url: string): boolean => /^(?:https?|mailto):/i.test(url.trim());

// Ce que l'éditeur sait écrire, et donc lire : le Markdown de la description et des commentaires.
// Pas de souligné : le Markdown n'en a pas. `maxLength` compte les caractères du texte ; la
// borne du Markdown reste vérifiée par le serveur, qui seul fait foi.
export function markdownExtensions(placeholder: string, maxLength?: number): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] }, // le menu « / » n'en propose que trois
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

// Les jetons du lecteur Markdown que le schéma de l'éditeur sait écrire. Tout autre (tableau, image,
// HTML, définition de lien) serait perdu ou déformé à la première frappe, et le HTML passerait par
// les règles de lecture des extensions, qui gardent les attributs class, target et rel d'un lien.
const HELD_TOKENS = new Set([
  'space',
  'paragraph',
  'text',
  'escape',
  'heading',
  'list',
  'list_item',
  'taskList',
  'taskItem',
  'code',
  'codespan',
  'blockquote',
  'hr',
  'br',
  'strong',
  'em',
  'del',
  'link',
]);

type LexToken = {
  type: string;
  tokens?: LexToken[];
  items?: LexToken[];
  nestedTokens?: LexToken[];
};

const allHeld = (tokens: readonly LexToken[]): boolean =>
  tokens.every(
    (token) =>
      HELD_TOKENS.has(token.type) &&
      allHeld([...(token.tokens ?? []), ...(token.items ?? []), ...(token.nestedTokens ?? [])]),
  );

let reader: MarkdownManager | undefined;

// Vrai quand l'éditeur peut lire ce Markdown sans rien perdre ni déformer. Sinon on le montre tel quel.
export function editorCanHold(markdown: string): boolean {
  reader ??= new MarkdownManager({ extensions: markdownExtensions('') });
  return allHeld(reader.instance.lexer(markdown));
}

// Le Markdown que l'éditeur enregistre. Le paragraphe vide qu'il garde sous une liste ou un bloc de
// code s'écrit en lignes vides, et chaque paragraphe vide après le premier en « &nbsp; » : ce ne
// sont que des lignes vides, pour qui lit le texte brut (un agent, « Copier pour un agent »).
export const toStoredMarkdown = (markdown: string): string =>
  markdown.replace(/^&nbsp;$/gm, '').trim();
