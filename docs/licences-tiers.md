# Licences tierces

Ce que Leon doit à d'autres projets, et sous quelle licence. À mettre à jour dès qu'un jet reprend du code ou ajoute une dépendance.

## Kaneo (MIT)

[Kaneo](https://github.com/usekaneo/kaneo) est un gestionnaire de tâches libre. Le jet des tâches de Leon s'en inspire pour les idées et les algorithmes du tableau et de l'éditeur.

Ce qui s'en inspire :

- **Le tableau** (glisser les cartes entre colonnes et dans une colonne) : `src/components/tasks/task-board.tsx`, `board-column.tsx`, `board-move.ts`, `use-board-drag.ts` et `src/lib/tasks/position.ts`.
- **L'éditeur** (Markdown avec TipTap et menu `/`) : `src/components/markdown-editor.tsx`, `markdown-extensions.ts` et `slash-menu.tsx`.

Texte de la licence de Kaneo (fichier `LICENSE` du dépôt) :

```text
MIT License

Copyright (c) 2024 Andrej Acevski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dépendances ajoutées par le jet des tâches (MIT)

Versions exactes dans `package.json`, licence vérifiée dans chaque paquet installé.

| Usage | Paquets |
|---|---|
| Glisser-déposer du tableau | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| Éditeur Markdown | `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-list`, `@tiptap/extensions`, `@tiptap/suggestion` |

Les composants `src/components/ui/` ajoutés par le CLI shadcn sont du code MIT copié dans le dépôt, sans dépendance nouvelle.

## Règle

Jamais de code de Plane ni d'un autre projet sous licence AGPL ou équivalente. Tout code repris d'un projet MIT est mentionné ici, avec le texte de sa licence.
