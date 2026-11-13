# KIT.md — the Papier kit in the real app (for the seven builders)

Look at it first: http://localhost:3040/kit (signed in; dev only, `src/app/(app)/kit/`). Every piece in its states;
the "Dark theme" button at the top right switches the theme. Its source, `src/app/(app)/kit/showcase.tsx`, is the
longest example of how the pieces are used together: copy from it.

Everything is imported from one place:

```tsx
import { Thing, ThingGrid, SidePanel, Facts, Fact, Section, PageHeader, Button, Avatar, ToolLogo } from '@/components/verre';
```

Files: tokens in `src/app/globals.css`; shapes in `src/app/kit.css` (inside `@layer components`: a Tailwind class
next to a kit class always wins); components in `src/components/verre/ui/`. These files belong to the foundation
stage. If the kit lacks something, write it in your own files with the tokens below and say so in your report.

## 0. Three things that will bite you

1. **Sign-in is limited to 10 per address per 15 minutes** (`src/server/auth/rate-limit.ts`). Every run of
   `shoot.mjs`, `act.mjs` or `dead.mjs` with `--login` is one sign-in. I used up claire@ once. Put many steps in ONE
   `act.mjs` run, and spread over the three accounts (claire@, david@, karim@essai.leon.local). A refusal says
   "sign-in refused (still on /connexion)": wait, do not retry in a loop.
2. **The old shell scrolls inside `<main id="contenu">`**, not the document (until the shell builder changes it):
   `shoot.mjs` gets one slice. Scroll with `"eval=document.getElementById('contenu').scrollTo(0,640)"` in `act.mjs`.
3. **A size token must never share its name with a colour.** `text-panel` came out as the colour of `bg-panel`
   (white text on a white sheet). The panel title size is `text-head`. If you add a `--text-*`, `--radius-*` or
   `--shadow-*` name, add it to `src/lib/utils.ts` too (ask the lead: that file is the foundation's).

## 1. Tokens (both themes; never a raw colour in a component)

`data-theme` on `<html>`: `light` (first visit, whatever the system says) or `dark` (stored choice `leon-theme`,
`useTheme()` from `@/lib/verre/theme`: `{ theme, setTheme, toggle }`). Each token has a value in both blocks, so a
component almost never needs `dark:`; the variant exists (`dark:border-line-strong`) for the rare exception.

| Use | Class (new name) | Old name, still works | Light | Dark |
|---|---|---|---|---|
| The desk (page ground) | `bg-desk` | `bg-bg` | #F1F1EE | #121210 |
| A sheet (card, panel, menu, field) | `bg-sheet` | `bg-glass`, `bg-glass-2`, `bg-panel`, `bg-menu`, `bg-float`, `bg-surface` | #FFFFFF | #1C1C19 |
| Quiet fill (code line, key, plain notice) | `bg-glass-3`, `bg-n-50` | same | #F8F8F6 | #232320 / #262622 |
| Pointed at (on a sheet or on the desk) | `bg-hover` | same | ink 5% | paper 5% |
| Pressed | `bg-n-150` | — | #E9E9E5 | #2E2E2A |
| Selected row, status pill | `bg-selected` | was `bg-ink` (renamed in the 6 files) | #F1F1EE | #2A2A26 |
| **The ink pill** | `bg-ink text-on-ink` (hover `bg-accent-hover`) | `bg-accent text-accent-ink` | #0F0F0D / #FFF | #F1F1EE / #121210 |
| Text | `text-fg` | same | #0F0F0D | #F1F1EE |
| Captions, labels | `text-muted` (= `text-fg-2`) | same | #5B5B55 | #A9A9A1 |
| Icons at rest (never text) | `text-icon` | — | #8B8B84 | #7D7D76 |
| Hairline / stronger hairline | `border-line` / `border-line-strong` | same | #E2E2DC / #C6C6BE | #2E2E2A / #45453F |
| Edge of a floating layer | `border-float-line` | — | = line | = line-strong |
| What is wrong | `text-destructive`, `bg-destructive-soft`, `border-destructive-line` | same | #B42318 | #F2867A |
| Healthy dot / success text | `bg-ok` / `text-success` | same | #1F7A4D / #1C7147 | #5BCB93 |
| Warning (amber) | `text-warning`, `bg-warning-soft`, `border-warning-line` | same | #8A5A06 | #F0B866 |
| Highlighter n (a stroke behind text) | `bg-m1`…`bg-m4` | — | pastels | flag colour at 30% |
| Flag / number n (ink text on it: `text-flag-ink`) | `bg-f1`…`bg-f4` | — | same in both themes | |
| White under a logo or a QR code | `bg-white` | `bg-[#fff]` | #FFF | #FFF |

`--accent` is ink: `text-accent` is ink, `bg-accent-soft` is a neutral tint (#E9E9E5 / #2E2E2A). A link is ink and
underlined; a selected thing is `bg-selected` or the ink fill, never a tint of a colour. `--info*` is neutral.

- Radii: `rounded-card` 12 (sheets, cards, panel, menus; `rounded-box` and `rounded-panel` are 12 too),
  `rounded-item` 8 (rows), `rounded-field` 6 (fields), `rounded-chip` 6 (keys), `rounded-mark` 3, `rounded-full`
  (buttons, chips, status, avatars). **`rounded-field` on a row is now 6: write `rounded-item`.** Nothing above 12.
- Shadows: `shadow-sheet` (at rest), `shadow-lift` (pointed at; also the sidebar, the ask bar; `shadow-panel` is the
  same), `shadow-float` (panel, menu, command bar, toast). `shadow-hi` and every `var(--hi)` are now nothing: remove.
- Type (Schibsted Grotesk 400/500/600, loaded with those three weights only): `text-label` 13 (captions, pills,
  labels; `text-meta` is 13 too), `text-ui` / `text-body` 14, `text-lead` / `text-title` 15, `text-h2` 18,
  `text-answer` 18/1.6, `text-head` 20 (panel title), `text-h1` 28/32. Nothing under 13px: every `text-[11px]`,
  `text-[12px]`… must go (29 left in the screens). `font-serif` (STIX Two Text): only the words of an original
  document, through `OriginalSheet`. `font-mono` (Geist Mono): only real code (`CodeLine`, `<code>`, `<pre>`); 22
  uses are left in the screens for counters, dates, shortcuts: remove them. `font-bold` (33 left): `font-semibold`.
  A bare `<kbd>` is sans now.
- Motion: `--fast` 150ms, `--med` 220ms, `--work` 1300ms, `ease-out` = `cubic-bezier(.2,.7,.2,1)`. `ease-spring`
  has the same curve now (nothing bounces). Reduced motion (`prefers-reduced-motion` and `data-motion="off"`) is
  global: do not handle it again.
- Shell variables (plain CSS, for the shell builder): `--inset` 12 (8 under 861px), `--side-w` 256, `--rail-w` 60,
  `--gut` 32 (16), `--top-h` 76 (64), `--page-max` 1348px. Breakpoint unchanged: `shell:` ≥ 861px, `max-shell:`.
- Under 861px every `Button` (but `xs`), `Pill`, `Input`, `Select`, `SearchField`, menu row and `IconButton` is 44px.

## 2. Components

### PageHeader — the title and the view's one ink pill
```tsx
<PageHeader title={t('title')} actions={<Button variant="primary">{t('add')}</Button>} />
```
Props `title`, `actions`, `className`. **`subtitle` and `meta` are accepted and no longer drawn** (rule 1): the
callers (`(app)/page.tsx`, `reglages/page.tsx`, `discussions/page.tsx`, `admin`, `connexions`, `equipe`,
`documents`) still pass them. Remove the props and their message keys (en and fr together); a sentence that is a
promise of the product (who sees what) moves into the panel (`PanelNote`). 32px high; 24px to the first `Section`.

### Section — a heading, its counting flag, its tools
```tsx
<Section id="connectes" title={t('connected')} count={tools.length} tone={2}
  actions={<SearchField label={t('searchTools')} value={q} onChange={(e) => setQ(e.target.value)} />}>
  …
</Section>
```
`count` draws the flag (the number of things drawn under it); `tone` 1 pink, 2 green (default), 3 blue, 4 amber.
`description` is still drawn (13px, quiet): keep it only for a promise or a technical thing. 40px between sections.

### Thing and ThingGrid — a rectangle on the desk
```tsx
<ThingGrid>            {/* cols={3}: three columns at most (documents, sources, questions) */}
  {tools.map((tool) => (
    <Thing key={tool.id} size="card" picture={<ToolLogo kind={tool.id} />} name={tool.label}
      caption={tool.private ? t('onlyYou') : t('team')} label={t('manage', { tool: tool.label })}
      onClick={() => setOpen(tool.id)} />
  ))}
</ThingGrid>
```
- `size`: `'card'` 88px (picture 36: what the person has) or `'tile'` 52px (picture 28: what can be added or
  picked; the default). `ThingGrid` puts each child in its `<li>`; same columns for both sizes (4 at 1512).
- `picture` (`<ToolLogo kind size>`, `<Avatar name size>`), `name`, `caption` (ONE quiet caption; no count, date,
  size), `error` (caption red + red dot on the picture), `working` (the highlighter passes under the caption,
  `aria-busy`: "Reading…"), `pill` (words of a 28px pill instead of the chevron: "Connect") + `pillInk` (ink:
  "Reconnect"; it counts as the view's ink pill), `num` (a source's number in its colour, before the picture), `hl`
  (1 to 4: colour of the stroke under the name on hover), `wrap` (the name on two lines: a question to try),
  `chevron={false}`, `label` (aria-label).
- A link with `href` (next/link), else a `<button type="button">`: pass `onClick`, `data-*`, `ref`… The whole
  rectangle is the control: never a button inside.

### SidePanel — everything else about ONE thing
```tsx
<SidePanel open={open} onOpenChange={setOpen} picture={<ToolLogo kind="gmail" size={44} />} title="Gmail"
  confirm={asking ? { title: t('deleteQ'), text: t('deleteText'), yes: t('delete'), no: t('keep'),
                      busy: pending, busyLabel: t('deleting'), onYes: remove, onNo: () => setAsking(false) } : null}
  foot={<>
    <Button variant="quiet" className="-ml-4" onClick={() => setAsking(true)}>{t('delete')}</Button>
    <PanelClose asChild><Button className="ml-auto">{t('done')}</Button></PanelClose>
  </>}>
  <StatusRow><Badge tone="success">{t('synced')}</Badge><Button size="xs">{t('syncNow')}</Button></StatusRow>
  <Facts>
    <Fact label={t('account')}>julie@kestrel.example</Fact>
    <Fact label={t('visibleTo')}>{t('onlyYou')}<small>{t('onlyYouMeans')}</small></Fact>
  </Facts>
</SidePanel>
```
- 520px, the height of the window (`100vw - 16px` on a phone). Controlled: `open`, `onOpenChange`. Head: `picture`
  (44px), `title`, `sub` (one quiet line). Body = children, it scrolls. `foot`: its buttons (`ml-auto` pushes right;
  a first quiet button takes `-ml-4` so its words line up); without `foot`, a "Done" button. `note`: the quiet line
  under the buttons.
- A modal sheet: **a click outside closes it and does nothing else** (it never opens what lies under: remark 12);
  Escape closes; the focus returns to what opened it. On opening, the focus goes to the first field of the body, or
  to an element marked `data-autofocus`.
- `confirm`: the confirmation in place of the foot. The question names the thing, the sentence says what really
  happens, "no" takes the focus, Escape answers "no" and the panel stays. `busy` + `busyLabel` while it is done.
- `busy`: the highlighter runs along the foot, the body is `inert`, `aria-busy`. Then draw `<PanelDone title="Outlook
  is connected">The first sync starts within a minute.</PanelDone>` as the body (and leave `foot` out: "Done").
- **`locked`**: a step that shows a secret once (a token, an invitation link, backup codes). Neither Escape, nor a
  click outside, nor a cross closes it: only its own button in `foot` (`<PanelClose asChild><Button
  variant="primary">I copied it</Button></PanelClose>`).
- Body pieces: `Facts` / `Fact label` (a `<small>` in a value is its quiet second line), `StatusRow` (a `Badge` and
  its `xs` action), `PanelNote` (the one plain sentence, or a promise: who sees what), `PanelDone`, a
  `<form className="grid gap-3.5">` of `Field`s whose submit button sits in `foot` (`form="id"`), `OriginalSheet`.

### OriginalSheet — the words of a source
```tsx
<OriginalSheet n={source.n} meta={`${toolLabel} · ${kindLabel} · ${date}`}>
  {paragraphs.map((p) => <p key={p.id}><Highlighted text={p.marked} /></p>)}
</OriginalSheet>
```
First child of a `SidePanel` body (the strip of desk goes edge to edge; elsewhere `className="m-0"`). `n`: the
source's number: its flag sticks out at the left and every `<mark>` inside takes its colour. Words in the serif.

### Avatar — a person, always a circle
`<Avatar name="Karim Benali" src={user.image} size={36} />`. Sizes 24 (a row of facts), 28 (tile), 32 (default), 36
(card), 44 (panel head). The photo when `src`, else two initials on a soft tint that only depends on the name
(`tintOf(name)`, `initialsOf(name)` are exported). Decorative (`aria-hidden`): the name is beside it, or on the
button around it. No ring: the shell adds its own on hover and focus.

### Flag, Strokes, Reading, DoneMark — the brand, present and rare
- `<Flag tone={2}>8</Flag>` (beside a heading: `Section` does it) · `<Flag tone={3} side="left">3</Flag>` (the left
  edge of a document: `OriginalSheet` does it). `toneOf(n)`: the colour of source n (5 is 1 again).
- `<Strokes />`: the three strokes, the signature of the field where one asks Leon, and of nothing else. They are
  drawn again when their field is pointed at: put `group` on the field.
- `<Reading>{t('reading')}</Reading>`: "Leon is reading…", the highlighter passes once, `role="status"`.
- `<DoneMark>Saved</DoneMark>`: "done", said in place under a green stroke drawn once.

### What Leon writes
```tsx
<GlassCard className="px-7 py-6">
  <p className="answer">
    You committed to delivering V2 on <span className="hl hl-1">Nov 15</span>.
    <CitationChip n={1} label={t('source', { n: 1, title })} onClick={() => openSource(1)} />
    Nobody has told ACME yet.<NoSource />
  </p>
</GlassCard>
```
- `.answer` (18/1.6, 76ch). `.hl .hl-N`: a highlighter stroke in the colour of source N. **Only the words that come
  from the source are marked** (remark 10): computing them is the chat builder's function; the kit gives the stroke.
  Hover deepens it when the stroke sits in a `.seg` (`.seg:hover .hl`, or `.seg.is-lit`).
- `.hl-arrive` on the paragraph: every stroke is drawn once from the left (900ms). A streamed answer: add it when
  the answer is complete, or not at all.
- `CitationChip` (`n`, `label`, `active`, `href` or `onClick`): the number after a sentence, in the colour of source
  n (`.cite cN`). `SourceNumber` (`n`): the same as a label. `NoSource`: "no source" (`common.noSource`).
- A source as a tile: `<Thing num={2} picture={<ToolLogo kind="hubspot" size={28} />} name={title}
  caption={private ? t('onlyYou') : undefined} />` in `<ThingGrid cols={3}>`.
- `CitedText`, `CitedMarkdown`, `Highlighted` keep their behaviour; `<mark>` is an amber stroke.

### The base components (same imports, same props; what changed)
| Component | Now |
|---|---|
| `Button` | `variant`: `primary` = the ink pill (ONE per view) · `secondary` (default) = outline · `quiet` = `ghost` = no outline · `destructive` = danger outline (only in a confirmation) · `link` = underlined. `size`: `xs` 28 (new: in a row) · `sm` 32 · `md` 36 · `lg` = `md`. `loading` no longer spins: pass `loadingLabel="Saving…"` (new) |
| `IconButton` | 32px, radius 8, not round |
| `Pill` | the chip: sheet + hairline; the pressed one is ink: `aria-pressed={on}` or `variant="active"`; `chevron`, `removable` kept |
| `Badge` | the status pill (24px): `success` = green dot · `destructive` = red tint and dot · `warning` = amber, in progress (`sweeping`: its fill arrives once) · `neutral` / `accent` / `info` = words alone. `icon` and `mono` are ignored. In a panel, never on a card |
| `Field` `Input` `Textarea` `Select` | 40px, radius 6, ink ring on focus, error in red under the field (`error` prop) |
| `Checkbox` `Switch` | ink when on |
| `Notice` | a flat row with a 6px dot; `icon` is ignored; only `warning` and `error` are tinted |
| `EmptyState` | dashed frame, left aligned, a title and one line; `icon` is ignored; `action`: a `secondary` `sm` button, only if the view has no ink pill |
| `Kbd` | 24px, sans |
| `DropdownMenu*` `Popover*` | a sheet with the highest shadow; `meta` is sans |
| `Tooltip` | ink label |
| `toast` | an ink pill at the bottom centre, above an open panel; `toast.error` has a red dot. For what happened elsewhere on the page; what is visible in place says it in place |
| `CopyButton` | says "Copied" in place for 1.6s, no icon, no toast (a toast only with `copiedMessage`) |
| `CodeLine` | real code, mono |
| `GlassCard` | a flat sheet (the `.paper`): `rounded-card border-line bg-sheet shadow-sheet`. `signal`, `spotlight`, `reading`, `variant` are ignored. Never one inside another. Padding is yours (`px-7 py-6`) |
| `Dialog` `AlertDialog` `Sheet` | flat sheets; kept for a confirmation OUTSIDE a panel (a row of the sidebar). Anything about one thing goes to `SidePanel` |
| `Pagination` | outline pills |
| `Skeleton` `PageSkeleton` | static blocks, nothing sweeps |
| `ToolLogo` (new) | `kind` (a tool, or `pdf` `word` `excel` `powerpoint`), `size` 36 / 28 / 44 / 18: the bare logo (on a white square in dark); a neutral square with the channel's icon when there is no logo |
| `ToolIcon` `SourceChip` `SourceLink` | small inline pieces, restyled; a `SourceChip` (it carries an author and a date) belongs in a panel, not on a rectangle |
| `SearchField` (new) | `label` (required: accessible name and placeholder), `slash` (the `/` key focuses it; default true), then any input prop. 280 × 36, a pill. Filtering is yours |

## 3. kit.css classes (when a component does not fit)

`.things` / `.things-3` (the grid) · `.tl` + `.card` | `.tile`, `.tl__pic`, `.tl__id`, `.tl__name`, `.tl__sub`,
`.tl__dot`, `.tl__chev`, `.tl__pill` (`--ink`), `.is-err`, `.tl--wrap` · `.c1`…`.c4` / `.hl-1`…`.hl-4` (set
`--flag`, `--hl`, `--hl-deep`) · `.tag`, `.flag.flag--left` · `.strokes` (`.strokes--draw`: drawn once on
arrival, the Home field) · `.hl` (`.hl--a`, `.hl--b`), `.hl-arrive`, `.hl-pass` (on a parent: the `.hl` inside is ink
at rest, its stroke passes under it on hover and keyboard focus; a line of the briefing, a question to try),
`.answer`, `.seg` · `.cite`, `.num`, `.nosrc` · `.mark` (stroke under a name on hover of its `.tl`),
`.mark.is-on` (done, green, once), `.mark.is-working` (amber, once), `.reading-line` · `.work` (a 4px stroke along
the bottom edge of a `relative` sheet; it runs once when the sheet has `.is-working`) · `.pill-sweep` · `.facts`,
`.statusrow`, `.where`, `.panel-done`, `.panel-foot` · `.well`, `.doc`, `.doc__meta`, `.doc__body` · `.layer-side`
(the panel's Radix animation) · `.logo-box`. Still there from before, without loop or blur: `.sk`, `.pulse`,
`.caret` / `.caret-block` (a still ink bar), `.rise-in`, `.fade-in`, `.layer-pop|scrim|dialog|sheet|collapse`,
`.org-tree`.

## 4. What replaces what

| Before | Now |
|---|---|
| `GlassCard` as a card for a thing | `Thing` (`card` or `tile`) |
| `GlassCard` as a container | `GlassCard` (flat) with your padding; a group of settings is one sheet |
| `Dialog` / `DialogContent` for a thing (a tool, a member, a token, an invitation) | `SidePanel` |
| `AlertDialog` inside a dialog | `SidePanel confirm={…}` |
| `DialogContent dismissible={false}` (a secret) | `SidePanel locked` |
| `Badge` on a card, a count, a date, a size on a rectangle | nothing: one `caption`; the rest in the panel (`Facts`, `StatusRow`) |
| `Badge tone="accent"` for a state | `Badge tone="success" \| "destructive" \| "warning"` (in a panel) |
| `<span className="spin" />`, `Button loading` alone | the label's verb (`loadingLabel`), `aria-busy`, `Reading`, `Thing working`, `SidePanel busy` |
| `Beam active`, `GlassCard reading`, `useThinking()` | the same (they now do nothing: remove the call sites) |
| `toast.success('Copied')`, a toast for what is visible in place | said in place (`CopyButton`, `DoneMark`, `PanelDone`); a toast for what happened elsewhere |
| initials in a square, `initialOf` | `Avatar` |
| `bg-ink` (active row) | `bg-selected` |
| `glass-float`, `glass-panel`, `signal-line`, `signal-glow`, `backdrop-blur-*`, `shadow-hi`, `pop-in`, `spot` | remove; a floating layer is `border border-float-line bg-menu shadow-float` |
| `rounded-[20px]`, `rounded-xl`… | `rounded-card` (12) at most |
| `text-accent` for a link | ink + underline (`Button variant="link"`) |
| `PageHeader subtitle / meta`, a helper paragraph | nothing; a promise goes to the panel |

## 5. Rules of use (the founder's, as code)

1. One ink pill per view (`Button variant="primary"`, or one `Thing pillInk`). Everything else is `secondary` or
   `quiet`. The rule is yours to keep: the component does not count.
2. No count, date, size or "last …" on a rectangle; no sentence that explains a screen. Details live in the panel.
3. Two sizes of rectangle, on the same columns: `card` for what the person has, `tile` for what can be added.
4. A click outside the panel only closes it. A step that shows a secret once is `locked`.
5. Colour n is source n (`toneOf`). The three strokes sign the ask field only. A flag counts a section or numbers a
   source. The highlighter marks a source's words, or says "working" (amber) and "done" (green), once.
6. Text on its ground keeps 4.5:1 in both themes (86 pairs computed: `port/contrast.py`). Quiet words on a
   highlighter fail in dark: text on a stroke is `text-fg` (the kit's own pieces already do it).
7. English and French together for every string; the kit's own strings are in `common` (`copy`, `copiedShort`,
   `done`, `noSource`, `close`, `openIn`…).

## 6. Left for you, on purpose (the foundation edited no screen)

- The call sites of what became a no-op: `<Aurora />` (3 shells), `glass-panel` (`app-shell.tsx`), `glass-float` (4
  files outside the kit: `discussions/composer`, `shell/mobile-bar`, `shell/command-palette`, `connexions/catalogue`), `Beam` (3), `GlassCard signal|spotlight|reading` (3), `trackSpot` / `.spot`
  (`discussions/list.tsx`), `<span className="spin">` (`discussions/messages.tsx`, `recherche/answer.tsx`),
  `caret-block` (same two), `pop-in` (`recherche/search-bar.tsx`), `backdrop-blur` (4 files in the app), and
  `ThinkingProvider` once nobody calls `setThinking`.
- `src/lib/verre/motion.ts` still has blur and spring variants (`pageVariants`, `spring`): not a kit file.
- The theme switches (person's menu, Settings, command bar, sign-in pages) work as before; their look is yours.
- The shell (sidebar 256 / rail 60, the ask bar with `Strokes`, the command bar, document scroll), each screen's
  composition, and the public site (it shares `globals.css`: it is light and flat now, its `signal-line` and
  `site-gradient` effects are gone or off; `--logo-2` is kept for it).
- `Section description` is still drawn: decide sentence by sentence.
- The mini-game canvas (`connexions/jeu.tsx`) reads `--accent`, `--warning`, `--destructive`, `--menu`, `--text`,
  `--mono`: they are still declared in `globals.css` (a test checks it), with the new values.
- Tests I changed: `onboarding/code-tools-card.test.ts` (3 icons instead of 5: "Copy" has no icon). New:
  `src/components/verre/ui/kit.test.ts` (server-render tests of the new pieces: follow it for yours).
