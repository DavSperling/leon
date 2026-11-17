# Port map: styles and kit (tokens, Tailwind setup, `src/components/verre/ui`, theme)

Worktree root: `/Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484` (all `src/...` paths below are relative to it).
Prototype root: `prototypes/refonte-2026-11/papier/` (`app/app.css`, `app/NOTES.md`, `css/tokens.css`, `css/ui.css`).
Everything here was read in full; counts are `grep` counts on this worktree (JSX occurrences outside `ui/`, then files).

---------------------------------------------------------------------------------------------------

## 0. The setup today (what the builders are standing on)

- Tailwind 4.3.3, CSS-first: there is NO `tailwind.config.*`. `postcss.config.mjs` is one line: `{ plugins: { '@tailwindcss/postcss': {} } }`. Next 16.4.2 runs with webpack (`pnpm dev` = `next dev --webpack`). Biome lints CSS too (`biome.json`: `css.parser.tailwindDirectives: true`), so every `!important` in CSS carries a `biome-ignore` comment (see `globals.css:294-310`).
- One global stylesheet, `src/app/globals.css` (834 lines), imported once by `src/app/layout.tsx:9`. It also styles the PUBLIC SITE and the auth pages (they share the tokens): `src/components/site/site.css` and `src/components/site/fx/fx.css` are loaded by `src/components/site/site-shell.tsx:8-9` and read the same variables (`var(--accent)`, `--logo-2`, `--line-strong`, `--hi`, `--float`, `--float-shadow`, `--ease-out`…) plus `[data-theme="light"|"dark"]` selectors (`site.css:49`, `fx.css:48-53`).
- Anatomy of `globals.css`:
  - `L2` `@import "tailwindcss"`.
  - `L5-7` `@theme { --color-*: initial; }` : Tailwind's default palette is REMOVED. Consequence: `bg-white`, `text-white`, `bg-black`, `bg-red-500` do not exist (`chips.tsx:97` says so and writes `bg-[#fff]`). Any colour a builder wants must be a token below or an arbitrary value.
  - `L9-17` `:root`: `--font`, `--mono`, `--ease-out/in/spring`, `--dur-enter` 220ms, `--dur-exit` 140ms.
  - `L19-69` `[data-theme="dark"]` token block; `L71-121` `[data-theme="light"]` token block. Same variable names in both. NOTHING is defined on `:root` for colours, so a page without `data-theme` has no colours.
  - `L124-183` `@theme inline`: maps variables to Tailwind colour names (`bg-bg`, `bg-glass`, `bg-glass-2`, `bg-glass-3`, `bg-panel`(=glass), `bg-float`, `bg-menu`, `bg-scrim`, `bg-hover`, `bg-ink`, `border-line`, `border-line-strong`, `text-fg`, `text-fg-2`, `text-muted`, `accent*`, `ring`, `mark-*`, `spot`, `logo-2`, `ok`, `success*`, `warning*`, `destructive*`, `info*`, `transparent`, `current`), fonts (`font-sans`, `font-mono`), radii (`rounded-panel` 26, `-box` 18, `-card` 16, `-field` 12, `-item` 10, `-chip` 7), shadows (`shadow-hi`, `shadow-panel`, `shadow-float`), eases.
  - `L186-188` `--breakpoint-shell: 861px` (utilities `shell:` x44 and `max-shell:` x13 in src).
  - `L191-208` type scale as `--text-*` (utilities `text-meta` … `text-h1`).
  - `L210-287` `@layer base` (border-color default `var(--line)`; `body` at `L221-233`: `font: 14px/1.5 var(--font)`, `letter-spacing:-0.01em`, bg/colour transition .4s; `:focus-visible` ring `L243`; `::selection` `L247`; `mark` `L251`; `code,kbd,samp` mono `L259`; thin scrollbars `L265-285`; placeholder colour `L282`).
  - `L289-312` reduced motion: `[data-motion="off"]` (the product's "Stop animations" switch, `src/lib/verre/instant.ts`) AND `@media (prefers-reduced-motion)`. KEEP BOTH (the prototype only has the media query).
  - `L315-816` `@layer components`: aurora/blobs/grain (L316-411), `.signal-line/.signal-glow` (L413-426), `.spot-host/.spot` (L428-452), `.beam*` (L454-516), `.sk/.sweep/.reading/.pulse/.spin/.caret/.caret-block/.word-in/.pop-in/.rise-in/.fade-in` (L518-648), Radix layers `.layer-pop/.layer-scrim/.layer-dialog/.layer-sheet/.layer-collapse` (L650-750), `.org-tree` (L752-815).
  - `L820-834` `@utility glass-panel` (blur 34px + gradient + inset highlight) and `@utility glass-float` (blur 28px).
- Merging helper: `src/lib/utils.ts:5-13` is `extendTailwindMerge` told the custom theme keys (`text: meta,label,ui,body,lead,title,h2,h1`; `radius: panel,box,card,field,item,chip`; `shadow: hi,panel,float`). `src/lib/verre/cn.ts` re-exports it, so all of `ui/` imports `@/lib/verre/cn`. TRAP: any NEW text-size / radius / shadow token name must be added to that list or `cn('text-ui','text-answer')` treats `text-answer` as a colour and drops the earlier colour class.
- Fonts (`src/app/layout.tsx:12-25`): `Manrope` variable (`--font-manrope`), `Geist_Mono` 400/500 (`--font-geist-mono`), `Inter` 500 (`--font-inter`, ONLY for the word "Leon" in `src/components/verre/shell/brand.tsx`). Class names are set on `<html>` at `layout.tsx:41`.
- Theme (see section 3): `<html data-theme="dark">` default (`layout.tsx:40`); inline script `THEME_SCRIPT` (`layout.tsx:29`) reads `localStorage['leon-theme']` else `prefers-color-scheme` and writes `data-theme`; also sets `data-motion="off"` from `localStorage['leon-motion']`. Hook `src/lib/verre/theme.ts` (`useTheme`, `setTheme`, `toggle`; SSR default 'dark').
- Icons: `lucide-react` 1.56 (stroke 1.6-1.8). Prototype icons: its own sprite, same 1.6 stroke, 18px (`.i`). Logos: `public/logos/*.svg` has the same 50 files as `prototypes/refonte-2026-11/shared/logos/` (incl. `pdf word excel powerpoint`). No logo work needed.
- The brand mark (`brand.tsx`) already equals the prototype's `MARK` path; nothing to change except colours (it uses `text-fg`, so it turns ink automatically).

---------------------------------------------------------------------------------------------------

## 1. Token-by-token map (current value -> prototype value, light only)

"Today (light)" is `globals.css:71-121` (the dark block is deleted, see section 3). "Proposed" is the value the CURRENT token name should take so that existing classes turn into the new look with no class edits.

### 1.1 Colour

| Role | Today token (class) | Today light value (uses) | Prototype token | Prototype value | Proposed action |
|---|---|---|---|---|---|
| Page ground (the desk) | `--bg` (`bg-bg`, html/body bg `L218,L223`) | `#eef0f4` | `--desk` | `#F1F1EE` | value change: `--bg:#F1F1EE`. Also add alias `--color-desk` |
| Sheet / card fill | `--glass` (`bg-glass` x49, `bg-panel` x2) | `rgba(255,255,255,.46)` | `--sheet` | `#FFFFFF` | value change to `#FFFFFF`. Add alias `--color-sheet` |
| Raised sheet | `--glass-2` (`bg-glass-2` x16: inputs, GlassCard raised, search preview) | `rgba(255,255,255,.62)` | `--sheet` | `#FFFFFF` | value change to `#FFFFFF` (glass and glass-2 collapse into one) |
| Quiet fill (secondary button, neutral badge, code line, kbd, inline code) | `--glass-3` (`bg-glass-3` x26) | `rgba(22,30,48,.035)` | `--n-50` (rows, kbd, statusrow, `.where`) / `--desk` (status pill) | `#F8F8F6` / `#F1F1EE` | value change to `#F8F8F6`; neutral Badge/status pill uses `--desk` explicitly |
| Floating layer fill | `--float` (`glass-float`, x8 lines) | `rgba(252,253,254,.86)` | `--sheet` | `#FFFFFF` | value `#FFFFFF`; and the `glass-float` utility loses its blur (3.3) |
| Menu / popover fill | `--menu` (`bg-menu` x6, `var(--menu)` x12) | `#fcfcfd` | `--sheet` | `#FFFFFF` | value `#FFFFFF` |
| Scrim | `--scrim` (`bg-scrim`) | `rgba(18,24,38,.16)` | `--scrim` | `rgba(15,15,13,.18)` | value change. Never a blur (`dialog.tsx:14` already has none) |
| Hover on a sheet | `--hover` (`bg-hover` x24) | `rgba(22,30,48,.04)` | `--n-50` | `#F8F8F6` | value `#F8F8F6`. NEW `--n-150 #E9E9E5` for "pressed" |
| Active row fill | `--ink` (`bg-ink` x6: `sidebar.tsx:60`, `settings-tabs.tsx:88`, `command-palette.tsx:321`, `equipe/index.tsx:96`, `equipe/org-chart.tsx:163`, `discussion/action-card.tsx:115`) | `rgba(255,255,255,.78)` | (selected row = `--desk`) | `#F1F1EE` | NAME CONFLICT: see 1.1a |
| Hairline | `--line` (`border-line` x93; global border-color `L215`) | `rgba(16,22,36,.08)` | `--line` | `#E2E2DC` | value change |
| Stronger hairline (fields, dashed empty, org tree) | `--line-strong` (`border-line-strong` x38) | `rgba(16,22,36,.14)` | `--line-strong` | `#C6C6BE` | value change |
| Inset top highlight | `--hi` (`shadow-hi` x17 + `var(--hi)` x15 + `inset_0_1px_0` arbitrary) | `rgba(255,255,255,.85)` | none (flat) | n/a | set `--hi: transparent`; and `--shadow-hi: 0 0 #0000` (1.3) |
| Text | `--text` (`text-fg` x229) | `#111622` | `--ink` | `#0F0F0D` | value change. Add alias `--color-ink` ONLY after resolving 1.1a |
| Secondary text | `--text-2` (`text-fg-2` x98) | `#353d4e` | `--ink-2` | `#5B5B55` | value `#5B5B55` (prototype has only two inks) |
| Captions / labels | `--muted` (`text-muted` x184) | `#515a6c` | `--ink-2` | `#5B5B55` | value `#5B5B55`. `fg-2` and `muted` become equal: fine, the prototype has no third ink |
| Icons at rest | no token (`[&_svg]:text-muted` on buttons/menus) | muted | `--n-500` | `#8B8B84` ("icons only, never text") | NEW token `--n-500`, optional utility `text-icon`; swap in `button.tsx` (secondary/quiet/ghost), `menu.tsx` ITEM, `Pill` |
| Primary action / links / focus | `--accent` (`bg-accent` x40, `text-accent` x66) | `#3b5aae` (blue) | `--ink` / ink pill | `#0F0F0D` | value `#0F0F0D`: every `primary` Button and `bg-accent` becomes the ink pill automatically (correct by the founder's rule). `text-accent` links become ink |
| Text on primary | `--accent-ink` | `#ffffff` | `#fff` | `#FFFFFF` | unchanged |
| Primary hover | none (`hover:brightness-[1.06]` in `button.tsx:21,27,99` and `search-bar.tsx:113`) | filter | `--ink-hover` | `#2B2B27` | brightness on near-black does nothing: NEW token `--accent-hover:#2B2B27`, use `hover:bg-accent-hover` |
| Tinted accent fill (selected/active pill, soft chips) | `--accent-soft` (`bg-accent-soft` x23) | `#e9eef9` | `--desk` (selected row) / ink fill (selected chip) | `#F1F1EE` | value `#F1F1EE`; chips that were "active" turn into ink fill by component (5) |
| Accent hairline | `--accent-line` | `rgba(59,90,174,.26)` | `--line-strong` | `#C6C6BE` | value change |
| Focus ring | `--ring` (`L244` outline 2px offset 2) | `rgba(59,90,174,.7)` | `outline 2px var(--ink) offset 2` | `#0F0F0D` | value `#0F0F0D` |
| Search-term highlight / selection | `--mark-bg` `#dbe3f4`, `--mark-ink` `#2c4596` (`mark` `L251`, `::selection` `L247`, `Highlighted`) | blue | `--m4` (default `.hl`), `::selection` = `--m3 #A6D2FF`, ink text | `#FFD48F` / `#A6D2FF` | `--mark-bg:#FFD48F; --mark-ink:#0F0F0D`; change `::selection` rule to `--m3`; drop the `box-shadow` underline on `mark` |
| Pointer glow | `--spot` | accent 7% | none | n/a | delete with `.spot` |
| Aurora | `--blob-1..4`, `--blob-o` | pastel blues | none | n/a | delete (3.2) |
| Logo teal | `--logo-2` (`var()` x6, mostly `site.css`) | `#2b8f84` | none | n/a | keep until the public site is ported (the site's gradient title uses it) |
| Switch thumb / checkbox box | `--thumb` `#ffffff`, `--box-line` `rgba(16,22,36,.5)` | | white / `--line-strong` | | `--box-line:#C6C6BE`→ prefer `--ink-2` for contrast on white; thumb unchanged |
| Skeleton shine | `--sk-hi` | white .7 | none | n/a | keep if skeletons stay, else delete |
| OK / success | `--ok` `#17946a`; `--success` `#0f7653`; `-soft` `#e2f3ec`; `-line` `rgba(15,118,83,.24)` (`text-success` x12) | green | `--ok` `#1F7A4D`; `--ok-tint` `rgba(31,122,77,.10)` | | value: `--ok:#1F7A4D; --success:#1F7A4D; --success-soft:rgba(31,122,77,.10); --success-line:rgba(31,122,77,.24)` |
| Error / destructive | `--destructive` `#b0373a`, `-ink` `#fff`, `-soft` `#f9e6e6`, `-line` `rgba(176,55,58,.24)` (`text-destructive` x19) | | `--danger` `#B42318`; `--danger-tint` `rgba(180,35,24,.07)`; `--danger-line` `rgba(180,35,24,.32)` | | value change to those |
| Warning | `--warning` `#8a5a06`, `-soft` `#f8eedb`, `-line` (`text-warning` x13, Notice x11) | amber-brown | NONE (amber exists only as highlighter m4/f4 and the `pill--work` fill) | | DESIGN DECISION. Recommended: keep `--warning:#8A5A06` as text; `--warning-soft: color-mix(in srgb, var(--f4) 18%, #fff)`; `-line: color-mix(in srgb, var(--f4) 60%, #fff)` (derived from the prototype's amber, no new hue) |
| Info | `--info` `#20628f`, `-soft` `#e2eef7` (`text-info` x2, Notice info x2) | blue | NONE | | Merge into neutral: `--info:var(--ink-2); --info-soft:#F8F8F6; --info-line:var(--line-strong)` |
| Neutral steps | none | | `--n-50 #F8F8F6`, `--n-150 #E9E9E5`, `--n-500 #8B8B84` | | NEW tokens (+ aliases `bg-n-50`, `bg-n-150`) |
| The four highlighters | none (one blue accent) | | `--m1..m4` `#FFB0D4 #A4F2BE #A6D2FF #FFD48F` (stroke, pastel avatar tint); `--d1..d4` `#FF8DC1 #72E6A3 #7FBFFF #FFC064` (deeper stroke when linked, the ask-bar strokes use d1,d2,d3); `--f1..f4` `#FF6FB0 #44D98A #5AAEFF #FFAD3D` (flag and number chip) | | NEW 12 tokens + aliases `bg-m1…`, `bg-d1…`, `bg-f1…`; helper classes `.c1…c4` / `.hl-1…4` set `--flag --hl --hl-deep` (`ui.css:107-110`), source n gets colour `((n-1) % 4)+1` |
| White | none (palette removed) | | `#fff` on ink | | NEW `--color-white:#FFFFFF` (needed by ink pill/toast/active chip: `text-white`) |

#### 1.1a The `--ink` name collision (must be settled first)
Today `--ink` = a translucent white used as the active-row fill (`bg-ink`, 6 uses listed above, plus `var(--ink)` x1). In the prototype `--ink` = the text/ink-pill colour `#0F0F0D`. Recommended: rename the current meaning to `--row-active` (`--color-row`) and update the 6 `bg-ink` files to `bg-desk` (selected row = desk, per `app.css:160`); then define `--ink:#0F0F0D` (alias `bg-ink text-white` = the ink pill, `text-ink`). Do this in the same commit as the token swap or `bg-ink` turns every active row black.

### 1.2 Radius

| Role | Today token (class, uses) | Today | Prototype | Proposed |
|---|---|---|---|---|
| Sheets, cards, panel, sidebar, menu, dialog, toast box | `--radius-panel` 26 (`rounded-panel` x5), `--radius-box` 18 (`rounded-box` x17), `--radius-card` 16 (`rounded-card` x10) | 26/18/16 | `--r-l` 12 | set all three to `12px` (names stay; later builders write `rounded-card`) |
| Fields (inputs, select, textarea, code line) | `--radius-field` 12 (`rounded-field` x46: ALSO used for sidebar rows, tabs, preview boxes) | 12 | `--r-s` 6 for fields; `--r-m` 8 for rows | set `--radius-field:6px`; the ~10-15 row uses (`sidebar.tsx:60`, `settings-tabs.tsx:88`, `equipe/index.tsx`, `command-palette` etc.) become `rounded-item` (8) in the component rewrites. Audit with `grep -rn "rounded-field" src` |
| Rows inside a sheet, initials | `--radius-item` 10 (x4) | 10 | `--r-m` 8 | `8px` |
| Small chips, keys, logo box | `--radius-chip` 7 (x8) | 7 | `--r-s` 6 | `6px` |
| Highlighter strokes, number chips, flag chips | none | | `--r-mark` 3 | NEW `--radius-mark:3px` (+ add `mark` to `utils.ts` radius list) |
| Buttons, chips, status pill, toast, search | `rounded-full` x41 | 999 | `--r-pill` 999 | unchanged. EXCEPTION: avatars/initials are rounded SQUARES (`--r-m` 8, 24px = `--r-s`), not circles |
| Hard-coded | `rounded-[Npx]` x10, `rounded-sm/md/lg/xl` x12 in `src/components/verre` + `src/app` (e.g. dialog `rounded-[20px]` `dialog.tsx:16`, sheet `rounded-t-[24px]` `dialog.tsx:224`) | >12 | max 12 ("a radius above 12px" is forbidden, NOTES "Never") | rewrite to the tokens |

### 1.3 Shadow

| Role | Today | Prototype |
|---|---|---|
| Card at rest | `--shadow-hi` `inset 0 1px 0 var(--hi)` (`shadow-hi` x17: GlassCard `surfaces.tsx:42`, every input `form.tsx:83`, preview aside) | `--sh-1` `0 1px 0 rgba(15,15,13,.04), 0 2px 4px -2px rgba(15,15,13,.07)` |
| Panel resting on desk | `--shadow-panel` `inset hi + var(--shadow)` (light `0 30px 60px -36px rgba(25,35,65,.26)`; `shadow-panel` x3: `(onboarding)/layout.tsx:27` etc.) | `--sh-2` `0 1px 0 rgba(15,15,13,.05), 0 14px 26px -16px rgba(15,15,13,.24)` (pointed-at card, sidebar, ask bar hover) |
| Floating (menu, dialog, toast, command bar, side panel) | `--shadow-float` `var(--float-shadow) + inset hi` (`shadow-float` x9; light `0 30px 70px -24px rgba(25,35,65,.32), 0 2px 8px rgba(25,35,65,.06)`) | `--sh-3` `0 1px 0 rgba(15,15,13,.05), 0 8px 16px -8px rgba(15,15,13,.12), 0 28px 56px -20px rgba(15,15,13,.32)` |

Proposed: in `@theme inline` set `--shadow-hi: var(--sh-1)`?? NO for inputs: the prototype field has no shadow. So: `--shadow-hi: 0 0 #0000` (kills it on inputs and anywhere else), add NEW `--shadow-sheet: var(--sh-1)` (GlassCard/Sheet/cards), `--shadow-panel: var(--sh-2)`, `--shadow-float: var(--sh-3)`; add `sheet` to the `utils.ts` shadow list. Arbitrary `shadow-[inset_0_0_0_1px_var(--…)]` rings (Badge, Notice, Spinner, EmptyState icon, Kbd…) are not shadows in the prototype (borders): rewrite per component (about 15 occurrences, `grep -rn "shadow-\[inset" src`).

### 1.4 Type

Prototype family: Schibsted Grotesk 400/500/600 (loaded 400-700 in the prototype HTML), STIX Two Text 400 + italic ONLY for the words of an original document (16px). Today: Manrope variable, Geist Mono, Inter (logo only). Prototype forbids monospace outside real code (`NOTES` "Never").

| Role | Today (`--text-*`, uses) | Prototype | Proposed value for the current name |
|---|---|---|---|
| Meta/mono counters | `text-meta` 11.5/1.4 (x18) | min 13 | `13px / 1.4` (counters and dates are being removed from rectangles anyway) |
| Labels, captions, pills, chips | `text-label` 12.5/1.45 (x98) | `--fs-1` 13 (captions, pills, labels) | `13px / 1.45` |
| Interface | `text-ui` 13.5/1.45 (x95) | `--fs-2` 14 | `14px / 1.45` |
| Body | `text-body` 14/1.55 (x42) | `--fs-2` 14 | `14px / 1.5` |
| Lead / card name / panel text | `text-lead` 15.5/1.65 (x6) | `--fs-3` 15 | `15px / 1.5` |
| Empty-state title, markdown h3 | `text-title` 16.5/1.35 (x9) | `--fs-3` 15 (600) | `15px / 1.3` |
| Section head, Leon's answer | `text-h2` 21/1.25 (x9) | `--fs-4` 18 (head 600, `-.012em`; answer 18/1.6) | `18px / 1.2`; NEW `--text-answer: 18px/1.6` (+ add `answer` to `utils.ts` text list) |
| Page title | `text-h1` 30/1.15 (x17; `PageHeader` uses `font-bold tracking-[-0.03em]`, `max-sm:text-[26px]`) | `--fs-5` 28, `32px` line-height, 600, `-.022em`; 26 under 600px | `28px / 32px` (`text-h1--line-height: 32px`); `PageHeader` must drop `font-bold` for `font-semibold` and tracking `-0.022em` |
| Panel title | `dialog.tsx:18` `text-[17px]` | `1.25rem` 20 / 1.25, 600, `-.015em` (`app.css:374`) | NEW `--text-panel: 20px/1.25` |
| Ask bar / command bar input | n/a | `--fs-3` 15 | `text-lead` |
| Brand | `brand.tsx` Inter wordmark | `1.0625rem` 600 sans | keep Inter wordmark (logo v2 was a founder choice, memory 03/11) |
| Original document | none (all sans) | `--serif` 16px/1.45 in `.doc__body .tx__text .msg p .mini__passage`; `.doc__meta` 13 ink-2 | NEW `--font-serif` + `font-serif` utility (`@theme inline`) |
| Arbitrary sizes | `text-[Npx]` x54 in `verre` + `app` (11, 11.5, 12, 12.5 …) | 13 minimum | audit every `text-[1x px]` below 13; map to `text-label` |
| Body letter-spacing | `letter-spacing:-0.01em` on body (`L226`) | none on body; only on titles | delete from `body`; keep on h1/h2/names (`-.022em`, `-.012em`, `-.003em`) |
| Weights | 400-800 (`font-bold` on h1) | 400, 500, 600 only | replace `font-bold`/`font-extrabold`: `grep -rn "font-bold\|font-extrabold" src` |
| Body font size/leading | `14px/1.5` | `400 14px/1.45` | `14px/1.45` |

Fonts to load (`layout.tsx`): replace `Manrope` by `Schibsted_Grotesk({ subsets:['latin'], weight:['400','500','600'], display:'swap', variable:'--font-schibsted' })`; add `STIX_Two_Text({ subsets:['latin'], weight:'400', style:['normal','italic'], display:'swap', variable:'--font-stix' })`; keep `Geist_Mono` (code only) and `Inter` (logo). Update `globals.css:10` `--font: var(--font-schibsted), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` and add `--serif: var(--font-stix), "Iowan Old Style", Georgia, serif`. Update the three font classes on `<html>` (`layout.tsx:41`).

### 1.5 Spacing and layout

Prototype spacing is on a 4px grid and equals Tailwind's default `--spacing` (0.25rem): 8=`gap-2`, 12=`gap-3` (between rectangles), 16=`p-4` (inside a card), 24=`p-6`/`mt-6` (inside a sheet, title to first section), 40=`mt-10` (between sections). Tailwind default spacing stays; do not override. New layout tokens to add as plain CSS variables (not Tailwind theme): `--inset` 12 (8 under 900px), `--side-w` 256 (today 248, `app-shell.tsx:85`, `sidebar.tsx`), `--rail-w` 60 (today 64), `--gut` 32 (16 under 900px) (today `shell:px-8` = 32 already), page max `1348px` (today `max-w-[1240px]`, collapsed `1424px`, `app-shell.tsx`), `--top-h` 76 (64 under 900px), grid `repeat(auto-fill,minmax(284px,1fr))` gap 12, `.grid--3` `minmax(max(300px,(100% - 24px)/3),1fr)`; card 88px, tile 52px. Breakpoint: `--breakpoint-shell: 861px` (`globals.css:187`) -> `900px` (prototype drawer under 900px, `app.css:446`, one column under 600px). One-line value change; the 44 `shell:` and 13 `max-shell:` usages follow. The app shell geometry itself (sticky ask bar `.top`, document scroll, `.page`) belongs to the shell map.

### 1.6 Motion

| Role | Today | Prototype |
|---|---|---|
| Standard ease | `--ease-out` `cubic-bezier(.16,1,.3,1)`, `--ease-in` `(.4,0,1,1)` | `--ease` `cubic-bezier(.2,.7,.2,1)` |
| Spring overshoot | `--ease-spring` `(.34,1.4,.64,1)` (`ease-spring` x3: Checkbox tick `form.tsx:212`, Switch thumb `form.tsx:288`, CitationChip `chips.tsx:49`, `.pop-in` `globals.css:626`) | none in the app ("nothing bounces"); `--ease-flag (.34,1.56,.64,1)` exists ONLY in the marketing `ui.css` for flags |
| Durations | `--dur-enter` 220, `--dur-exit` 140, many ad-hoc 150-600ms; dialog enter 260, sheet 320/180 | `--fast` 150, `--med` 220, `--work` 1300 (a simulated call) |
| Loops | aurora drift 22-34s infinite, `.beam` 3.2s, `.sk` shimmer 1.3s infinite, `.spin` .7s, `.caret` blink / `.caret-block` breathe, `.reading` sweep infinite | "Nothing loops, nothing bounces": one-shot `sweep` (scaleX 0->1) |

Proposed: keep variable names, change values: `--ease-out: cubic-bezier(.2,.7,.2,1)`, `--ease-spring: cubic-bezier(.2,.7,.2,1)` (kills the bounce in the 4 uses with no edit), `--dur-enter: 220ms`, `--dur-exit: 150ms`; ADD `--fast:150ms; --med:220ms; --work:1300ms`. Reduced motion needs no change.

---------------------------------------------------------------------------------------------------

## 2. Kit piece by piece: prototype -> existing component -> work

Existing kit lives in `src/components/verre/ui/` (17 files, 2,174 lines), re-exported from `ui/index.ts` and `src/components/verre/index.ts`; 40 files import `@/components/verre` or `/ui`. Usage = JSX occurrences outside `ui/` (files).

### 2.1 Existing components, their props, and what the prototype wants

**`Button`** `ui/button.tsx:50` (102 JSX / 39 files) + **`IconButton`** `:113` (11 / 10)
- Props: `variant: 'primary'|'secondary'|'quiet'|'ghost'|'destructive'|'link'` (default `secondary`), `size: 'sm'|'md'|'lg'` (h-8 / h-9 / h-10), `icon: LucideIcon`, `loading` (spinner + `aria-busy` + `aria-disabled`, click swallowed so focus stays), `asChild` (Radix Slot). Tailwind `BASE` `:15`, `VARIANTS` `:19`, `SIZES` `:30`. Observed: variant primary x28, secondary x9 (+37 with no variant = secondary), ghost x14, quiet x8, link x6, destructive x2 (+`variant={tone}` in AlertDialog); size sm x26, lg x13. `IconButton`: `label` (required, tooltip + aria-label), `variant ghost|secondary|primary`, sizes sm 28 / md 34 / lg 40.
- Prototype: `.btn` ink pill 36px, 14/500, radius pill (`app.css:63`); `.btn--line` sheet fill + `--line-strong` border, hover `n-50` + ink border (`:67`); `.btn--quiet` borderless `ink-2`, hover desk (`:69`); `.btn--danger` outlined danger, ONLY inside a confirmation (`:71`); `.btn--xs` 28 (on a card/row), `.btn--sm` 32; `.iconbtn` 32px `--r-m` not round (`:74`); `.linkbtn` underlined (`:399`); disabled `opacity .6; cursor: progress` (`:73`); 44px for `.btn,.chip,.iconbtn,.field` under 900px (`:455-459`).
- Work (restyle, same file, same API):
  - `primary` -> ink pill (free via `--accent` = ink; replace `hover:brightness` with `hover:bg-accent-hover`; drop the inset white highlight shadow). `secondary` -> `.btn--line` (`border-line-strong bg-sheet text-fg hover:bg-n-50 hover:border-fg`). `quiet` -> today means "thin outlined, repeated per row"; prototype per-row action is `.btn--line` `--xs`, and the prototype's `.btn--quiet` is borderless (= today's `ghost`): map `ghost`+`quiet` -> borderless quiet; add `size 'xs'` (28). `destructive` -> outlined danger (`border-danger-line text-destructive hover:bg-destructive-soft`), documented "only inside a confirmation": today's 2 direct uses + AlertDialog tone must be reviewed. `link` -> underline ink. `lg` (13 uses) -> collapse to `md` 36 (prototype has no 40).
  - States kept: `loading`/`aria-busy`/`aria-disabled`. Prototype working state = label becomes "Saving…" then "Saved" for 1.6s (`Leon.busy/done`) and the highlighter `.work` runs along the panel foot; real calls have unknown length: keep `loading` prop but replace the rotating `.spin` (a loop) by the label verb + `.work` stroke (see 3.2 gaps). `disabled` -> `opacity .6`.
  - ONE ink pill per view: audit the 28 `primary` uses so each view has at most one; demote the rest to `secondary`.
  - `IconButton`: `size-8 rounded-item`; `variant primary` (ink) probably unused in the new look.

**`Badge`** `ui/badge.tsx:23` (13 / 7). Props `tone: neutral|accent|success|warning|destructive|info`, `icon`, `mono`. Observed tones: accent x4, neutral x1 (rest default). Prototype counterpart: status pill `.pill` (24px, desk bg, 6px dot: ok green / `pill--err` danger tint / `pill--work` m4 sweeping fill), "In a panel, never on a card". Work: restyle Badge into the status pill: dot instead of icon, tones `neutral|ok|err|work` (map `success`->ok, `destructive`->err, `warning`->work/amber, `accent`/`info`->neutral), drop `mono` and the inset ring shadows, remove every Badge sitting on a card (carte.tsx, results list) - the rectangle shows at most one quiet caption. New helper component `StatusPill({ tone, children })` can simply be Badge renamed.

**`Pill`** `ui/pill.tsx:28` (13 / 7). Props `variant: default|active|warning`, `icon`, `chevron` (rotates on `data-state=open`/`aria-expanded`), `removable` (cross), `asChild`. Used as filter chips/menu triggers. Prototype counterpart: `.chip` family chip (32px, sheet, line, pill; `aria-pressed=true` = ink fill + white text; one pressed at a time; `data-chips` group with `leon:chip` event), 44px on phone. Work: `active` -> ink fill (`bg-ink text-white border-ink`, key it also on `aria-pressed="true"`), `default` -> sheet/line, hover border ink; `warning` -> drop or map to danger-tint; keep `chevron`/`removable`. New tiny `Chips` group wrapper (role=group, mobile horizontal scroll `margin-inline:-gut`) is optional.

**`GlassCard`** `ui/surfaces.tsx:31` (38 / 27) + `Spotlight` `:65` (0) + `trackSpot` `:11` (2 call sites: `discussions/list.tsx:8,55`) + `Beam` `:90` (3: `recherche/search-bar.tsx:64`, `connexions/tool-dialog.tsx:191`, site `hero-demo.tsx:197`). `GlassCard` props: `variant panel|raised` (raised x3), `signal` (x1: `discussions/about-suggestion-card.tsx:75`), `spotlight`, `reading`. Prototype counterpart: `.paper` (sheet, line, `--r-l`, `--sh-1`, 24/28 padding, "never one inside another") and the flat `.sheet`. Work: `GlassCard` becomes `Sheet`/`Paper` (flat white, `border-line rounded-card shadow-sheet`); keep the name `GlassCard` as an alias for the 27 files to avoid a mass edit, remove `signal`/`spotlight`/`reading` props (3 call sites) and the `Spotlight`/`trackSpot`/`Beam` exports. The "reading" signal becomes the highlighter `.reading` (2.3).

**`PageHeader`** `ui/layout.tsx:16` (8 / 8). Props `title`, `subtitle`, `actions`, `meta`, `className`. Prototype `.head`: `h1` 28/32 + the view's one ink pill on the right, 32px high, nothing under the title (rule 1: no sentence, no sub-title). Work: keep `title` + `actions`; stop rendering `subtitle` and `meta` (remove them from the 8 callers and their i18n keys in `messages/*.json` as an end clean-up); `mb-8` -> margin handled by the next `Section` (`.head + .sec` = 24px). `font-bold` -> 600.

**`Section`** `ui/layout.tsx:51` (26 / 17). Props `title`, `description`, `actions`, `id`, `className`, `children`; `mt-10 first:mt-0`. Prototype `.sec` (40px between sections) + `.sec__head`: h2 18/600 + FLAG `.tag.cN` (22px high, notch, counts the things below) + `.sec__tools` pushed right (search/chips). Work: drop `description`; add `count?: number` and `tone?: 1|2|3|4` props that render the new `Flag`/`Tag` (new small component, see 2.2); `actions` stays right-aligned (= `sec__tools`). Spacing `mb-4` -> 12px.

**`Field` / `Input` / `Textarea` / `Select`** `ui/form.tsx` (Field `:47` 42 / 18; Input `:87` 31 / 13; Textarea `:98` 6 / 6; Select `:153` 13 / 8). `Field` props `label, help, error, aside, id, className`; error is a NEW `role="alert"` `<p>` keyed `erreur` so it is announced; context gives `id`, `aria-describedby`, `aria-invalid` to the control. `CONTROL` string (`:82`): `rounded-field border-line-strong bg-glass-2 text-body shadow-hi`, focus: accent border + `0 0 0 3px accent-soft` halo, 16px on coarse pointers. Prototype: `.label` 13/500 ink above (mb 6), `.field` 40px `--r-s`, padding 12, `--sheet`, `--line-strong`, hover border `ink-2`, focus border ink + 2px ink outline offset 2, `aria-invalid` danger border, `.field-error` 13/500 danger under the field, `.hint` 13 ink-2. Work: restyle `CONTROL` (no shadow, `rounded-field`=6 after 1.2, `bg-glass`=white, focus = ring ink, remove the `3px accent-soft` halo), `Field` label `text-label font-semibold text-fg-2` -> `text-label font-medium text-fg`; error text `text-destructive` stays; help line stays but each caller should keep it to one plain sentence beside a technical thing. 44px on phones. `Select` list = `.menu` style (2.5). Search variant (`.search`): see 2.2.

**`Checkbox`/`CheckboxBox`** `form.tsx:202/234` (2 / 2), **`Switch`** `:277` (2 / 2). No prototype counterpart in `app.css` (the `.switch` in `ui.css:343` is the marketing toggle). Work: checked = ink fill + white tick, border `--line-strong`/ink-2, no spring (3.2); Switch track `line-strong` -> ink when on, white thumb.

**`Notice`** `ui/feedback.tsx:144` (46 / 25: error x19, warning x11, success x10, info x2). Props `tone neutral|info|success|warning|error`, `icon`, `children`, `action` (element or `{label,onClick,icon}`), `live alert|status`. No prototype piece (the prototype shows refusals under the field, a `.pill--err`, the sidebar `.alert` line with a danger dot, `.where` n-50 notes, `.statusrow`). Work (design call, recommend): flat row, no tinted icon square: `rounded-item`, `bg-glass-3` (n-50) for neutral/info/success, `bg-destructive-soft border-destructive-line` for error, `bg-warning-soft` for warning; a 6px dot (ok/danger/amber/ink-2) instead of the lucide icon; text ink 14px; keep `live`/`action`. Because there are 46 uses, keep the API exactly.

**`EmptyState`** `feedback.tsx:67` (13 / 10). Props `icon`, `title`, `description`, `action`, `bare`, `className`. Prototype `.empty`: dashed `--line-strong` border, `--r-l`, left aligned, padding 28/28/28/32, `h3` 15/600 + `p` ink-2 one short line, optional `.btn--line .btn--sm` only when the view has no ink pill. Work: drop `icon` rendering (no icons in tinted squares), drop `bare` centring, left-align, dashed border; keep props for source compatibility but ignore `icon`.

**`Skeleton` / `SkeletonText` / `PageSkeleton`** `feedback.tsx:15/20/38` (6+1+1; used by `(app)/loading.tsx`, `discussions/preview.tsx`, `recherche/preview.tsx`, `recherche/answer.tsx`, site `hero-demo.tsx`). No prototype counterpart (prototype never shows a skeleton; it shows "Reading…" with the highlighter or the `.work` stroke). Work: restyle `.sk` as flat `--desk` blocks with NO shimmer (or one-shot), `PageSkeleton` to head + two card rows; the infinite `sweep` is a loop (3.2).

**`Kbd`/`useModKey`** `ui/kbd.tsx` (7 / 3; `useModKey` x1). Today `h-[18px]` mono 10.5, glass-3. Prototype `kbd` 24px high, min 24, `border-bottom-width:2px`, `--n-50` fill, SANS 13/500, ink-2 (`app.css:90`). Work: restyle, remove `font-mono`.

**`Dialog` / `DialogContent` / `DialogFooter` / `AlertDialog` / `Sheet` / `SheetContent`** `ui/dialog.tsx` (Dialog x7 / 6 files: `reglages/members.tsx:278,331`, `create-token.tsx:48`, `delete-account.tsx:71`, `groups.tsx:177`, `connexions/tool-dialog.tsx:683`, `onboarding/teammates-step.tsx:198`; AlertDialog x5: `tokens.tsx:219`, `members.tsx:237`, `groups.tsx:101`, `discussions/list.tsx:88`, `tool-dialog.tsx:492`; SheetContent x4: `recherche/preview.tsx:210`, `discussions/preview.tsx:250`, `shell/mobile-bar.tsx:60`, site `site-header.tsx:122`). `DialogContent` props `title, description, hideClose, dismissible, size sm|md|lg` (420/520/640); `PANEL` `:15`: `glass-float signal-line rounded-[20px] shadow-float`, `layer-dialog` enter 260ms with blur; scrim `bg-scrim`; `useReturnFocus` hook `:28` returns focus to the opener even without a trigger (KEEP, reuse in the panel). `AlertDialog` props `trigger, open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, tone destructive|primary`; focus on Cancel. `SheetContent`: bottom sheet `layer-sheet`, 88dvh, grabber, `backdrop-blur-[28px]`.
- Prototype: NO dialog of its own ("Never: a dialog of your own"). Everything about one thing opens in the 520px side panel (2.2 `SidePanel`); a confirmation replaces the panel foot (2.2). `.cmd` (command bar) is the only centred dialog; `dialog.bsheet` bottom sheet exists in the MARKETING `ui.css:364` only.
- Work: (a) Dialog opened for "a thing" (tool `tool-dialog.tsx`, member `members.tsx:331`, token `create-token.tsx`) -> new `SidePanel` (see map of the connections/team/settings areas); (b) keep a restyled small `Dialog` for forms that are not a thing (delete account, create group, invite) OR route them to the panel too (prototype does: invite, SSO, password, 2-step, token creation all live in the panel): recommend converting all to `SidePanel`, keeping `Dialog`/`AlertDialog` exported until the last caller moves; (c) restyle remaining ones: `bg-menu` sheet, `border-line`, `rounded-card` (12), `shadow-float` (= sh-3), remove `glass-float`, `signal-line`, `blur(4px)` in `dialog-enter`; scrim stays a plain tint. (d) `AlertDialog` stays for a row that is not in a panel (`discussions/list.tsx:88`, `groups.tsx:101`, `members.tsx:237`, `tokens.tsx:219`): small `rounded-card` sheet, destructive button outlined danger. (e) `SheetContent` (mobile): plain white `rounded-t-card`, no `backdrop-blur`.

**`DropdownMenu*`, `Popover*`, `Tooltip`** `ui/menu.tsx` (DropdownMenu x2 in 2 files = `shell/workspace-menu.tsx`, `connexions/catalogue.tsx`; Popover x0; Tooltip x8 / 5). `LAYER` `:9` `rounded-card border-line-strong bg-menu shadow-float`; `ITEM` `:45` 34px rows `rounded-item` hover `bg-hover`, keyboard ring `inset 0 0 0 2px var(--ring)`; mono `meta`. Prototype `.menu`: popover 248px, sheet, line, `--r-l`, `--sh-3`; `.menu__item` 34px `--r-m`, hover `n-50`, icons `n-500`, trailing text 13 ink-2 (SANS). Tooltip prototype = ink pill-ish label (`.is-rail [data-tip]::after`: ink bg, `#fff`, 13/500, `--r-s`, 6/9 padding). Work: restyle only (value changes cover most); remove `font-mono` on `meta`; Tooltip -> `bg-ink text-white rounded-chip text-label`.

**`Toaster` / `toast`** `ui/toast.tsx` (`<Toaster/>` mounted once `layout.tsx:53`; 33 `toast(...)/.success/.error/.dismiss` call sites). sonner, `position="bottom-right"`, `visibleToasts 3`, 4s (errors 8s), lucide icons per kind, `glass-float rounded-card border-line-strong` classes, `theme={useTheme().theme}`. Prototype `.toast`: ink pill, `#fff` 14/500, padding 11/16, `--sh-3`, bottom-centre, one line, top layer popover (so it lies above an open panel), `toast-in` 8px rise 220ms / out 150ms. Work: set classNames `rounded-full bg-ink text-white px-4 py-[11px] text-ui font-medium shadow-float`, `position="bottom-center"`, drop `useTheme`/`theme` (light only), drop the 3 coloured icons (an error toast gets a 6px `bg-destructive` dot, optional); sonner's z-index already tops the Radix layers. Rule of use (prototype): toast only for what happened elsewhere on the page; what is visible in place says it in place (e.g. `CopyButton` below). Keep the API unchanged.

**`CopyButton` / `CodeLine`** `ui/copy.tsx` (9 / 8; 10 / 6). `CopyButton`: `value, label, copiedMessage, size, variant, onCopied`; on success swaps the icon to a check for 1.6s AND fires `toast.success`; on failure `toast.error(t('copyFailed'))`. Prototype: `data-copy` button says "Copied" in place for 1.6s, no toast. Work: label -> `common.copied` in place; keep the failure toast; drop the success toast (or keep for `copiedMessage` cases that say where to paste). `CodeLine`: real code, mono stays (`font-mono`), box `rounded-field border-line bg-glass-3` -> `rounded-item bg-n-50`.

**`CitationChip`, `ToolIcon`, `SourceChip`, `SourceLink`** `ui/chips.tsx` (2 / 2; 10 / 5; 4 / 4; 3 / 3; test `chips.test.ts`). `CitationChip` (`n, label, active, animate`, link or button; `CHIP` `:45`: accent-soft round, mono 11px, `pop-in`). Prototype `.cite` (button after a sentence: 19px high, min 20, colour `--flag` of source n, ink text, sans 13/600 tabular, `--r-mark` 3, raised -.28em, hover outline `rgba(15,15,13,.45)`, `aria-pressed` outline ink, 44px hit area on phones) and `.num` (label, not a button). Work: CitationChip takes a `colour` (1-4) and renders `.cite c{n}` (colour = `((n-1)%4)+1`); no spring/pop. `ToolIcon` (logo of the tool on a white 16px box, or a lucide channel icon): prototype logos are bare `<img class="logo">` at 36 (card) / 28 (tile) / 44 (panel head) / 18 (command bar), no box; capture channels without an SVG (codex, antigravity, chatgpt, claude_ai, mcp_remember, interface, other) need a neutral fallback tile (`--desk` square `rounded-item`, `n-500` icon): GAP, prototype has none. `SourceChip` (icon + "Tool · Type · Author · date") carries a date/author: allowed only inside a panel/facts, never on a rectangle. `SourceLink` ("Open in X", new tab) -> `.btn--line` with the `out` icon in a panel foot (`data-ext` wording is a prototype artefact; keep the real link).

**`CitedText` / `CitedMarkdown` / `Highlighted`** `ui/text.tsx` (CitedMarkdown 2 / 1 file, CitedText 1 / 1, Highlighted 1 / 1; consumers `recherche/answer.tsx`, `discussions/messages.tsx`, results list). `CitedText` splits text into runs and glues `[n]` chips to the word before and punctuation after (`citedRuns`, `console.assert` self-test). `Highlighted` renders `<mark>` for U+E000..U+E001 snippets. Prototype answer: each sentence under the highlighter of its source (`.seg[data-n] > .hl.hl-N`, two strokes per sentence `.hl--a` + `.hl--b` carrying the number, `box-decoration-break: clone`), `.nosrc` dashed "no source" tag after a sentence nothing supports, `.answer` 18/1.6 max 76ch, arrives once (`.is-arriving` + `@property --sweep` from 0 to 1 over 900ms), `Leon.arrive`. Work: in `CitedText`, wrap the run before a ref group in `<span className="seg hl hl-N">` (colour of the first ref), keep the chip glued; sentences with no ref get `.nosrc`; port `.hl`, `.hl--a/--b`, `.is-sweep` rules and `@property --sweep` into the components layer (`ui.css:112-136`, `app.css:6,433-441`). `Highlighted` (`<mark>`) keeps meaning "your search words": restyle `mark` to m4 stroke. NOTE the real answer arrives as a stream (`recherche/answer.tsx` state `flux`, `caret-block`): a stream cannot "arrive once"; recommended: strokes appear per sentence as each ref arrives (no sweep), no caret; gap listed in section 6.

**`Pagination`** `ui/pagination.tsx:26` (1 / 1: search results). No prototype piece. Restyle links as `.btn--line .btn--sm`-like pills, ink-2 page counter.

**`Collapsible*`** `dialog.tsx:255-263` (4 / 3: "ou coller une clé"). Prototype forbids "a detail unfolding under a row" but this is a form fold; keep, restyle chevron only; `.layer-collapse` animation stays (fade + 4px, no height).

### 2.2 Prototype pieces with no good existing component (NEW), with the nearest real thing

| Prototype piece (markup source) | Real counterpart today | Plan |
|---|---|---|
| Page head `.head` (`app.css:252`) | `PageHeader` | restyle (2.1) |
| Section head with flag `.sec__head` + `.tag.cN` (`:97,259`) | `Section` | add `count`/`tone` props; NEW `Flag` (22px tall, clip-path notch 8px, `--flag` colour, ink text 13/600 tabular, `.nav__tag` hangs `-27px` outside the sidebar sheet) |
| Card 88px / tile 52px `.tl .card/.tile` (`:267-296`): whole rectangle is the control; logo/av 36 (28) + `tl__name` 15/600 (14/600) + one `tl__sub` 13 ink-2 + chevron 16 or a 28px `btn--xs` pill; `is-err`: caption danger + 8px danger dot on the logo; `num` source number before the logo; `hl` hover highlighter under the name in colour n; hover lifts 1px + `--sh-2` | no kit piece. Today: bespoke cards in `connexions/carte.tsx` (GlassCard based), `documents/index.tsx:81`, `equipe/index.tsx`, `recherche/results.tsx`, `discussions/list.tsx` | NEW `ui/thing.tsx`: `Thing({ size:'card'|'tile', logo?|av?, name, sub?, err?, pill?, ink?, num?, hl?, href?, label, children?, asChild })`. Renders `<li><button|a class="tl card|tile">`. `.tl` rules go to the components layer (2.4). Counts/dates/sizes are removed from callers |
| Grid `.grid` / `.grid--3` (`:265`) | ad-hoc `grid` classes | classes in components layer or utility `grid-cols-[repeat(auto-fill,minmax(284px,1fr))]` |
| Chips `.chip` + group (`:305`) | `Pill` | restyle (2.1) |
| Search `.search` (pill field 36px, `kbd` "/" hidden on focus/filled, `data-slash` focuses on "/") | `Input` + `Kbd`; `connexions/catalogue.tsx:183` hand-rolled `h-10 rounded-field`; `shell/palette-context` `focusSearchBar()` for the Search page | NEW `SearchField` (Input pill variant + Kbd); a `/` shortcut hook is new (GAP: the app has only ⌘K) |
| Fields + errors `.field/.label/.field-error/.hint` | `Field`/`Input`/`Select` | restyle (2.1) |
| Buttons `.btn*`, `.iconbtn`, `.linkbtn` | `Button`/`IconButton` | restyle (2.1) |
| Status pill `.pill` | `Badge` | restyle (2.1) |
| Initials `.av` (32, 28 tile, 36 card, 44 panel, `av--s` 24; tint `m1..m4` per person, stable; `.avs` overlapping group) (`:105-112`) | none (people appear with initials text in `equipe/*`, `reglages/members.tsx`, `shell/workspace-menu` `initialOf`) | NEW `Initials({ name, size })` + `tintOf(name)` (stable hash -> 1..4); rounded SQUARE `--r-m`, 600 13px ink |
| Side panel `.panel` (`:361-407`): fixed, inset 12, 520px (`min(520px, 100vw-24px)`), full height, `--r-l`, `--sh-3`; head (44px logo/av + 20px title + quiet sub + close), scroll body (24px padding), foot (buttons, `.push` right, `.panel__note`), `.work` stroke on the foot top edge while working, `facts` dl rows (128px label column, 14px 0 padding, hairlines), `statusrow` (n-50, pill + "Sync now"), `.where` note, `.done` block, `.form` grid gap 14; opening another thing from a click beside the panel redraws it; Esc/outside close; focus returns to what opened it (`back`) | `connexions/tool-dialog.tsx` (Dialog 683), `reglages/members.tsx`, `create-token.tsx`, `recherche/preview.tsx` (`PreviewPane` aside + Sheet), `discussions/preview.tsx` | NEW `ui/side-panel.tsx` built on Radix `Dialog` (reuse `useReturnFocus` from `dialog.tsx:28`): `SidePanel`, `PanelHead`, `PanelBody`, `PanelFoot`, `Facts`, `StatusRow`, `Confirm`. NEW layer animation `.layer-side[data-state]`: enter `translateX(16px)->0 + fade` 220ms, exit `translateX(12px) + fade` 150ms (add next to `.layer-sheet`, `globals.css:721`). Under 900px it is the same panel at `100vw-24px`. RISK: the prototype panel is non-modal-feeling (clicking another thing beside it opens that thing); Radix `Dialog` is modal and treats the click as "outside": either use `modal={false}` + `onInteractOutside` that ignores `[data-opens-panel]` targets, or let the outside click close and the item click reopen (two frames) |
| Confirmation in place `Leon.panel.confirm` (`:405-407`): replaces the foot; bold question naming the thing, one sentence saying what really happens, `btn--danger` yes + `btn--line` "Keep it" which takes focus; Escape answers "no" only (panel stays) | `AlertDialog` (5) | NEW `PanelConfirm` inside `PanelFoot` (state swap, focus on "no"); `AlertDialog` stays only for rows outside a panel |
| Toast `.toast` | `Toaster` | restyle (2.1) |
| Empty state `.empty` | `EmptyState` | restyle (2.1) |
| Answer `.paper > .answer` + highlighter strokes + number chip + "no source" | `recherche/answer.tsx` (answer card), `discussions/messages.tsx`, `CitedText/CitedMarkdown`, `CitationChip` | restyle (2.1) + NEW `.hl/.cite/.num/.nosrc/.is-sweep` rules |
| Source tile `Leon.sourcesHTML` (`tile` with `num`, logo, title, "Only you" when private) | `recherche/results.tsx` result rows, `SourceChip` | built on `Thing size="tile" num={n}`; sources grid is `grid--3` |
| Original document sheet `.well > .doc` (`app.css:409-415`, `ui.css:253-290`): a strip of desk (`--desk`, margin `-20px -24px`) holding a white sheet (`.sheet`, `--sh-2`, `--r-m`) with the passage in STIX serif 16, `.flag--left` sticking out 18px at its left edge, kinds: note, `.tx` transcript, `.msgs` conversation, `.props` ticket/PR/task/email; foot "Open in <Tool>" + "Done" | `recherche/preview.tsx` (`PreviewBody`) and `discussions/preview.tsx` (the right column + mobile Sheet), `SourceChip`, `SourceLink` | NEW `OriginalSheet` (+ `Flag` `side="left"`) used as the body of the panel; the text marks (`Highlighted`) become `.hl` on the passage |
| Ask bar `.ask` (`:225-243`): 52px, max 720px, sheet, `--line`, `--r-l`, `--sh-1` (hover `--sh-2`), label 15 ink-2, `⌘K`/`Ctrl K` keys, signature `.strokes` (3 strokes 22/14/18px by 5px, `rotate -5deg`, colours d1,d2,d3, hover scaleX 0.82 / 1.57 / 0.78, 50ms stagger), sticky `.top` on the desk with a hairline when stuck | `recherche/search-bar.tsx` (the real input, `Beam` while pending, `pop-in` clear button, send button `bg-accent` `:113`), `shell/command-palette.tsx` trigger | restyle the surface; NEW `Strokes` component (3 `<i>`); the input stays a real `<input>`/`textarea` (the prototype's bar is a button that opens the command bar: do not copy that, see gaps); `Beam` removed; busy = `.work` stroke along the bottom edge or `.reading` text |
| Command bar `.cmd` (`:332-357`): centred dialog, 720px, top inset 12, field 52px, group labels 13 ink-2, options 40px with 18px logo/icon, active row `--desk`, "go" chevron, foot hints (hidden under 900px) | `shell/command-palette.tsx` (~330 lines: uses `glass-float signal-line layer-dialog`, a sliding `bg-ink` highlight with an accent `before:` bar, `useTheme` toggle action) | restyle in place: sheet, `--sh-3`, scrim no blur, active row `bg-desk` (drop the accent bar and the sliding `bg-ink`) |
| Sidebar `.side`, rail, `.nav__item` 34px, `.nav__tag` flag, `.alert`, `.ws`, `.me`, `.menu` | `shell/sidebar.tsx`, `app-shell.tsx`, `workspace-menu.tsx`, `mobile-bar.tsx` | owned by the shell map; this map gives only the tokens (inset 12, 256/60, nav 34, `--r-m`) |
| Highlighter `.mark` hover stroke under a name (`app.css:298-302`) + done stroke `.mark.is-on` (green m2, drawn once) + `.work` bar + `.pill--work` sweep | none | NEW CSS (`@keyframes sweep` scaleX); replaces `.reading`, `.sk`, `.spin` where a state "works"/"done" |

### 2.3 Prototype pieces that map to a global CSS rule rather than a component
`::selection` (m3), `:focus-visible` (ink), `[hidden]`, `.vh` (Tailwind `sr-only` exists), `.skip` link (`app-shell.tsx:128` already has one: restyle to ink pill), `.fict` (the "Fictional example" line is a prototype artefact: DO NOT port), `.kit-*` (kit page only).

---------------------------------------------------------------------------------------------------

## 3. Dark theme, aurora and glass

### 3.1 Dark theme: the new look is light only
Touch points to cut (counted):
- `src/app/layout.tsx:29` `THEME_SCRIPT` reads `leon-theme` and `prefers-color-scheme` -> keep only the `leon-motion` line (motion off). `:40` `data-theme="dark"` -> `data-theme="light"` (a constant).
- `src/lib/verre/theme.ts` (`useTheme`, `setTheme`, `toggle`, key `leon-theme`); exported by `src/lib/verre/index.ts:11`.
- Consumers (6 files, UI the user sees): `reglages/preferences.tsx:20-46` (a `Field`+`Select` "Theme" with options dark/light), `auth/theme-toggle.tsx` (`ThemeToggle` IconButton Sun/Moon), `shell/mobile-bar.tsx:29,102-107` (menu item), `shell/command-palette.tsx:50,114-116,150` (action "Toggle theme" + `meta`), `shell/workspace-menu.tsx:32,84-85` (menu item), `site/site-header.tsx:42-46,184,261` (`ThemeButton` x2), `ui/toast.tsx:11-14` (`theme={theme}`).
- i18n keys to remove in BOTH `messages/en.json` and `messages/fr.json` once unused: `preferences.theme/dark/light` (en.json ~l.202), `lightTheme`/`darkTheme` (en.json l.176-177 and l.911-912), `toggleTheme` (l.180). Remove in both locale files (no locale-parity test was found by grep; run `pnpm test` anyway).
- CSS: delete the `[data-theme="dark"]` block (`globals.css:19-69`) and `[data-theme="dark"] .aurora…` (`:378-383`); rewrite `[data-theme="light"]` (`:71-121`) as `:root`; keep `color-scheme: light`. `site/fx/fx.css:48-53` has `[data-theme="dark"]{--fx-glare}` and `[data-theme="light"]{--fx-glare}`; `site/site.css:49` `[data-theme="light"] .site-gradient`.
- Recommendation: two steps. Step 1 (safe): hard-set `data-theme="light"` and keep the `[data-theme="light"]` attribute so the site's two light selectors keep matching; delete the dark block; leave toggles for one commit. Step 2: delete the toggle UI + `theme.ts` + keys. A returning user with `leon-theme=dark` in localStorage is simply ignored.
- No `dark:` Tailwind variants exist (0), no `next-themes`, no test refers to `data-theme`/`leon-theme`. Good: removal is mechanical.

### 3.2 Aurora, glass and effects: what each becomes (counts = occurrences in `src` outside `globals.css`)
| Effect | Defined | Used by | Action |
|---|---|---|---|
| `Aurora` + `.blob*` + grain + `drift1-4` | `globals.css:316-411`, component `shell/thinking.tsx:53` | 3 shells: `shell/app-shell.tsx:124`, `shell/standalone.tsx:8`, `site/site-shell.tsx:23` | delete component and CSS and the 3 mounts; ground is `--desk`. `ThinkingProvider`/`useThinking` (9 files: `app-shell`, `standalone`, `site-shell`, `search-bar`, `answer`, `tool-dialog`, `new-discussion-form`, `discussion-thread`) only fed the aurora intensity and `Beam`: leave the provider in place (cheap) until builders replace "thinking" by `.reading`/`.work`, then remove |
| `glass-panel` utility (blur 34px, gradient, inset highlight) | `globals.css:820` | 1: `app-shell.tsx:139` (the layer behind `<main>`) | delete the utility and that layer; the comment at `app-shell.tsx:136` about backdrop-filter and `position:fixed` no longer applies (good for the fixed side panel) |
| `glass-float` utility (blur 28px) | `globals.css:831` | `ui/toast.tsx:40`, `ui/dialog.tsx:16`, `discussions/composer.tsx:45`, `shell/mobile-bar.tsx:38`, `shell/command-palette.tsx:265`, `connexions/catalogue.tsx:161` | delete; replace by `bg-menu` (white) + `border-line`; sticky headers/composer get `bg-bg` (desk) with a hairline when stuck (`.top.is-stuck`) |
| `signal-line`, `signal-glow` (gradient hairline + halo) | `globals.css:413-426` | 14 files: app = `ui/surfaces.tsx`, `ui/dialog.tsx` (x2), `shell/command-palette.tsx`; site = `auth-aside`, `parts`, `demo-card`, `home/signal`, `home/hero-demo`, `pages/{cas-usage,connecteurs,securite,produit,tarifs}`, `fx/layers-3d` | delete in app files; site files stay broken-looking until the public-site map handles them: coordinate (see risks) |
| `.spot-host/.spot` + `trackSpot`/`Spotlight` | `globals.css:428-452`, `ui/surfaces.tsx:11,65` | `discussions/list.tsx:55-56` (+ `GlassCard spotlight`) | delete |
| `.beam-host/.beam` + `Beam` | `globals.css:454-516`, `ui/surfaces.tsx:90` | `recherche/search-bar.tsx:64`, `connexions/tool-dialog.tsx:191`, site `home/hero-demo.tsx:197` | delete; working = `.work` stroke (one-shot) + `aria-busy` |
| `.sk` / `.sweep` shimmer, `.reading::before`, `.spin`, `.caret`, `.caret-block`, `.pulse` | `globals.css:518-613` | `.sk` x30 lines / 13 files (feedback.tsx, previews, answer, `(app)/loading.tsx`), `.spin` x6 / 5 (Button loading, IconButton loading, tool-dialog…), `.caret-block` `recherche/answer.tsx:170` + `discussions/messages.tsx:233` + site, `.pulse` x1 | prototype has no loops: static skeleton blocks; `.spin` -> label verb + `.work`; streaming caret -> remove (or a non-blinking 2px ink bar); `.reading` -> the highlighter stroke passing once under "Leon is reading…" |
| `.word-in`, `.pop-in`, `.rise-in`, `.fade-in` | `globals.css:615-648` | `.word-in` 0 (dead), `.pop-in` x3 (`chips.tsx:71`, `search-bar.tsx:108`, site), `.rise-in` x4 files (`(onboarding)/layout.tsx:27` which ALSO has `backdrop-blur-[30px]`, `(auth)/layout.tsx:13`, `auth/standalone-card.tsx:12`, site), `.fade-in` | drop blur from keyframes (`rise-in`: remove `filter: blur(8px)`; `dialog-enter`: remove `blur(4px)`; `wordblur` delete); keep a 220ms fade/rise for page entry or delete |
| `backdrop-blur` / `backdrop-filter` in class lists | n/a | 19 lines / 13 files (`grep -rn "backdrop-blur\|backdrop-filter" src`) | remove (NOTES: "Gradients, blur, glows" are Never); keep none |
| Radix `.layer-pop/.layer-scrim/.layer-dialog/.layer-sheet/.layer-collapse` | `globals.css:650-750` | `ui/menu.tsx`, `ui/dialog.tsx`, `ui/form.tsx` (Select content), `ui/dialog.tsx` collapsible | KEEP (Radix waits for the exit animation); retune: no scale, no blur, 220/150ms; ADD `.layer-side` (2.2) |
| `.org-tree` | `globals.css:752-815` | `equipe/org-chart.tsx:49,82` | KEEP (uses `--line-strong`; boxes become sheets `--r-m` via the token change). Prototype has no org chart, see gaps |
| Gradient text `.site-gradient`, 3D tilt `fx.css`, `particle-field`, `motion-provider` | `site/site.css`, `site/fx/*` | public site | OUT of this map (site map) |

### 3.3 Hard-coded colours that ignore tokens (fix while there)
`ui/chips.tsx:103` and `documents/index.tsx:81`, `onboarding/code-tools-card.tsx:48` use `bg-[#fff]`; `button.tsx:21,27,99`, `recherche/search-bar.tsx:113` use `shadow-[inset_0_1px_0_rgba(255,255,255,.3)]`. And a LATENT BUG: `bg-surface` is used at `equipe/org-chart.tsx:163` and `reglages/security-settings.tsx:36` but no `--color-surface` exists (palette is initialised empty), so those two backgrounds are silently transparent today. Decide: alias `surface` to `--sheet` (adds `bg-surface`) or change to `bg-glass`.

---------------------------------------------------------------------------------------------------

## 4. Safest way to bring the prototype CSS into this Tailwind 4 setup

### The constraint
Every one of the ~96 component files writes Tailwind utilities on today's token names (`bg-glass-3` x26, `text-muted` x184, `text-fg` x229, `border-line` x93, `rounded-field` x46, `text-ui` x95, `text-label` x98 …). Several builders will work in parallel, one per area, on the same `ui/` files. Anything that renames tokens or rewrites classes globally creates merge conflicts and regressions.

### Options and trade-offs
1. Re-point the existing tokens (change values, keep names) + add the new prototype tokens as extra theme variables + a `@layer components` block for the prototype's shape rules. (RECOMMENDED)
   - Pro: ~85% of the app turns light/flat/ink-pill/12px-radius in ONE small diff (`globals.css` + `layout.tsx` + `utils.ts`); no merge conflict; nothing to re-type in 96 files; reversible; tailwind-merge config unchanged except new names.
   - Con: names lie afterwards (`glass`, `float`, `accent` = ink, `fg-2` = `muted`); fine as a bridge, and later builders may add the honest aliases (`bg-sheet`, `bg-desk`, `text-ink-2`) next to them (aliases are free: `--color-sheet: var(--glass)`), then delete the old names in a clean-up pass.
   - It still needs per-component class edits where the SHAPE changes (see 4.2).
2. Rename every token to the prototype names (`--desk --sheet --ink --ink-2 --r-l --fs-1…`) and rewrite all classes. Cleanest end state, but ~1,500 utility occurrences in 96 files, guaranteed conflicts between parallel builders, high regression risk. Not now.
3. Paste `app.css` verbatim as a global stylesheet and switch JSX to its classes (`.btn`, `.tl`, `.field`). Fastest fidelity per piece, BUT: (a) unlayered CSS beats Tailwind utilities (utilities live in `@layer utilities`), so `className="h-10"` overrides would silently stop working; (b) `.btn`, `.field`, `.chip`, `.paper` collide with nothing today but two systems would coexist; (c) the prototype reset (`ui.css:6-35`) duplicates Tailwind preflight. If used, it MUST be wrapped in `@layer components` so utilities still win.

Recommended composition (1 + a layered slice of 3):
- `globals.css`: replace `[data-theme=…]` blocks by one `:root` block with the new values (1.1-1.6) plus new variables (`--n-50 --n-150 --n-500 --m1..m4 --d1..d4 --f1..f4 --accent-hover --radius-mark --shadow-sheet --text-answer --text-panel --font-serif --inset --side-w --rail-w --gut --top-h --fast --med --work`). Add the aliases in `@theme inline`: `--color-desk, --color-sheet, --color-n-50, --color-n-150, --color-n-500, --color-m1…m4, --color-d1…d4, --color-f1…f4, --color-white, --color-surface`.
- New file `src/app/kit.css` (imported from `globals.css` after the Tailwind import: `@import "./kit.css";`, or placed inside `@layer components`) holding ONLY the rules that Tailwind classes cannot express well: `.tl/.card/.tile` family (hover lift, `.mark` hover stroke, `tl__dot`, `[data-ask]` wrapping), `.tag/.flag` notch clip-path, `.strokes` (ask-bar signature), `.hl/.hl--a/.hl--b/.is-sweep/.seg` + `@property --sweep` + `.is-arriving`, `.cite/.num/.nosrc`, `.mark`, `.work/.pill--work` sweep keyframes, `.doc/.well` (original sheet), `.facts/.statusrow/.where/.done`, `.layer-side`. Everything inside `@layer components` (`@layer base` for the three global rules). Token names inside map to the current names (`var(--line)`, `var(--text)`, `var(--muted)`…) or the new ones.
- Everything else stays Tailwind in the React components (Button, Field, Notice, Section, menu, dialog) so builders edit one file each.
- Remove from `globals.css` in the same pass: aurora, signal, spot, beam, `.sk` shimmer, `.reading`, `.spin`, `.caret*`, `.word-in`, `.pop-in`, blur in keyframes, the two `@utility` blocks.
- `utils.ts`: extend `text` with `answer, panel`; `radius` with `mark`; `shadow` with `sheet`.

### 4.1 Token NAMES that can simply change value (no class edits)
`--bg, --glass, --glass-2, --glass-3, --float, --menu, --scrim, --hover, --line, --line-strong, --text, --text-2, --muted, --accent, --accent-ink, --accent-soft, --accent-line, --ring, --mark-bg, --mark-ink, --ok, --success(-soft,-line), --destructive(-ink,-soft,-line), --warning(*), --info(*), --thumb, --box-line, --font, --ease-out, --ease-spring, --dur-exit, `--radius-panel/-box/-card/-field/-item/-chip`, `--shadow-hi/-panel/-float`, `--text-meta … --text-h1`, `--breakpoint-shell`.

### 4.2 Components and class groups whose classes MUST be rewritten (value change is not enough)
- `--ink` / `bg-ink` (6 files): name collision, section 1.1a.
- Any `bg-glass-3` used as an input/secondary fill that should now be white or desk (case by case; default `n-50` is acceptable).
- Rows using `rounded-field` that must be `rounded-item` (sidebar, tabs, preview boxes, org boxes).
- `shadow-hi` on inputs/cards and ~15 `shadow-[inset…var(--hi)]` and `shadow-[inset_0_0_0_1px_…]` rings (Badge, Notice, EmptyState, Kbd, CodeLine, inline code `text.tsx:120,178`).
- `font-mono` outside real code (about 30 sites: `ui/chips.tsx:46`, `ui/kbd.tsx:13`, `ui/menu.tsx:77,113,136`, `ui/badge.tsx:35`, `reglages/*`, `recherche/{results,preview,answer,welcome}.tsx`, `discussions/{preview,messages}.tsx`, `connexions/{carte,jeu,index,tool-dialog}.tsx`, `discussion/new-discussion-form.tsx:89`): keep mono only for tokens/commands/URLs shown as code (`CodeLine`, `pre`, `<code>`), replace counters/dates/shortcuts by `tabular-nums` sans.
- `text-[Npx]` below 13 (54 sites) and `font-bold/extrabold`.
- `GlassCard` callers that used `signal`/`spotlight`/`reading` (3), `Beam` (3), `glass-float` (6), `signal-line` (app: 4), `backdrop-blur` (13 files), `.aurora` (3), `caret-block` (3), `pop-in` (3), `rise-in` (4).
- Button/Notice/Badge/Pill APIs stay; but every card carrying a Badge, a date, a count or a size must lose it (founder's taste) and every view must be audited to a single `primary`.
- Dialog consumers that become panels (6 `DialogContent` files); `AlertDialog` consumers inside a panel (`tool-dialog.tsx:492`, `members.tsx:237`).
- Shell geometry (`app-shell.tsx`, `sidebar.tsx`): numbers 248/64/1240/1424/px-8/pt-10 -> 256/60/1348/gut 32 and a document-scroll `.top` ask bar (shell map).

---------------------------------------------------------------------------------------------------

## 5. What must survive (states and behaviours of the kit)

- Button: `loading` (aria-busy + aria-disabled, click swallowed, focus stays), `disabled`, `asChild` + `Slot` for `<Link>`, `icon`, `type="button"` default, tooltip on `IconButton`.
- Field: label `htmlFor`, `aria-describedby`, `aria-invalid`, error replaced by a new `role="alert"` node (`key` swap), `help`, `aside`; 16px text on coarse pointers (iOS zoom) `pointer-coarse:text-[16px]`; Textarea `autoGrow`/`maxRows`; Select Radix popper with `max-h`, check indicator.
- Dialog family: Radix focus trap, Esc, `dismissible=false` (token creation), `hideClose`, `useReturnFocus` (focus returns without a Trigger), `AlertDialog` focus on Cancel, `description` absent -> `aria-describedby` undefined; the mobile `Sheet`.
- Menu: keyboard highlight ring `inset 0 0 0 2px var(--ring)`, long lists scroll (`max-h var(--radix-dropdown-menu-content-available-height)`), `collisionPadding 12`, `DropdownMenuCheckboxItem` stays open on select.
- `toast()` API and 33 call sites, `toast.error` 8s, max 3 visible; toast must stay above a modal panel.
- `CopyButton` failure path (`toast.error`), `onCopied`; `CodeLine` `wrap` (long commands at 390px).
- `CitedText`/`CitedMarkdown`: ref glued to the previous word + following punctuation (self-test `console.assert`), `keep` filter drops refs without source, `tail` for the streaming cursor, code spans untouched, `Highlighted` U+E000/E001 snippet marks (text never read as HTML); `chips.test.ts`, `message-segments.test.ts`.
- `nb()` non-breaking spaces (`src/lib/verre/nb.ts`, French typography) applied by PageHeader/Section/Field/Notice/Dialog/EmptyState/Toast: keep wrapping text in `nb`.
- Reduced motion: both `prefers-reduced-motion` and `data-motion="off"` (user "Stop animations" switch, i18n `motionOff/motionOn`).
- Focus ring on every control (`:focus-visible` 2px, offset 2): becomes ink; checkbox comment `form.tsx:230` relies on the global rule (do not add `outline-none`).
- `ToolIcon` fallbacks for unknown/removed tools (`kindIcon` -> `Plug`), `SOURCE_KIND_LABELS`.
- Skip link `app-shell.tsx:128`, `<main id="contenu" tabIndex={-1}>`.
- `org-tree` organigramme CSS (`equipe/org-chart.tsx`).
- Locale/i18n: all kit strings come from `useTranslations('common')` (`close`, `copy`, `copied`, `copyFailed`, `openIn`, `newTab`, `previous`, `next`, `page`, `pageOf`, `pagination`); keep.

---------------------------------------------------------------------------------------------------

## 6. Gaps and risks (both directions)

Gaps (prototype lacks / real needs):
1. No dark theme, no warning tone, no info tone in the prototype; `Notice` (46 uses, 11 warning) needs a decision (section 2.1, recommended derivation from amber `--f4`).
2. No loading skeleton, no spinner, no pagination, no checkbox/switch, no tooltip (except rail), no table, no org chart, no code block/markdown rendering in the prototype kit; each needs a quiet restyle with existing tokens.
3. Streaming answers: the prototype's answer "arrives once" (sweep) and the ask bar is a button opening the command bar; the real product streams tokens (`recherche/answer.tsx` state `flux`) and the ask bar is a real input with pending state. Needs a decision: strokes per sentence as refs arrive, no caret.
4. Working state: prototype busy is fixed 1.3s (`--work`); real server actions have unknown duration: label verb + `.work` stroke (one-shot, holds) + `aria-busy`.
5. A real tool/source with no SVG logo (codex, antigravity, chatgpt, claude_ai, mcp_remember, interface) needs a neutral 36/28px fallback tile.
6. The prototype's "Fictional example" line, `data-ext` "Opens X in the real product", `Leon.WORK`, demo data and `kit.html` are prototype artefacts: never port.
7. Marketing tokens in `css/tokens.css` (`--ground --desk-2 --desk-3 --on-ink-* --term* --t-h1..--t-small --margin --gutter --maxw --nav-h --sec-gap --band-pad --flag-* --ease-flag`) and `ui.css` pieces (`.pile .minis .mini .memo .switch .dream .term .bsheet`) belong to the PUBLIC SITE port, not to the app kit; add them only in the site step.
8. `/` focuses search (prototype `data-slash`) does not exist in the app (only ⌘K).
9. Real features the prototype never draws and that need a home in the new look: org chart, groups, SSO form, two-step setup, tokens table with revoke, onboarding steps, admin pages, Slack/GitHub choice screens, the "Mini-game"/jeu (`connexions/jeu.tsx`), pagination, filters menu (43 tools). Use only the kit pieces above: Thing card/tile, Section + flag, side panel + facts, in-place confirm, quiet notice.

Risks:
1. Shared stylesheet: `globals.css` also drives the public site and the auth pages (`SiteShell`, `StandaloneShell`, `(auth)/layout.tsx`, `(onboarding)/layout.tsx`). Changing token values flips the dark/glass marketing site to light/flat at once and breaks its effects (`signal-line` in 11 site files, `.site-gradient` uses `--accent`/`--logo-2`, `fx.css`, hero demo). Either port the site in the same batch (prototype `papier/index.html`, `pricing.html`, `security.html`, `connectors.html`) or keep the old tokens scoped for the site until then (a `.site-scope` wrapper re-declaring the old values is the cheap bridge).
2. `--ink` collision (1.1a), `--accent` = ink (every link/icon in accent turns black: check `text-accent` x66, `bg-accent-soft` x23 used for "active" cues that should now be ink fill or desk).
3. `tailwind-merge` config (`src/lib/utils.ts:5`): new theme names not listed there silently break class de-duplication (a colour class can be swallowed by a size class). Add names in the same commit.
4. Radius collapse (26/18/16 -> 12; field 12 -> 6): any layout relying on big radii (org boxes, onboarding card, preview aside) gets visibly different; `rounded-field` is shared by inputs and rows.
5. `shell:` breakpoint 861 -> 900: tablets between 861 and 899 flip to the mobile bar.
6. Unlayered vs layered CSS: kit rules MUST sit in `@layer components` (or `base`) or utility classes stop overriding them.
7. Biome: new CSS goes through `biome check`; `!important` needs `biome-ignore` comments (3 existing patterns at `globals.css:294-310`).
8. Mobile 44px targets (`.btn,.chip,.iconbtn,.field` under 900px) are a prototype rule the app only partly has (`pointer-coarse:text-[16px]` on fields): add under `max-shell:`.
9. Non-modal side panel (2.2): Radix modal Dialog vs "click another thing opens it" (needs `modal={false}` + outside-interaction filter) - test focus return and Esc-on-confirm (answers "no" only).
10. Prototype font weights are 400/500/600; any `font-bold` left will render 700 only if Schibsted is loaded with it: load 400/500/600 only so leftovers fall back visibly and get fixed.
11. Latent bug `bg-surface` (3.3) would stay invisible; fix deliberately.
12. `useThinking`/`ThinkingProvider` keeps rendering nothing useful after the aurora and beam are gone: remove only once `search-bar`, `answer`, `tool-dialog`, `new-discussion-form`, `discussion-thread` stop calling `setThinking`.

---------------------------------------------------------------------------------------------------

## 7. Suggested order for the kit builder (everything else depends on it)

1. `layout.tsx` fonts + `data-theme="light"` constant; `globals.css` tokens (1.1-1.6) + new variables/aliases; `utils.ts` names; delete aurora/signal/spot/beam/glass utilities and their 3 mounts + the `bg-ink` rename. App is now light/flat; run typecheck + Biome.
2. `kit.css` (`@layer components`): `.tl` family, `.tag/.flag`, `.strokes`, `.hl/.cite/.num/.nosrc/.is-sweep`, `.work/.pill--work`, `.doc/.well`, `.facts/.statusrow/.where/.done`, `.layer-side`.
3. Restyle `ui/` in this order (small to large blast radius): `button`, `form`, `pill`, `badge`, `feedback`, `layout`, `kbd`, `menu`, `toast`, `copy`, `surfaces` (GlassCard -> flat), `dialog` (restyle), then ADD `thing.tsx`, `side-panel.tsx`, `initials.tsx`, `flag.tsx`, `strokes.tsx`, `original-sheet.tsx`, then `chips`/`text` (answer system).
4. Hand the area builders: `Thing`, `SidePanel`/`PanelConfirm`/`Facts`, `Section count`, `PageHeader` without subtitle, `Initials`.
5. Step 2 of dark removal (toggles, `theme.ts`, i18n keys) and the final clean-up of old token names after all areas land.
