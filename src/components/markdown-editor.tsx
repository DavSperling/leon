'use client';

import type { EditorProps } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import './markdown-editor.css';
import { editorCanHold, markdownExtensions, toStoredMarkdown } from './markdown-extensions';
import { SlashMenu, useSlashMenu } from './slash-menu';
import { Textarea } from './ui/textarea';

type MarkdownEditorProps = {
  value: string; // le Markdown de départ : l'éditeur ne le relit pas, on ne co-édite pas
  label: string; // le nom du champ pour les lecteurs d'écran
  placeholder?: string;
  maxLength?: number; // la borne du champ, relayée comme le `maxLength` d'une zone de texte
  readOnly?: boolean;
  focusOnMount?: boolean; // donne le focus dès l'affichage : un éditeur remonté à neuf après un envoi
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

// Le Markdown tel quel, comme avant l'éditeur riche : une zone de texte, ou un bloc de texte en lecture.
function PlainMarkdown({
  value,
  label,
  placeholder,
  maxLength,
  readOnly,
  onChange,
  onBlur,
  onSubmit,
  className,
}: MarkdownEditorProps) {
  if (readOnly) {
    return (
      <pre
        role="document"
        aria-label={label}
        className={cn('font-mono text-[13px] leading-5 break-words whitespace-pre-wrap', className)}
      >
        {value}
      </pre>
    );
  }
  return (
    <Textarea
      defaultValue={value}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault();
          onSubmit();
        }
      }}
      className={className}
    />
  );
}

function RichEditor({
  value,
  label,
  placeholder = '',
  maxLength,
  readOnly = false,
  focusOnMount = false,
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
    autofocus: focusOnMount ? 'end' : false,
    immediatelyRender: false, // rendu serveur sans éditeur : pas de décalage à l'hydratation
    shouldRerenderOnTransaction: false,
    // Le texte est réécrit par le gestionnaire Markdown de TipTap : « & » devient « &amp; » et
    // « _ » devient « \_ ». C'est le même Markdown, mais le texte brut qu'un agent lit en est un
    // peu pollué, et rien dans une extension ne permet de l'éviter.
    onUpdate: ({ editor }) => onChange?.(toStoredMarkdown(editor.getMarkdown())),
    onBlur,
  });

  return (
    <>
      <EditorContent editor={editor} />
      <SlashMenu menu={slash.menu} editor={editor} onHover={slash.hover} />
    </>
  );
}

// Un éditeur de texte riche dont le Markdown est la seule forme stockée : description, commentaire
// et création de tâche l'emploient, et la lecture d'un commentaire en est la version `readOnly`.
// Un Markdown que l'éditeur ne sait pas relire (tableau, image, HTML) reste du texte brut : le
// réécrire par l'éditeur le ferait perdre. Le choix se fait au départ, `value` n'étant que le départ.
export function MarkdownEditor(props: MarkdownEditorProps) {
  const [rich] = useState(() => editorCanHold(props.value));
  return rich ? <RichEditor {...props} /> : <PlainMarkdown {...props} />;
}
