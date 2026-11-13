# Lead designer's rulings — group docs-connections (areas: documents-admin, connections)

## Already changed by the lead (do not undo)
- Connections: a tool that already has a card is never offered again; the demo GitHub connection is healthy; the Next dev
  badge is hidden (next.config.ts: do not touch).

## connections
1. MAJOR — a "Connect" tile below the fold opened no panel on a fresh load (Intercom). REPLAY on the calm server: scroll to
   it, click, the panel must open. If it fails, find why and fix; test.
2. MAJOR — "Add a tool" (its search and families) starts two screens down. FIX, the lead's composition: the page is
   "Connected" (the cards), then "Add a tool", then "Captures" LAST. There is no separate "Recommended" section any more:
   the tools recommended for the person's role come FIRST in "Add a tool" and each carries the caption "Recommended"
   (French: "Conseillé") under its name (a tile may carry one caption); the family chips and the search filter them like
   the others. Remove what becomes dead (keys, props, the `between` slot if nothing needs it).
3. minor — the stored reason of a failure is printed in French in the English panel. LEFT (it needs error codes on the
   server; report it).
4. minor — two blocks both headed "Granola (démo)" when two accounts are connected. FIX: each block is headed by who
   connected it, the status after it.
5. minor — the sidebar alert for someone who cannot reconnect. Another fixer's (the shell).
6. minor — the "Add a tool" flag shows 0 while a search finds nothing. FIX: no flag while a filter is on.
7. minor — the "already connected" dashed row is a third height. FIX: a 52px tile (Thing) with the caption "Already
   connected" and the "Manage" pill.
8. minor — the connect panel of a key tool is heavy at 771px. FIX modestly: one-line helps where the words allow; nothing a
   person needs in order to connect may go.
9. minor — carte.tsx, jeu.tsx, partie.ts (the diagram and the mini-game) are unused. LEFT: the founders decide; do not delete.

## documents-admin
1. MAJOR — /admin was never seen live. The dev server now runs with LEON_ADMINS=claire@essai.leon.local: look at /admin as
   claire in light, dark, 1280x800 and 390x844 and fix what is off; as karim it must answer "not found". Look at the "Admin"
   entry of the account menu too (it belongs to the shell: report, do not edit).
2. MAJOR — "Add a document" opened nothing four times. REPLAY on the calm server as claire: add files, a folder, a file for
   "Only you"; open; delete; Escape. Remove what you add.
3. minor — a standing three-line sentence on formats under the drop zone. FIX: one short line (the formats in five or six
   words · 10 MB per file); the full list only in a refusal.
4. minor — a singular "it" after several files. FIX: plural forms (English and French).
5. minor — the document panel has no "Done" button. BY DESIGN.
6. minor — "Open" shows the text Leon read, not the file. FIX the label: "View text" / "Voir le texte".
7. minor — one generic icon for text, Markdown, JSON and code. FIX small: lucide FileText for text and Markdown, FileCode
   for code, FileJson (or Braces) for JSON; keep the PDF, Word, Excel and PowerPoint marks.
