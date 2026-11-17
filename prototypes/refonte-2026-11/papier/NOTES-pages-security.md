# Leon « Papier » v2 : security.html

The public security page, in the home page's family. Files: `security.html`, `css/security.css`. Nothing else was
touched. It links `css/tokens.css`, `css/ui.css`, `css/site.css`, `css/pages.css` (read-only) and `js/pages.js`.

## What is on the page

1. Page top (`.ptop` from pages.css): "Leon sees exactly what you are allowed to see." with the home's single
   highlighter stroke (`.swp--one`, in blue) under "allowed to see.", and one sentence.
2. Who sees what (`.pstage`, the desk band joined to the top): two sheets, "Shared with the team" and "Private to
   you", three rows each with the logos of the tools concerned, and at the foot of each sheet the mark the product
   puts on a source (the plain note, or the "Private to you" stamp).
3. In place (white): the home's three items first, then two more from today's site, each with one sentence. Ticks.
4. In progress (ink band): the home's three items, each with one sentence. Half rings. `id="in-progress"` is the
   target of the footer's "What's missing".
5. Ask a security question (desk band): the home's closing band (`.close__*`, `.signup` from site.css) with a
   two-field form, and under the text a second way in ("Or check for yourself", "Create a workspace").

No script is needed to read it. `js/pages.js` adds the bar's line, the phone menu, the notice and the entrances.

## Copy: where it comes from, what was cut

Source: `messages/en.json` (`site.security`) and `SECURITY_FACTS_EN`, `NOT_YET_EN` in `src/components/site/content.ts`.
Today's page: about 469 words. This page: 349 words in `<main>`, form labels included. That is a quarter shorter,
not half: going further meant dropping facts.

- Kept: the two visibility rules and what falls under each; row-level security and its tests; AES-256-GCM on keys
  and tokens bound to their row; permissions before ranking; logged full reads by an assistant; secret masking and
  its known limit (plain prose slips through); the extension's consent, per-site switch, pause, no attachments,
  nothing in private windows; the three "in progress" items with what is true today.
- Merged: "A single datastore" into the first item ("in a single database"); "Audited MCP access" into the third;
  "Private conversations" into the "Private to you" sheet.
- Dropped: "personal tokens can be revoked at any time"; "no separate search cluster holds a copy"; "each with a
  deep link to the original"; "this list is kept current"; the three-plane illustration and its labels.
- Added from the home's checked facts, not from today's security page: coding sessions are private to their author.
- Not carried over on purpose: "no full account deletion from the interface". `messages/en.json` has a
  `deleteAccount` flow, so the sentence looks out of date. To confirm with the founders.

## Decisions to review

- **How to ask a question.** Today's site gives no security contact (no address anywhere in `src/components/site`
  or `messages/en.json`). I did not invent one: the page shows a form (work email, question). It is inert here.
  The real page needs an address or an endpoint behind it.
- **Navigation.** "Security" points to `security.html` and is marked current (pages.css draws the underline);
  Product, Connectors and Developers go to `index.html#…`; Pricing to `pricing.html`. pricing.html and
  connectors.html do not agree with each other on Connectors and Security: the three headers should be unified.
- **Sizes.** The page follows pages.css (48 for the title, 32 for headings), not the home's 56 and 40.
- **Two rules that could move into pages.css**: `.sx-area` (a field of several lines) and `.sx-split` (a heading
  that stays in view on five columns while its list passes on six). Everything else in security.css is this page's.

## Checked

- Captures at 1440 x 900, 390 x 844 and 1280 x 800: no console error; H1 48px on two lines (31px on a phone, two
  lines); H2 32px; sizes 48, 32, 18, 16, 13.5, plus the form's own 20 and 14; page 3,242px tall at 1440 (3.6 screens).
- Looked at twice at 1440 and at 390. The last cut of the copy (seven items down to five, shorter sentences) was
  checked through the capture's numbers only, not by eye.
- Every link target and image file exists (script check). All sixteen logos come from `../shared/logos/`.
- `impeccable detect`: 3 findings, all "cramped padding" on the edge-to-edge bands, whose content sits in `.wrap`
  (false positives).
- Taste inspector: 6 fails. Kept, as on the home: the sheets' shadow (the contract's one exception), the list
  rules, no photographs, no video. "Broken images" is the tool serving the folder without `../shared`. "Rows of
  icon cards" is the two lists with their ticks and half rings: the marks carry the state, so they stay.

## Not done

- No drawing of the ticks and half rings on entry (the home does it with GSAP; pages.js only has the entrance).
- Reduced motion and no-script were not captured: pages.js skips the entrances under reduced motion, and the CSS
  hides nothing.
- 768px wide was not looked at (the inspector reports two lines for the title there).
- No French version.
