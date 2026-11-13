# Papier v2: pricing.html, and the shared kit of the inner pages

## Files

- `pricing.html`: the page. Complete without script.
- `css/pages.css`: the kit shared by pricing.html, security.html and connectors.html (both already link it).
  `<body class="site page">`; `.ptop` (page top, H1 48px), `.pstage` (desk band joined to the top), `.psec` and
  `.psec__head` (white section, heading on columns 1 to 6, text on 7 to 12), `.pclose`, `.ptable`, `.qa`, `.tlink`.
- `js/pages.js`: shared, no dependency. The bar's line after 24px, the phone menu, the "not in this prototype"
  notice, and the home's section entrance on `[data-rv]` (20px, 70ms apart, once, off under reduced motion). It
  does not use GSAP or `js/motion/core.js`: one fade did not justify five scripts.

Nothing existing was edited.

## The page

1. Top: "A free pilot. / Then €25 per active user." The pink stroke on "A free pilot." is the same pink as "Free"
   in the table: what is true today is marked, the proposed price is not.
2. One comparison table lying as a sheet on the desk band. Four rows that differ (Price, Made for, Billing,
   Hosting), then "In every plan": six rows whose cell spans the three plans. No cards, no "recommended" badge.
   The three columns of words start on the page's grid lines 4, 7 and 10; the answers below start on line 7 too.
   Under 700px each row becomes a block with the plan's name beside its words (no sideways scroll).
3. Six questions and answers, all open (no accordion): question left, answer right.
4. Close: "Start with the pilot." and the two pills. Footer.

Copy: facts from `PLANS_EN`, `FAQ_EN` and `site.pricing` in `messages/en.json`. 478 words on the page, header and
footer included.

## Decisions to know about

- The table is a real `<table>` whose rows are laid out as CSS grids (to sit on the page grid), so every part
  carries its ARIA table role. Keep the roles if the markup is copied.
- Navigation and footer: Product and Developers go to `index.html#…`; Connectors, Security and Pricing go to the
  three pages; "What’s missing" goes to `security.html#in-progress`. security.html and connectors.html do not agree
  with each other on this yet: one pass should align the three headers.
- "Sign in" and "Create a workspace" are still `href="#"` with `title="Not in this prototype"`, as on the home.
  When signin.html and signup.html exist, replace them (6 links here).
- The price stays in euros, as on today's site. The market is USA and Israel: the currency is a product decision.
- Left out on purpose: the "30-day" length of the pilot (it is only in today's meta description, not in the plans),
  and the tool names inside "email" (Outlook, Gmail) in the answer about who sees what.
- "Billing: None. The pilot is free." and "By quote." are my wording of "Free" and "quoted to your requirements".
  "Hosting" for Pilot and Team reuses the home's sentence on row-level security.

## Checked

- Captures at 1440x900, 1280x800, 768x1024 and 390x844: no console error, fonts loaded (Schibsted Grotesk).
- Measured in the browser at the four widths: H1 48 / 48 / 41.5 / 31.2px on two lines; H2 32 (24 on the phone), one
  line; no sideways scroll; nothing under 13px; table text at 391, 732, 1074px and answers at 732px (grid lines
  390, 732, 1074) at 1440.
- Page height: 3,201px at 1440 (3.6 screens), 4,431px at 390.
- `impeccable detect`: three "cramped-padding" findings, all false (the wrap's margins and the cells' padding are
  not seen by the static scan).

## Not done, not checked

- Not checked with a screen reader (the grid-laid table with ARIA roles), nor in Safari or Firefox.
- The entrance was seen only through the capture tool's final state, not filmed.
- The href changes of the navigation were made after the last capture (no visual change).
- Inline links inside sentences are 20px tall on the phone (allowed for links in running text); every other target
  is 44px or more there.
- `css/pages.css` was rewritten once after security.html and connectors.html had started using it: `.psec__head
  .lead` moved from column 8 to column 7. Their authors should look once more at their heading rows.
