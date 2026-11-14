# Papier v2 : the public page "Connectors"

Files (all new): `connectors.html`, `css/connectors.css` (prefix `cx-`), `js/connectors.js` (the filter only).
Linked read-only: `css/tokens.css`, `css/ui.css`, `css/site.css`, `css/pages.css`, `js/pages.js`.

## What is on the page

1. Head, in the home's hero composition (`.hero`, `.h1`, `.hero__lead`, `.cta`): "42 connectors, plus your AI
   conversations.", one sentence, the pill.
2. The catalogue. Left, an index that stays in view while the list scrolls: the filter field, the six categories
   with their counts (links), and what "One click" and "API key" mean. Right, the 42 connectors as rows: logo, name,
   one line on what Leon reads, how it connects. Under the last row: how far back Leon reads, and the beta note.
3. An ink band, "Your conversations with AI assistants": browser extension, coding tools, your own assistant.
4. "In progress." (replaces "Not supported yet"): Google Calendar, Microsoft 365, images and scanned PDFs, with the
   home's half-drawn circle.
5. Closing desk band (`.pclose` from pages.css), then the home's footer.

Without script the page is whole: the filter block carries `hidden` and only `js/connectors.js` shows it.
The filter matches the name, the category and the "what Leon reads" line ("tldv", "HelpScout", "crm",
"transcript" all work); Escape or "Show all connectors" clears it; a category with no match disappears from the
list and from the index; the count is announced (`role="status"`).

## Where the facts come from

- Hero, beta note, AI channels, in-progress items, closing line: `messages/en.json`, `site.connectors`.
- "One click" or "API key" per tool: the `OAUTH` set in `src/components/site/pages/connecteurs-catalogue.tsx`.
- "What Leon reads" per tool: today's public page has no such line. Each one is taken from the connector's own
  English help text in `src/server/connectors/<tool>/catalog.ts`, or, where that says nothing, from the comments of
  its `connector.ts` / `map.ts`. Nothing was added beyond what the code says it reads.
- Categories and their order: `shared/demo-data.js` (`catalogue`), the same as the home and the app.
- Coding tools: the four names and "you approve what is sent / secrets masked twice" follow the home's developer
  section (home-v2.md, update 2). Today's "Text only, no tool output" was left out because it contradicts it.

Length: today's page has 366 words of copy. This one has 367 words outside the 42 rows, of which about 85 are the
index, the category headings and the hidden empty state: so about 280 of prose, not half. The four-step section
became one sentence under the list; cutting further would drop facts. The 42 lines themselves (483 words) are new:
the brief asks for them.

## Links

Home sections go to `index.html#…`; Connectors, Security and Pricing are real links; Sign in, Create a workspace,
Documentation, "What’s missing" and Français keep `href="#"` and `title="Not in this prototype"` (js/pages.js shows
its notice). When signin.html and signup.html exist, these are five one-word changes.

## For whoever merges the three inner pages

- This page and security.html use the home's type scale (56 / 40). pricing.html uses the quieter scale of pages.css
  (`body.page`, `.ptop`: 48 / 32). One of the two must win. To move this page: add `page` to `<body>` and swap the
  head's classes for `.ptop`, `.ptop__h1`, `.ptop__lead`, `.ptop__cta`. Nothing else depends on it.
- Could move into pages.css if another page needs it: the two-column section (text on columns 1 to 5, fragment on
  7 to 12: `.cx-ai__text`, `.cx-wip__text`, `.cx-wip__list`) and the titled in-progress item (`.cx-wip__t`,
  `.cx-wip__d`).

## Checked

- Captures at 1440x900, 390x844, 1280x800, 768x1024: no console error; page 5,278px tall at 1440 (5.9 screens),
  7,963px at 390; H1 56 / 49.9 / 43 / 28.9px on two lines; H2 one or two lines.
- Scripted check (scratchpad `tools-connectors/check.mjs`), at 1440 and 390: 42 rows, category counts equal their
  rows, no sideways overflow, nothing under 13px, five type sizes, no broken logo, touch targets 44px on the phone,
  nine filter cases.
- Looked at twice (desktop and phone). The last change, folding the four steps into one sentence under the list,
  was checked by measurement only, not by eye.
- Rule checkers: the hairline rule flags the row separators (kept: it is a list read as a table); impeccable's
  "cramped padding" on the bands is a false positive of its static pass (it does not load the linked CSS).

## Not done

- No look at 768 and 1280 pictures (reports only). No keyboard walk-through recorded; the controls are native
  (links, one search field, one button) with the kit's focus ring.
- The filter does not update the address, and the index does not mark the category in view.
