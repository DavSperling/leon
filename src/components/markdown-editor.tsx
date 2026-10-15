'use client';

import type { EditorProps } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import './markdown-editor.css';
import { markdownExtensions } from './markdown-extensions';
import { SlashMenu, useSlashMenu } from './slash-menu';

type MarkdownEditorProps = {
  value: string; // le Markdown de départ : l'éditeur ne le relit pas, on ne co-édite pas
  label: string; // le nom du champ pour les lecteurs d'écran
  placeholder?: string;
  maxLength?: number; // la borne du champ, relayée comme le `maxLength` d'une zone de texte
  readOnly?: boolean;
  onChange?: (markdown: string) => void;
  onBlur?: () => void;
  onSubmit?: () => void; // ⌘Entrée
  className?: string; // posée sur la zone de saisie : hauteur, marges, bordure
};

const FIELD_CLASS =
  'rounded-md border border-transparent px-2.5 py-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type Submit = RefObject<(() => void) | undefined>;

// Échap fait sortir de l'éditeur (sauf si un menu l'a déjà prise : le menu « / » ou un dialogue).
// ⌘Entrée envoie quand le champ a un envoi, au lieu d'insérer un saut de ligne.
function editorProps(
  label: string,
  readOnly: boolean,
  className: string | undefined,
  submit: Submit,
) {
  const props: EditorProps = {
    attributes: {
      'aria-label': label,
      ...(readOnly ? { role: 'document' } : { 'aria-multiline': 'true' }),
      class: cn('markdown-content', readOnly ? 'min-h-6' : FIELD_CLASS, className),
    },
    handleKeyDown: (view, event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        view.dom.blur();
        return true;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && submit.current) {
        submit.current();
        return true;
      }
      return false;
    },
  };
  return props;
}

// Un éditeur de texte riche dont le Markdown est la seule forme stockée : description, commentaire
// et création de tâche l'emploient, et la lecture d'un commentaire en est la version `readOnly`.
export function MarkdownEditor({
  value,
  label,
  placeholder = '',
  maxLength,
  readOnly = false,
  onChange,
  onBlur,
  onSubmit,
  className,
}: MarkdownEditorProps) {
  const slash = useSlashMenu();
  const submit = useRef(onSubmit);
  useEffect(() => {
    submit.current = onSubmit;
  });
  // Extensions et propriétés sont créées une fois : tiptap les compare à chaque rendu.
  const [extensions] = useState(() => {
    const base = markdownExtensions(placeholder, maxLength);
    return readOnly ? base : [...base, slash.extension];
  });
  const [props] = useState(() => editorProps(label, readOnly, className, submit));

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    editorProps: props,
    immediatelyRender: false, // rendu serveur sans éditeur : pas de décalage à l'hydratation
    shouldRerenderOnTransaction: false,
    // Le paragraphe vide que l'éditeur garde sous une liste ou un bloc de code s'écrit en lignes vides.
    onUpdate: ({ editor }) => onChange?.(editor.getMarkdown().trimEnd()),
    onBlur,
  });

  return (
    <>
      <EditorContent editor={editor} />
      <SlashMenu menu={slash.menu} editor={editor} onHover={slash.hover} />
    </>
  );
}
