# Version B — « Papier » (direction contract)

Folder: `prototypes/refonte-2026-11/b/`. Read `common.md` first. This contract is decided; where it is silent, decide
in its spirit: a desk of real documents, marked up by hand, in a calm editorial voice.

## Thesis

Each sentence of an answer wears the colour of the document it came from. The page is a desk seen from above: white
sheets on a neutral grey desk, sentences marked with highlighters, page-marker flags sticking out of the sheets'
edges. It refuses the gradient orb, the card grid, and the cream-with-a-serif look of AI assistants: the desk is
neutral grey and the paper is bright white, never cream.

Why this is Leon's: the product's whole promise is provenance. Colour does that job here. A pink sentence comes
from the pink-flagged document. A sentence with no colour is a sentence Leon does not write.

## Own world

Colours:
```
--desk: #ECECE8;        /* the page: a neutral light grey desk, not cream */
--desk-2: #E0E0DB;      /* idle tabs, a step darker than the desk */
--sheet: #FFFFFF;       /* every sheet of paper */
--ink: #111111;         /* text, buttons, the ink bands */
--ink-2: #55554F;       /* secondary notes only */
--line: #D8D8D2;        /* ruled lines inside sheets: tables, fields, the index */
/* highlighters: behind ink text, source 1, 2, 3, 4 in an answer */
--m1: #FFB8D9;  --m2: #A8F0C2;  --m3: #A9D4FF;  --m4: #FFD9A0;
/* page-marker flags, same order, a step stronger, ink text on them */
--f1: #FF7FB8;  --f2: #5FDD92;  --f3: #6FB6FF;  --f4: #FFB54D;
--ok: #1F7A4D;  --danger: #B42318;
```
The colours are ink, not paint: they appear only as highlighter strokes on text and as flags. No coloured panels,
no coloured buttons. Two full-bleed bands in `--ink` (permissions, and the close with the footer) give the page its
rhythm. Source n always takes colour n, in the answer, on its flag and on its document. The number is always
there too: colour is never the only cue.

Type: STIX Two Text (Google Fonts, 400, 500, 600, italic 400): the headlines, Leon's answers, and every original
text. It is the typeface scientific papers cite in. Libre Franklin (400, 500, 600): navigation, buttons, labels,
the marketing sentences, all interface text. H1 STIX 50px/500, tracking -0.015em, leading 1.08. H2 STIX 34px/500,
leading 1.12. Marketing sentences Franklin 17px/1.55. Answers STIX 21px/1.5 on the site, 18px in the app.
Originals STIX 16px/1.5. Interface Franklin 14px (13px minimum). Tabular numerals where numbers line up.

Shape: sheets, fields and buttons have a 3px radius. Buttons are flat ink with white text (44px tall on the site, 32
to 36px in the app); the secondary button is a 1px ink outline. A field is a 1px ink line all round on white.

The two exceptions to the common bans, both part of this world:
- A sheet lying on the desk, or on another sheet, casts one small real shadow:
  `0 1px 0 rgba(17,17,17,.06), 0 14px 24px -14px rgba(17,17,17,.25)`. Nothing else has a shadow.
- Secondary sheets in a pile may be rotated by 1.5 degrees at most, flat, in 2D. The sheet being read is straight.
  No 3D, no tilt on hover.

Signatures:
- The highlighter: `<mark>` on inline text, the marker colour behind ink text, 2px radius, padding 0.06em 0.18em,
  `box-decoration-break: clone` so it follows the lines.
- The flag: a tab 46 × 22px in the flag colour with a V notch cut into its outer end (clip-path), the number in
  Franklin 13px/600 ink. It sticks out 18px beyond the edge of its sheet. It is a real button.
- The empty flag: the same shape as a 1.5px dashed `--ink-2` outline, labelled "no source".
- The private stamp: "Private to you" as a small ink-outlined label, Franklin 13px/600, sentence case, straight.

## Story

The visitor reads the promise on a sheet of paper, and under it an answer whose three sentences are marked in three
colours, with three documents beside it wearing the same colours. Pointing at a sentence brings its document to the
top of the pile, open at the passage. Then: a sentence with no colour is one Leon does not write; your private
sheets stay in your pile; 42 tools as a printed index; the morning memo; sign the first line.

## First viewport (1440 × 900)

- Desk grey everywhere. A plain navigation row on the desk, 28px from the top: wordmark left; the four links,
  "Sign in" and the ink button right. Equal 40px outer margins, a 12-column grid.
- The main sheet: white, on columns 1 to 7, its top 108px from the top of the page, running below the fold, 56px of
  padding. In it, top to bottom: the H1 (two lines); the sentence (Franklin 18px, 52 characters wide at most); the
  ink button with the note beside it; 40px of space; one line "Try a question:" followed by the three questions as
  text choices (the selected one underlined in ink, 2px); the question with the asker's initials (Franklin 15px);
  the answer in STIX 21px, its three sentences marked pink, green, blue, each followed by its small number.
  On the sheet's right edge, three flags (1 pink, 2 green, 3 blue), each level with the first line of its
  sentence, sticking out over the desk.
- On columns 8 to 12, bleeding slightly off the right edge: the pile of the three source sheets, each about 430px
  wide. The selected one is on top, straight and fully readable: logo, "Granola · Meeting", the title, author and
  date, the original in its own shape (speakers and times) with the passage marked in its colour, "Open in
  Granola", "Shared with the team", and its flag on its left edge, facing the answer. The two others lie behind,
  turned by 1 degree or so, their titles and flags showing.
- "Fictional example" under the pile, Franklin 13.5px, ink.
The answer and its flags are fully visible above the fold.

Phone: the sheet is the screen (16px margins, no rotation): H1 at 32px on two lines, sentence, button, the
questions as a row that scrolls sideways, the question, the answer with its markers and numbers; the flags stay on
the right edge. The source sheets follow below as a stack, the selected one first and open, the others as their
headers only; tapping a sentence or a flag opens its sheet.

## The sections below (each a different arrangement on the desk)

2. No source (desk). Heading and text set directly on the desk, columns 1 to 5. On columns 6 to 12, one sheet: the
   Verlant question; "I don’t know. No source on record mentions a price agreed with Verlant in 2024." in STIX
   21px with no marker, and where its flag would be, the empty flag labelled "no source"; then the second
   sentence marked in colour 1 with flag 1, and the small Pipedrive note as a second sheet tucked under the first
   one's lower right corner, with its flag.
3. Permissions (a full-bleed ink band, white text). Heading and text top-left, columns 1 to 6; the segmented control
   "Asked by Julie / Asked by Sophie" on columns 8 to 12 (selected: white fill, ink text). Below, the answer sheet
   on the left and its documents on the right. Julie's view: the email sheet, with the stamp "Private to you", and
   the ticket sheet. Sophie's view: the ticket sheet only, and the second sentence unmarked with the empty flag.
   A 200ms crossfade. Never show that a hidden document exists.
4. Connectors (desk). One wide sheet across the twelve columns, laid out like a printed index: the heading and text
   at its top-left; the six families as columns or as a 3 by 2 arrangement of lists, family name in STIX
   18px/600, each tool one line (an 18px logo and its name, Franklin 15px), fine ruled lines between families; the
   link at the bottom right; the small line about the extension.
5. Morning briefing (desk). Left, a memo sheet 480px wide turned by 1 degree: "Morning briefing" in STIX 24px,
   "Tuesday, November 10, 2026 · 08:45", the three headed lists in STIX 16px, each item followed by its number.
   Right, columns 7 to 12: heading, text, small line, link, set on the desk.
6. Security (desk). No sheet: heading on columns 1 to 5, text and link on columns 7 to 12. A quiet rest.
Close and footer (one full-bleed ink band). Left: the closing heading (white, STIX 36px) and its sentence. Right, a
   white sheet "Create a workspace": "Workspace name" already holding "Kestrel Studio" (editable), "Work email",
   the ink button (goes to signin.html). Below, still on ink: the wordmark at 28px, the three link columns,
   language, the copyright line, in white.

## The app

Shell: the window is the desk. A 56px top row on the desk: wordmark left; right, "Kestrel Studio" and Julie's
initial tile (the account menu). The main sheet is white, up to 1180px wide, its top 96px from the top of the
window. The six navigation entries are index tabs standing on the sheet's top edge at its left: 34px tall,
Franklin 14px/500, the current one white and joined to the sheet, the others `--desk-2`. No sidebar.

- Home: 48px padding. The date in `--ink-2`; the greeting in STIX 30px/500 on two lines at most ("Good morning,
  Julie. The ACME migration moved to December 2."); the ask field, 56px tall, ink outline, the ink "Search" button
  inside its right end, the three demo questions as text links under it. Then a 7/5 arrangement: the morning
  briefing as a memo (three headed lists in STIX 17px, each item followed by its number in its flag colour) and
  the recent discussions as rows (Franklin 15px, dates right-aligned).
- Search: the main sheet is narrower here (about 780px, left) and holds: the filled query field, the quiet filter
  row, "Leon’s answer" as a paragraph in STIX 19px/1.6 with its three markers, the flags on the sheet's right edge
  level with each sentence, the note and "Continue in chat", then "3 sources" as rows (number in its flag colour,
  logo, tool and kind, title, author and date, the passage marked in its colour, who can see it). On the desk to
  its right, the selected original as its own sheet (about 420px) with its flag on its left edge, its header, an
  outlined "Open in Granola" button and the passage marked in its colour.
- Chat: the main sheet (about 780px) holds the thread: the question (Franklin 16px/600 with initials), the answer in
  STIX 18px with markers and flags on the edge, "2 sources cited" rows (the email carries the private stamp), and
  the composer at the foot with its note. To its right on the desk, a narrow sheet (280px): "Your discussions" and
  a "New discussion" button.
- Connections: the full-width sheet. Title in STIX 28px and the one-line explanation; the connected tools as a real
  ruled table (tool, account, who sees it, state, items right-aligned, "Manage"); Intercom's row states its error
  in `--danger` with a "Reconnect" button. Then the catalogue as the printed index by family, each tool with a
  text "Connect" button, and a filter field.

## Sign-in

The desk. On columns 2 to 6, a sheet holding the form. On columns 8 to 12, set on the desk: "Everything your team
said, on record." in STIX 34px, and under it one small sheet turned by 1 degree: the meeting's line marked in pink
with flag 1. Phone: the form sheet first, then the sentence; the small sheet is dropped.

## Motion

The authored moment: on load the three source sheets land on the desk one after another (8px of travel and 2
degrees of turn settling to rest, 420ms each, 90ms apart), then the three markers sweep across their sentences
from left to right (500ms each, 120ms apart), once. Pointing at or selecting a sentence brings its document to the
top of the pile (240ms) and grows both flags to 1.08. Under prefers-reduced-motion everything is in its final
state.
