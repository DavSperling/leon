# Port map: the public site (area "site")

Read-only study. Nothing in the worktree was touched. Paths below are relative to the worktree root
`/Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484` unless they start with `/`.
Prototype root = `prototypes/refonte-2026-11/papier/` (written `P/`). Real site code = `src/components/site/` (written `S/`)
and `src/app/(site)/`.

---------------------------------------------------------------------------------------------------------------------

## 0. The five things a builder must know before touching anything

1. **The prototype is light only, English only, desktop-first, and measured on English copy.** The real site is dark by
   default (`<html data-theme="dark">`, `src/app/layout.tsx:40`), has a theme toggle, two languages, and French copy
   that is ~10 % longer (5,938 words vs 5,387 in `site.*`). Three decisions are open (section 10): dark theme, nav
   entries, and the connector categories.
2. **No new dependency is truly needed.** The prototype loads from a CDN GSAP 3.13.0 (+ ScrollTrigger, Flip, SplitText),
   Lenis 1.3.4 and Rough Notation 0.5.1 (`P/index.html:338-343`). The repo has `motion` 14.5.0 (`package.json:38`, used by
   the app, not yet by the site) and a CSS reveal system (`S/site.css`). Section 8 lists each animation.
3. **Pasting the static HTML will not work.** `P/css/site.css` defines global class names that collide with Tailwind 4
   utilities (`.grid` is a 12-column grid there but `display:grid` in Tailwind; also `.wrap`, `.sheet`, `.btn`, `.hl`,
   `.band`). Builders transform React components and map the prototype's classes into either CSS Modules, a scoped
   `site-` prefix, or Tailwind utilities.
4. **The site and the app share more than the prototype shows.** `SiteShell` (`S/site-shell.tsx`) also wraps the sign-in and
   sign-up pages (`src/app/(auth)/layout.tsx:11`, with `footer="bar"` and `AuthAside` from `S/auth-aside.tsx`). Both read
   the same `src/app/globals.css` tokens, the same `Brand`/`Logo`, and the same root layout fonts. Whoever ports the shell
   owns the auth layout's dependency on it: coordinate with the auth builder.
5. **Contract tests pin parts of this area** (section 9). They are the builders' safety net: keep them green, do not edit
   them to make a port pass unless the contract itself changed on purpose.

---------------------------------------------------------------------------------------------------------------------

## 1. Real files of the area, read in full

### Routes (`src/app/(site)/`)
| File | Lines | What it does |
|---|---|---|
| `layout.tsx` | 14 | `<SiteShell>{children}</SiteShell>`; `metadata.metadataBase = BETTER_AUTH_URL` (else `http://localhost:3000`). No page reads the session. |
| `accueil/page.tsx` | 17 | Metadata from `site.meta.homeTitle/homeDescription` (`title.absolute`), canonical `/`; renders `HomeSignal`. Also served at `/` for visitors without a session cookie by `src/proxy.ts` (rewrite, `Cache-Control: private, no-store`; GET/HEAD only). |
| `produit/page.tsx` | 12 | `ProduitPage`. Meta `productTitle/Description`. |
| `cas-usage/page.tsx` | 12 | `CasUsagePage`. Meta `useCasesTitle/Description`. |
| `cas-usage/[equipe]/page.tsx` | 31 | `dynamicParams=false`, `generateStaticParams` from `TEAMS` (6 slugs: direction, ventes, support, produit-tech, projets, arrivees), `notFound()` otherwise; `EquipePage`. Slugs identical in both languages. |
| `connecteurs/page.tsx` | 16 | `ConnecteursPage`; description takes `{count: TOOL_COUNT}`. |
| `securite/page.tsx` | 12 | `SecuritePage`. |
| `tarifs/page.tsx` | 12 | `TarifsPage`. |
| `documentation/page.tsx` | 53 | Server page. Reads `?vue=agent`; builds `installCommand()`, `serverAddress()`, `claudeCodeInstructions(...)` (null when the server address is refused); `alternates.types['text/markdown']='/documentation.md'`; in agent view renders the same Markdown as the route `src/app/documentation.md/route.ts` (`?lang=fr|en`, cookie, else English). |

### Shell and shared pieces (`src/components/site/`)
| File | Lines | Role |
|---|---|---|
| `site-shell.tsx` | 54 | `ThinkingProvider` + `Aurora` (Verre background), skip link `#contenu` (`site.shell.skip`), `SiteHeader`, `GoogleOneTap` (only when `socialProviders.google`), `<main id="contenu" tabIndex=-1 class="relative z-[2] min-h-dvh overflow-x-clip">`, footer: full `SiteFooter` / `'bar'` (`SiteFooterBar` only, used by auth) / none. Imports `./site.css` and `./fx/fx.css`. |
| `site-header.tsx` | 283 | Client. `currentOf`/`isActive` (21-25), `ThemeButton` (42-61; `useTheme`; `site.header.lightTheme/darkTheme`), `TeamsMenu` (63-104; Radix `NavigationMenu.Content`, 6 teams with icon + `team.pitch`, link `/cas-usage`, `site.header.allUseCases`), `MobileMenu` (106-190; Radix `Sheet` from `verre/ui/dialog`, nav links, 6 team chips, create/sign-in, theme button; `site.header.menu/close/nav`), `SiteHeader` (192-283): fixed floating pill 58px, `data-scrolled` after 8px, `.site-progress` CSS reading-progress bar, logo `Link href="/accueil"` + `Brand`, `NavigationMenu` (Use cases is a trigger + menu, others links with `ActiveDot`), on `/inscription` the two buttons swap (`onSignUp`). Under 960px: brand, "Create", menu button. |
| `site-footer.tsx` | 140 | `LanguageSwitch` (18-38): a `<form action={setLocaleAction}>` with `<button name="locale" value="en|fr" lang=...>` (works without JS or session); `SiteFooterBar` (41-58): © 2026 Leon, language, `MotionSwitch`, `taglines.source`; `SiteFooter` (61-140): `taglines.pitch`, 4 columns (Product 6 links incl. `/produit#retrouve`, `/produit#discute`; Use cases = 6 teams; Trust: `/securite`, `/securite#pas-encore`; Account: `/connexion`, `/inscription`), outlined giant "Leon" watermark. |
| `motion-switch.tsx` | 20 | Client. "Stop / start animations" (`site.footer.motionOff/motionOn`), `aria-pressed`, `setMotionOff` writes `<html data-motion="off">` + `localStorage leon-motion` (`src/lib/verre/instant.ts`; script in `src/app/layout.tsx:29`). WCAG 2.2.2. |
| `google-one-tap.tsx` | 63 | Client. Fetches `/api/auth/get-session`; if none, loads Google GSI script and calls `oneTapAction(credential)` from `src/app/(auth)/actions.ts`. Renders null. |
| `parts.tsx` | 348 | Server bricks: `Container` (15, 1200px, px-5/8), `ToolLogo` (20, `/logos/<id>.svg` on a white chip), `LogoMarquee` (58, CSS marquee, two copies, 2nd `aria-hidden`), `Kicker` (99), `SectionHeading` (114), `QueryCode` (154), `isFilterQuery` (179; used by content.test.ts), `Excerpt` (182, `**x**` highlights), `Cite` (198), `CitedAnswer` (211), `LeonMark` (227), `ArrowLink` (238), `CtaLink` (266, primary/secondary, md/lg), `CtaBand` (304, default buttons `/inscription` + `/connexion`). |
| `demo-card.tsx` | 162 | `DemoSearchField` (12), `DemoSourceRow` (53), `DemoAnswerCard` (91), `DemoCard` (125). Used by `HeroDemo`, `TeamTabs`, cas-usage, auth-aside. |
| `team-tabs.tsx` | 127 | Client. Radix Tabs of the 6 teams: `Questions` (typed queries, `QueryCode` when `isFilterQuery`), `Gains`, tools, a demo answer. Keys `site.teamTabs.list/typed/tools/more`. |
| `auth-aside.tsx` | 191 | Client. Right panel of sign-in/up (points, briefing excerpt from `useSiteContent().briefing`, demo). Keys `site.auth.*`. Belongs to the auth builder but consumes `BRIEFING` and `DEMOS`: any type change in `content.ts` reaches it. |
| `content.ts` | 1396 | All structured copy, FR then EN. See section 5. |
| `content.test.ts` | 51 | EN/FR parity of ids, tools, icons, filter-query shape, `[n]` refs <= sources, FAQ MCP wording. |
| `site.css` | 250 | Scroll reveal (`.site-reveal`, `animation-timeline: view()` under `@supports`), `.site-rise` (stagger by `--i`), `.site-gradient`, header (`.site-header`, `.site-progress`), `.site-marquee` (CSS marquee, pauses on hover), `.site-cta`, halo/dots/grid backgrounds. Verre look. |
| `fx/` | `fx.css` 209, `index.ts` 6, `layers-3d.tsx` 107, `logo-sphere.tsx` 207, `particle-field.tsx` 216, `split-words.tsx` 49, `tilt.tsx` 76 | Showcase effects of the rejected look: 3D layers, rotating logo sphere (home + connectors), canvas particle field (reads `--accent` and `--logo-2` via `getPropertyValue`, `particle-field.tsx:68-69`), split-word title entrance, pointer tilt. None exists in the prototype. |
| `home/signal.tsx` | 733 | The real home, 11 sections (section 3). |
| `home/hero-demo.tsx` | 284 | Client. Hero demo (section 3.1). |
| `home/signal.css` | 27 | `.sig-bob` floating logos, demo source stagger. |
| `pages/page-hero.tsx` | 200 | `PageHero` (19; props `kicker, title, accent, lead, actions, aside, crumbs, current, align, children`), `PageSection` (165), `PlannedBadge` (188). Used by every inner page. |
| `pages/pages.css` | 161 | 3D card stack, typing, raised plane, rights perspective visual (`.pg-iso`), FAQ answer animation. |
| `pages/tarifs.tsx` | 203 | Pricing (section 4.3). |
| `pages/connecteurs.tsx` | 194 / `connecteurs-catalogue.tsx` 220 | Connectors (section 4.4). |
| `pages/securite.tsx` | 288 | Security (section 4.5). |
| `pages/produit.tsx` | 485 | Product: 4 pillars with visuals `CaptureVisual` (113), `KeepVisual` (187), `FindVisual` (208), `DiscussVisual` (268), `PillarSection` (340), `FlowAside` (382), `ProduitPage` (432). **No new design.** |
| `pages/cas-usage.tsx` | 431 | `CasUsagePage` (182-266: 6 `TeamCard`s, `SituationsSection` of 9 situations, `TeamTabs`, questions, `CtaBand`) and `EquipePage` (271-430: hero with crumbs, questions, gains, tools + `/connecteurs`, other teams, `CtaBand`). **No new design.** |
| `pages/documentation.tsx` | 285 (+ `documentation-view.tsx` 41, `documentation-markdown.ts` 164, `typing-list.tsx` 56, tests 598 + 180 + `documentation.test.ts`) | Docs: table of contents, `Code`/`Block`/`DocSection`, `CopyButton`/`CodeLine` from `verre/ui/copy`, human/agent `ViewSwitch` (`?vue=agent`, `router.replace`), "copy all" and "open raw" (`/documentation.md`). **No new design.** |

### i18n and locale
- Locale is **a cookie, not a URL**: `leon-locale` (`src/i18n/request.ts:10`), default **English** (`DEFAULT_LOCALE='en'`, line 9),
  chosen by `localeOf`. Same URLs in both languages (`/accueil`, `/tarifs`...), no hreflang. The footer form posts
  `setLocaleAction` (`src/app/(app)/reglages/actions.ts`). `<html lang>` = `getLocale()`.
- Messages: `messages/en.json` and `messages/fr.json`, block `"site"` starts at line 862 in both (ends before `"onboarding"` at 1487).
  467 leaf strings each; 5,387 EN words, 5,938 FR. Namespaces (leaf counts): `meta` 15, `cta` 6, `common` 15, `shell` 1, `header` 7,
  `footer` 11, `auth` 16, `demo` 3, `heroDemo` 10, `teamTabs` 4, `layers` 15, `sample` 6, `home` 78, `product` 50, `useCases` 27,
  `connectors` 48, `catalogue` 15, `security` 33, `pricing` 22, `documentation` 85. Typed from `fr.json` (`AppConfig.Messages`): a key
  missing in FR fails the typecheck; a key missing in EN is caught by `src/i18n/messages.test.ts`.
- Structured copy (`content.ts`) is **separate** from messages: FR tables (lines 26-730), EN tables `*_EN` as `Twin<typeof FR>`
  (line 733 on), `CONTENT_FR` (1357), `CONTENT_EN` (1374), `contentFor(locale)` (1392), `useSiteContent()` (1396, works in server and client components).
- Every visible string goes through `nb()` (`src/lib/verre/nb`): French typographic spaces (thin non-breaking before `? ! : ; »`).

### Fonts and styles shared with the app
- Root layout (`src/app/layout.tsx:12-25`): `Manrope` (`--font-manrope`, body), `Geist_Mono` (`--font-geist-mono`; kickers, meta, terminal),
  `Inter` 500 (`--font-inter`, only the "Leon" word inside `Brand`). Tokens in `src/app/globals.css` (834 lines): `@theme` at 5/124/167/186/191,
  `[data-theme="dark"]` 19, `[data-theme="light"]` 71; `[data-motion="off"]` blanket rule at 290-300, `prefers-reduced-motion` at 301.
- Site-only verre imports: `Brand`, `Logo` (`verre/shell/brand.tsx`, current logo v2, Inter 500), `Aurora`, `ThinkingProvider` (`verre/shell/thinking.tsx`),
  `Sheet*` (`verre/ui/dialog`), `Pill`, `Button`, `Beam` (`verre/ui/surfaces`), `CopyButton`/`CodeLine` (`verre/ui/copy`), and
  `@/lib/verre/{cn,nb,instant,theme,text}`. If the Verre folder is removed or reskinned, these are what the site needs.

---------------------------------------------------------------------------------------------------------------------

## 2. The new public pages (prototype), what they are

All four are static, complete without script, light only, English only, fictional company "Kestrel Studio".

| Page | Size | Loads |
|---|---|---|
| `P/index.html` (home) | 48 KB | `css/tokens.css`, `ui.css`, `site.css`, `motion.css`, `motion-{hero,rules,dev,ambient}.css`; `../shared/demo-data.js` (`LEON_DEMO`), `js/demo.js` (`LeonUI` HTML-string builders), `js/site.js` (`Leon` state, hooks, events); then `defer`: GSAP 3.13.0 + ScrollTrigger + Flip + SplitText (cdnjs), Lenis 1.3.4 (unpkg), Rough Notation 0.5.1 (unpkg), `js/motion/core.js`, `hero.js`, `rules.js`, `dev.js`, `ambient.js`. Fonts: Google Fonts link, Schibsted Grotesk 400-700 + STIX Two Text 400/italic. |
| `P/pricing.html` | 12.6 KB | tokens, ui, site, `css/pages.css`, `js/pages.js` (vanilla: header line after 24px, phone menu, `[data-rv]` entrance via IntersectionObserver; no GSAP). |
| `P/security.html` | 14.4 KB | same + `css/security.css`. |
| `P/connectors.html` | 27 KB | same + `css/connectors.css` (prefix `cx-`), `js/connectors.js` (filter only, ~60 lines). |

Guides: `P/NOTES.md` (home; newest passes first, newer wins over the tables below it), `NOTES-pages-{pricing,security,connectors}.md`,
`NOTES-motion-{hero,rules,dev,ambient}.md`, `NOTES-motion-rules.md`. The pages' own "decisions to know" lists are repeated in section 10.

Visual system the four pages share (from `P/css/tokens.css`): white ground `--ground`, desk band `--desk #F1F1EE`, ink `#0F0F0D`, 4 highlighter
colours `--m1..m4` (pink, green, blue, amber) with deeper `--d`, flags `--f`, **radius 6px** (`--r`, sheets/fields) and 3px marks, pills 999px,
sizes H1 clamp(48..56) / H2 40 / lead 18 / body 16 / small 13.5 (inner pages: 48 / 32), 12-col grid, `--margin` 48, `--maxw` 1344,
`--nav-h` 72, section gap 148, band padding 104. Note: the **app** prototype uses radius 12 for cards (`--r-l`); the public pages use 6.
Builders of site and app must agree whether these are two radii or one (see risks).

---------------------------------------------------------------------------------------------------------------------

## 3. The home page: prototype section by section against the real one

### 3.0 Header, footer, shell
| Prototype | Real counterpart | Work |
|---|---|---|
| `header.nav` sticky 72px white, wordmark + 6 links (Product, Connectors, Developers, Security, Pricing, Sign in) + ink pill "Create a workspace" + phone menu button (`P/index.html:31-46`, `site.css:46-56`). Line under bar after 24px (`site.js`/`pages.js`). | `S/site-header.tsx` (283). | Rewrite the visual layer; keep the logic: `usePathname` current state (`aria-current` page/true), `onSignUp` swap on `/inscription`, Radix `Sheet` menu (focus first link on open, close button, `aria-label`s), skip link. Scroll listener threshold: prototype 24px, real 8px (pick one). Keep `Link href="/accueil"` wrapping `<Brand>` (contract test). Drop `.site-progress` and the glass pill unless the founder wants them. |
| Prototype nav lacks **Use cases** and **Documentation**; adds **Developers** (home anchor). | `NAV_LINKS` (`content.ts:26`, `NAV_LINKS_EN:735`): Product, Use cases, Connectors, Security, Pricing, Documentation; `TeamsMenu` mega-menu of 6 teams. | **Decision** (section 10-B). Default proposal: keep the six real entries and hrefs (the pages exist and are linked everywhere); show Use cases as a plain panel of 6 rows (team name + one quiet caption `team.pitch`) in the new look; reach "Developers" from the footer and from the home. |
| Prototype has **no theme toggle**, no dark theme. | `ThemeButton` (header), `useTheme`, `data-theme` boot script, `theme-toggle.tsx` in auth. | **Decision** (10-A). |
| Footer: ink band, wordmark, 3 columns (Product 5, Trust 2, Account 2), "Language: English · Français", © 2026 (`P/index.html:291-331`). Phone: `<dialog class="bsheet">` for a source (`:326`). | `S/site-footer.tsx` (140): promise line, 4 columns incl. Use cases (6 team links), `LanguageSwitch` form, `MotionSwitch`, `taglines.source`, outlined "Leon" watermark. | Restyle as the ink band. **Keep**: the Use cases column (6 pages need an inbound link), `LanguageSwitch` form + `setLocaleAction` (the prototype's "Français" is `href="#"`), `MotionSwitch` (the new page loops a marquee and a timed story: WCAG 2.2.2 still needs it), the `/produit#retrouve` and `/produit#discute` and `/securite#pas-encore` anchors (keep French ids). Drop the watermark and its mask. `SiteFooterBar` must stay exported for the auth layout. |

### 3.1 Hero (`section.hero#top`, `P/index.html:49-94`)
Prototype: H1 "Know exactly what you promised. / Source included." (two `.h1__line` boxes, the second carries `.swp` with three flat strokes
`[data-sweep-seg]`), lead, ink pill + "Open beta · no billing yet", three tabs ("A client commitment", "A known bug", "A departure") with a sliding
`clip-path` indicator, then the **stage** on a desk band: the answer sheet (`#hero-answer`: question row with avatar, 3 sentences, each carrying a
highlighter stroke in its source colour, number chip `[data-cite]`, a flag `[data-flag]` level with its sentence, footnote rows `[data-note]`) and the
**pile** of three original-document sheets (`#pile`, slots `top|b1|b2`, each document type-specific: transcript, quote email, ticket with properties).
Clicking a sentence, number, flag, footnote or sheet selects that source; pointing or focusing lights both ends (`.is-lit`). On a phone the source opens in a bottom sheet.

Real: `Hero` in `S/home/signal.tsx:41-112` (beta pill link to `/produit`, H1 split words with `site-gradient`, lead, two `CtaLink`s, `betaNote`, halo, `ParticleField`, `Tilt`ed `HeroDemo`) and `S/home/hero-demo.tsx` (284).

Keys now: `site.home.beta/pill/title/titleAccent/lead/betaNote`, `site.cta.create/seeHowItWorks`, `site.heroDemo.tabs/pause/play/pauseShort/playShort/srExample/srQuestion/srAnswer/bar/unknown`, `site.demo.search/noAnswer/sources`, `site.common.fictional`.

Behaviour of the real `HeroDemo` that must survive (all states):
- 4 scenarios in Radix `Tabs` (arrow keys): `promesse`, `bug`, `depart`, **`inconnu`** ("Sans source" / unknown: answer says nothing is on record, `demo.unknown`, string `site.heroDemo.unknown`). The prototype has 3 tabs; its 4th (`unknown`) lives in rule 2 below. Keep a path for the unknown case in the hero (a fourth tab) or accept that it moves to rule 2 (decision for the founder; default: keep four ids in `DEMOS` because `team.demo` and `content.test.ts` depend on them).
- Typed query (34ms/char), search beam, sources arrive staggered, answer streams word by word (52ms/word) with `[n]` citation tokens, hold 6.5 s then auto-advance to the next tab. Auto-advance stops when a tab is chosen, when paused (button with `site.heroDemo.pause/play`), when pointer or focus is inside, when off screen (IntersectionObserver) or the tab is hidden (`visibilitychange`).
- Reduced motion / `data-motion="off"` (`useInstant()`): final state at once, no pause button.
- Screen readers: a `sr-only` block gives example, question and final answer; the animated copy is `aria-hidden`.
- Pointing at `[n]` lights the matching source (`lit` state).
- Hover/focus on the demo pauses it (`hold`).
The prototype's demo **plays once, then stays** (no cycling): so the pause button becomes unnecessary for the hero, but any looping element still needs the global switch.

Work: rebuild `HeroDemo` visually as answer sheet + pile; keep its timeline state machine and visibility pausing; map `Demo`/`DemoSource` to the richer prototype data (section 5, gap G3). Replace Radix Tabs' look with the prototype's tab + sliding indicator but **keep Radix** (roles, arrows, Home/End; the prototype adds Home/End by hand). `Beam` and `Tilt` go. The flag-level layout (`LeonUI.layoutFlags`, ResizeObserver on `[data-linked]` roots) must be ported as a layout effect; it measures where each sentence starts and puts the flag level with that line.

### 3.2 Three rules (`section.rules#product`, `:96-183`) vs. real home sections 3-5
Prototype: three stacked `article.rule` blocks (the no-JS/phone/reduced-motion fallback), each heading + lead + a fragment:
1. "Every sentence wears **the colour of its source.**" (answer with 3 mini source sheets: Intercom, Linear, GitHub),
2. "When the record is silent, **Leon says so.**" (answer "I don't know..." with the dashed empty flag `[data-flag="0"]` and "no source"; then a second sentence sourced from a Pipedrive note),
3. "Leon sees what you see. **Nothing more.**" (switch Julie / Sophie: Julie's view has an email stamped "Private to you" and two documents; Sophie's view never contains the email; `aria-live="polite"` body).
On wide screens the section is pinned and scrubbed (section 8), with a list of the three names `[data-rules-list]` as navigation.

Real counterparts (none maps one to one): `Problem` (218-253, 3 cards with scatter logos/tasks/chat), `Steps` (255-370, 3 numbered cards), `UnderTheHood` (383-431, `Layers3D` + 3 layers), `Proof` (462-516: "La source, ou rien." with an unknown demo, `site.home.proofUnknown`).
Work: new component `HomeRules` with three server-rendered rule blocks and one client island for the scroll scrub and the Julie/Sophie switch (`site.view` state, `Sophie's markup never contains the email` is a security-relevant statement: keep it true in the React version, do not render then hide the email node). **Rehome, do not lose**: Problem cards, Steps, Layers visual and Proof copy are not in the approved prototype home; their content survives on `/produit` (Steps/Layers ~ pillars), `/securite` (layers: `site.layers.*` is shared with the security/rights visual) and `/cas-usage`. See gaps G1-G2.

### 3.3 Connectors (`section.conn#connectors`, `:185-199`) vs. `ToolsStrip` (114-154)
Prototype: H2 with a count-up ("<span data-count=42>42</span> connectors. **Nothing to migrate.**"), lead, two-row logo marquee of 42 tools (21 each, opposite directions, 40 s / 46 s), "See all 42 connectors" link (`href="#"` in the prototype: must become `/connecteurs`), one small line on the AI-conversations extension. Wrapped static grid when no script.
Real: logo sphere (`LogoSphere`, rotating, 44px logos) + family pills with counts (`toolGroups` `g.tools.length`), `site.home.toolsTitle` (takes `{count}`), `toolsTitleAccent`, `toolsLead`, `spin`, `seeConnectors`.
Work: `LogoMarquee` (`parts.tsx:58`) already exists as CSS marquee with two copies and `aria-hidden` on the second; restyle it into the prototype's two-row version (row 2 reversed via `data-reverse`, durations 40/46 s). Drop the sphere, the family pills with counts (founder: no counts on rectangles). Count-up: section 8. Keep `TOOL_COUNT` as the source of "42" (never hard-code 42: `Object.keys(PROVIDER_LABELS).length`, `content.ts:46`).

### 3.4 Morning briefing (`section.brief#briefing`, `:201-218`)
Prototype: a memo sheet on a desk band (title, date "Tuesday, November 10, 2026 · 08:45", 3 sections, 10 lines each with number chips 1-5 for sources), H2 "A briefing **every morning.**", lead, small line (own AI assistant over MCP), link "Read the documentation" (`href="#"`: must become `/documentation`).
Real: no home section; `BRIEFING` (`content.ts:592`, 3 parts: "Ce que vous avez fait", "Ce qui a bougé", "Ce qui reste ouvert", plain strings) is consumed by `AuthAside` (`auth-aside.tsx:48`) and the Assistant section of the home (`signal.tsx:595`, `site.home.briefingMeta`).
Work: extend `BRIEFING` items to `{ text, source?: 1..5 }` in FR and EN (`Twin` keeps them in sync) or keep two shapes; update `AuthAside` in step. Memo date is fictional: use a fixed string per language, not `new Date()` (hydration).

### 3.5 For developers (`section.dev#developers`, `:221-241`, ink band)
Prototype: H2 "Shared memory and **dreaming** for your coding agents.", lead, 3 facts (`[data-fact]`), one closing line, link "Read the documentation"; fragment: three-step strip (Evening / Night / Morning, `data-story-step`, `aria-pressed`, marker), desk row (3 sheets loose then filed into a pile, with flags and "Thread fix/export-pagination"), a terminal figure (`claude · kestrel/app` evening, `codex · kestrel/app` morning, 13 printed lines with coloured source marks, 3 source lines), "Replay" button, "Fictional example". Section height tuned to one screen (`--dev-h` 660px / 594px measured in English).
Real: `Assistant` (`signal.tsx:518-622`): kicker/title/lead (`site.home.assistant*`), `assistantLink`, a small terminal (`terminal`, `terminalSearch`, `terminalRemember`, `terminalSaved`, `briefingMeta`). Data: `agentContext` in the prototype's `shared/demo-data.js`.
Work: new client island `DevStory` (state `step 1|2|3`, timers, pause when off screen like `HeroDemo`, any click/key skips to Morning, step buttons replay that step, "Replay" appears after the first play, if the page loads below the section it is simply in Morning). Static (server) markup must show **Morning with the three captions** so no-JS, reduced motion and `data-motion="off"` read the full story. New copy: ~20 terminal lines + captions + 3 facts, EN and FR. Terminal text is **claimed behaviour of Claude Code, Codex, Cursor, Antigravity**: have the CLI/capture owner confirm the wording ("Session ended", "Leon · session kept") before publishing (the prototype notes say it is "ours, not what the tools print"). Mono font in the terminal is allowed (prototype: "terminal only").

### 3.6 Security (`section.sec#security`, `:243-267`) vs. real `Security` (624-671)
Prototype: "What is **in place**, and what is in progress." with a "In place" list (3 items with drawn ticks `data-check="yes"`) and an "In progress" list (3 items with half rings `data-check="progress"`), link "Read the security page".
Real: `Security` teaser: `site.home.securityTitle/securityLink/securityNotYet/securityList` + the security facts list (8 `SECURITY_FACTS`). Work: restyle; items from `securityFacts` (first 3) and `notYet` (first 3). Ticks and rings are inline SVG with `pathLength`: CSS-drawable (section 8).

### 3.7 Close (`section.close#close`, `:269-289`)
Prototype: statement "Everything your team said, **on record.**" (one amber stroke on the last words), lead, "Create a workspace" pill + "Sign in" outline pill, and on the right a **sign-up form sheet** ("Name your workspace": Workspace name prefilled "Kestrel Studio", Work email, pill). The form is inert (`data-inert`).
Real: `CtaBand` (`parts.tsx:304`): `taglines.dit`, `site.home.ctaText`, `/inscription` + `/connexion`.
Work: the heading and two links map directly (`/inscription`, `/connexion`; the prototype's `app/signup.html`, `app/signin.html`). **The form has no real counterpart**: the real sign-up (`src/app/(auth)/inscription/page.tsx` -> `AuthForm page="inscription"`) asks for company name (`organizationName` validated in `src/app/(auth)/actions.ts:58`), name, email, password, and offers Google, Microsoft, SSO. Do not send name or email in the URL. Options for the founder: (1) drop the form and keep the two pills (cheapest, nothing dead); (2) keep the form with a server action that stores nothing and redirects to `/inscription` (decorative, not recommended); (3) a real prefill via a short-lived cookie read by `AuthForm`. Default recommendation: (1), unless the founder wants the prefill.

### 3.8 Real home sections with no prototype counterpart (must be rehomed or consciously dropped)
`Problem`, `Steps`, `UnderTheHood` (Layers3D), `UseCases` (TeamTabs of 6 teams), `Proof`, `Faq` (first 4 of `faq` as accordion + `faqLink` to `/tarifs`), `Assistant` terminal teaser, plus `ParticleField`, `Tilt`, `LogoSphere`, `Aurora`. See gaps.

---------------------------------------------------------------------------------------------------------------------

## 4. The other new pages against the real ones

### 4.1 Shared kit for the inner pages (`P/css/pages.css`, 119 lines)
`.ptop` (page top, H1 48), `.pstage` (desk band joined to the top), `.psec` (+ `.psec__head`: heading on columns 1-6, lead on 7-12), `.pclose`, `.ptable`, `.qa`, `.tlink`. Real equivalents: `PageHero` / `PageSection` (`page-hero.tsx`) with `kicker`, `accent`, `lead`, `actions`, `aside`, `crumbs`, `align`. The prototype has **no kicker, no accent gradient, no breadcrumb, no aside visual**: `PageHero`'s `crumbs`/`current` are used by `EquipePage` and `Documentation` (keep them, restyled).

### 4.2 Not covered by any new design
`/produit`, `/cas-usage`, `/cas-usage/[equipe]` (x6), `/documentation` (+ `/documentation.md`). They must at minimum get the new look from the shared `PageHero`/`PageSection`/`CtaBand`/`TeamTabs` primitives, with no new composition invented per page (the founder approved only home, pricing, security, connectors). Builders: if the primitives are restyled correctly these pages follow; each page's own Verre details need a pass (list below).
- `/produit`: `CaptureVisual`, `KeepVisual`, `FindVisual`, `DiscussVisual` (`produit.tsx:113-340`) are mock UI built with glass cards, `Tilt`, `fx-pop`, `FakeSwitch`; `FlowAside` (382) lists the 4 pillars with anchors `#capte #garde #retrouve #discute` (footer links to `#retrouve` and `#discute`). Keep ids. `SYNTAX` (6 real search filters, `content.ts:582`) is shown in `FindVisual`.
- `/cas-usage`: 6 `TeamCard`s (icon from Lucide, `pitch`), 9 `SituationCard`s (`SITUATIONS`, with `who`, `moment`, `title`, `question`, `does`, `gain`, `tools`, `alsoReads`), `TeamTabs`, questions list; `/cas-usage/<slug>`: crumbs, questions, gains, tools, other teams. The icons (Compass, Handshake, Headset, GitPullRequest, KanbanSquare, DoorOpen) sit in tinted boxes in the old look: founder rule is a rectangle with one name and one quiet caption.
- `/documentation`: very different density (code blocks, `CodeLine`, copy buttons, table of contents `lg:grid-cols-[210px_...]`, agent/human switch). Keep behaviour; restyle containers only. 598 + 180 lines of tests guard its content.

### 4.3 pricing.html vs `tarifs.tsx` (203)
| Prototype | Real | Work |
|---|---|---|
| `.ptop`: "A free pilot. / Then €25 per active user." (first line marked in pink), lead, pill, "Open beta - no billing yet". | `PageHero` with `site.pricing.heroTitle/heroAccent/heroLead`, kicker `meta.pricingTitle`. | New hero keys or reuse; the pink mark = the "what is true today" convention. |
| One comparison **table lying as a sheet**: columns Pilot / Team / Dedicated; rows Price, Made for, Billing, Hosting; group "In every plan" with 6 rows (Connectors, Search, Chat, Briefing and assistants, Capture, Protection). A real `<table>` laid out with CSS grid, every part with an ARIA role; under 700px each row becomes a block. | `PlanCard` x3 in 3 Tilt cards (30-108) with `plan.featured` (Team), `recommended` badge, price 44px, `plan.cta` button, `plan.features` checks; "everywhere" panel of 8 items (`EVERYWHERE` 17-26 -> `site.pricing.everywhere.*`); FAQ accordion of 6 (`<details>`). | Data: `PLANS` (id pilote/equipe/dediee, `name, price, unit, text, features, cta, featured`) is no longer enough for the table rows; add `made-for`, `billing`, `hosting` per plan or write the table copy in messages (`site.pricing.table.*`). `plan.features`, `plan.cta`, `featured`, `site.pricing.recommended` become unused: remove or keep for the app. "In every plan" merges `everywhere.search+answer` and `secrets+keys` (8 keys -> 6 rows). Keep the `{count: TOOL_COUNT}` param in the connectors row. Per-plan CTA buttons disappear: one ink pill (rule: one pill per view) goes to `/inscription` (the old three buttons all went to `/inscription` anyway). |
| Six Q&A all open (dl), with inline links to connectors and security. | `faq` x6 in `<details>` (`pg-faq`). | Render open (no accordion), FAQ strings unchanged (EN/FR `FAQ`/`FAQ_EN`). Inline links need `t.rich` (or split strings): "See the connectors" -> `/connecteurs`, "Read the security page" -> `/securite`. |
| Footer note "Proposed prices, excluding VAT. Billing is not in place yet". | `site.pricing.taxNote`. | Direct. |
| Price in euros. | Same (`25 €`). | Market is USA + Israel: currency is a product decision, not for builders. |
| "30-day" deliberately omitted. | `site.meta.pricingDescription` still says "A free 30-day pilot" (`messages/en.json:877`). | Existing inconsistency: align the meta description with the page (founder). |

### 4.4 connectors.html vs `connecteurs.tsx` (194) + `connecteurs-catalogue.tsx` (220)
| Prototype | Real | Work |
|---|---|---|
| Hero in home composition: "42 connectors, plus **your AI conversations.**", lead, pill + beta line. | `PageHero` + `SphereStage` (`LogoSphere`), `site.connectors.heroTitle({count})/heroAccent/heroLead/browse`. | Drop sphere; keep `{count}`. |
| Catalogue: left sticky **index** (filter field, 6 category links with counts, legend "One click / API key"), right **42 rows**: logo, name, "what Leon reads" line, how it connects (One click / API key); filter matches name + category + reads line, Escape or "Show all connectors" clears, empty categories disappear from list and index, `role="status"` announces the count. Field is `hidden` until script runs. | `ConnecteursCatalogue` (client): family `Pill`s with counts + text filter on name only (`fold()`), grid of cards with `OAUTH` set (18-39, 20 tools = "Se connecter avec..."), states: all / by family / by name / empty (two variants: `hiddenByFamily` with `hiddenTitle`+`hiddenElsewhere` and plain `noneTitle`+`noneHint`) with buttons `searchAll` / `showAll`; `role="status"` count; keys `site.catalogue.*` (15). | Rewrite as rows. **New data per tool**: "what Leon reads" lines for 42 tools (483 words, English only), taken by the prototype author from each connector's English help text in `src/server/connectors/<tool>/catalog.ts` or comments. These must become data keyed by `ProviderId` (messages `site.catalogue.reads.<id>`, 42 keys x 2 languages, or a `READS` table beside `OAUTH`). Re-verify each claim against code before shipping (brand rule: no promise the code does not keep); example from the prototype: Gmail "Promotions, Social, drafts and spam are left out", Outlook "Inbox, sent items and calendar... admin approves once". Keep the empty-state logic (including the by-family variant, which the prototype lacks) and `role="status"`. |
| Six categories, order: Email-chat-files 4, Meetings 8, Projects-docs 13, Engineering 4, CRM 5, Support 8 (`cat-email`...). | `PROVIDER_FAMILIES_ORDER` = dev, reunions, projet, crm, support, mails (`src/lib/providers.ts:5`); counts: dev 5, reunions 8, projet 13, crm 5, support 8, mails 3; EN labels `FAMILY_LABELS_EN`: Dev / Meetings / Project management / CRM / Support / "Email, chat and calendar". | **Mismatch.** The prototype moves Notion from Dev to Projects, moves Google Drive from Project to the mail family, renames and reorders. `PROVIDER_FAMILIES` is shared with the app's Connexions screen and the onboarding. Decision 10-C: either adopt the prototype's grouping in `src/lib/providers.ts` (touches app) or keep the real families on the site page. Default: keep real families (less blast radius), reorder only the page. |
| Ink band "Your conversations with AI assistants" (extension, coding tools, own assistant), link to `index.html#developers` and docs. | `CHANNELS` x3 cards (extension, coding, MCP) with `p1..p3` bullets, `site.connectors.channels.*`, `ai*` keys. | Merge into the band; keep the three channels' facts; do not name the two assistant sites the extension captures (marketing rule in the file's header comment). |
| "In progress." list of 3 with half rings: Google Calendar, Microsoft 365, images and scanned PDFs. | `PLANNED = ['google','microsoft','files']` cards with `PlannedBadge`, `site.connectors.planned.*`. | Restyle; ensure the list still matches what is not built (Microsoft is moving: re-check before shipping). |
| Closing band "Connect your first tool." | `CtaBand` with `site.connectors.ctaTitle/ctaText`. | Direct. |
| Four-step "how to connect" section folded into one sentence. | `STEPS` x4 (`pick, auth, period, test`), `connectKicker/Title/Lead`, `steps.*.{title,text}`. | The prototype dropped these four cards: their facts (OAuth or key, history window, 15-minute sync, test) shrink to one sentence under the list; remove the 4 step keys or keep them for the app's onboarding. |
| Beta note ("Each one is tested against the sample payloads in its vendor's API documentation. Self-hosted instances ... are not supported.") | `site.connectors.betaNote`. | Keep verbatim, it is a limitation statement. |

### 4.5 security.html vs `securite.tsx` (288)
| Prototype | Real | Work |
|---|---|---|
| Top: "Leon sees exactly what **you are allowed to see.**" + one sentence (single blue stroke). | `PageHero` + `RightsVisual` (3 stacked glass planes in 3D, `.pg-iso`; `site.security.ranking/filter/teamPages/ownConversations/colleague/question/query/visualCaption`). | Drop the 3D visual; if the 3 steps (question -> rights filter -> ranking) matter, the fact "permissions before ranking" is already in the lists. |
| Desk band: two sheets "Shared with the team" / "Private to you", 3 rows each with tool logos, foot shows the mark the product puts on a source (note or "Private to you" stamp). | Section "Qui voit quoi" (192-250): two cards, `TEAM_SEES = read, support, link` and `ONLY_YOU = ai, discussions, notes, outlook` (`site.security.teamSees.*`, `onlyYou.*`, `teamTitle/Text`, `youTitle/Text`). | Restyle into sheets; add logos per row (from `ToolLogo`). Row text can reuse the keys. |
| "What is in place today": 5 items with one sentence each (RLS in a single database + tests; AES-256-GCM; permissions before ranking, every full read by an assistant logged; secrets masked incl. the plain-prose limit; extension asks first). | `securityFacts` x8 (`SECURITY_FACTS`, `FACT_ICONS` per fact: Building2, ShieldCheck, NotebookPen, KeyRound, FileKey, Globe, ScrollText, Database), `site.security.facts*`. | 8 -> 5: dropped "Conversations stay private" (moved to the "Private to you" sheet), "Audited MCP access" (merged), "A single datastore" (merged), "personal tokens can be revoked". Icons are removed (no icon rows: prototype uses ticks). Either shrink `SECURITY_FACTS` to 5 in FR and EN, or keep the table and render 5; the home teaser also reads the first 3. |
| "In progress" (ink band, id `in-progress`): SOC 2 and ISO 27001; mirroring each tool's permissions; data export. | `notYet` x4 (`NOT_YET`, `content.ts:651`) in a warning-tinted panel `#pas-encore` with `site.security.frankly/notYetTitle/notYetLead`. | Real list has 4 items, prototype 3: the masking limit moved to "in place", and the sentence "no complete erasure from the interface" was **left out on purpose because `messages/en.json` has a `deleteAccount` flow**. Confirm with the founders that the real FR/EN `NOT_YET` 3rd item ("Pas encore d'export, ni d'effacement complet depuis l'interface") is outdated. **Keep the anchor `#pas-encore`** (footer link `/securite#pas-encore`, hero button) or update both; the prototype uses `#in-progress`. |
| Closing band "Ask us a **security question.**" with a **two-field form** (work email, question) + "Or check for yourself". The form is inert in the prototype: its note says "no security contact exists anywhere in the code; the real page needs an address or an endpoint". | None. | **New feature, no backend.** Options: (1) drop the form and keep "Create a workspace"; (2) add a mail link/contact address chosen by the founders (a `mailto:` is safe and nothing to build); (3) a Hono route + rate limit + spam protection + a mail provider (Resend is already planned for invitations): a real feature, not a restyle. Default: (2) if an address exists, else (1). Never ship an inert form. |

---------------------------------------------------------------------------------------------------------------------

## 5. Content sources and what each new piece needs

| Prototype data | Real source | Gap and work |
|---|---|---|
| `LEON_DEMO` in `prototypes/refonte-2026-11/shared/demo-data.js` (299 lines: 4 scenarios `commitment/bug/departure/unknown`, per-sentence source mapping, richer documents: transcript lines with time and speaker, email, Linear ticket with status/priority/assignee, GitHub PR; connector `catalogue` of 42 with families; `agentContext` for the terminal; fictional company Kestrel Studio, people Julie Martin, Maya Chen, Karim Benali, Sophie Laurent, Dana Whitfield (ACME)). | `DEMOS` (`content.ts:91`, 4 scenarios `promesse/bug/depart/inconnu`) with `DemoSource {tool, kind, title, author, date, excerpt}`, and 6 `TEAMS[].demo` (also `Demo`). ACME, Julie, Thomas fiction. | Types are thinner. Extend `DemoSource` with a typed `body` (transcript | email | ticket | pull request) and `Demo` with per-sentence source numbers and unknown handling, **backwards compatible** so `team.demo`, `DemoAnswerCard`, `AuthAside` keep working; or convert team demos too. Keep ids, `tool` arrays and `[n]` refs aligned across FR/EN (`content.test.ts`). Names: the old copy is ACME/Julie/Thomas: pick one fiction for the site (the prototype's) and apply it to FR and EN together. |
| Prototype 3 rules, `permHTML(view)` Julie / Sophie, empty flag | none | New. 3 answers + view data, EN + FR. |
| Memo (briefing) with chips | `BRIEFING` | Section 3.4. |
| Terminal / dream story | `site.home.terminal*` | Section 3.5. |
| 42 tools with logos `../shared/logos/<tool>.svg` | `public/logos/<id>.svg` via `ToolLogo` (`/logos/<id>.svg`, white chip so dark logos read) | Check the two logo sets match for all 42 ids; the prototype's logo has no chip. |
| Pricing/security/connectors English copy | `PLANS_EN`, `FAQ_EN`, `SECURITY_FACTS_EN`, `NOT_YET_EN`, `site.pricing/security/connectors` | The prototype reused these (pages' notes say so); differences are listed in section 4. |
| Page `<title>` of the home: "Leon - Know exactly what you promised" | `site.meta.homeTitle`: "Leon - Cited answers from your company's tools" | Align (founder). |
| Hero tagline "Know exactly what you promised. Source included." | `TAGLINES_EN.hero`: "Know exactly what you promised. Source included." | Same line, good. FR `TAGLINES.hero`: "Ce qui a été promis à vos clients, retrouvé avec sa source." |

---------------------------------------------------------------------------------------------------------------------

## 6. The French side

- The prototype is English only. Everything new must be written in French by someone who knows the brand voice (rules at the top of
  `content.ts:20-24`: vouvoiement, short sentences, no exclamation mark, no emoji, no invented testimonial or client logo, no
  competing assistant name, no promise the code does not keep). EN here is "rewritten, not translated" and FR is the source language of the types.
- New strings to write (estimate): hero tabs/answers for 3-4 scenarios x (question, 3 sentences, 3 documents); 3 rules (headings with the marked phrase, lead, answers, Julie/Sophie); briefing memo (~10 lines); developers section (heading, lead, 3 facts, line, 3 captions, ~20 terminal lines, buttons "Replay"); connectors page (hero, legend, 42 "reads" lines ~483 words, in-progress items); pricing table cells (~20 cells); security page (sheet rows, 5 items + sentences, 3 in-progress items, ask band); footer/nav labels; form labels if kept. The French text must contain the marked phrase as a separate rich-text chunk (`t.rich` with `<mark>` tags, or a `{accent}` split like `PageHero.accent`) so the highlighter lands on the right words.
- Length risk: French runs ~10 % longer; the prototype's layout is measured in English (H1 two lines at 1440 and 390, `--dev-h` 660/594, headings "two lines at most", rules headings 32/36px by width, terminal longest line 68 characters fits at 1280, answers fit above the fold, pinned rule fragments 428-547px). **Every one of those measurements must be redone in French** and the dev-section "one screen" rule re-tuned; expect three-line headings.
- `nb()` on every string; `lang` attribute on English-only fragments if any stay in English (terminal output stays as printed by the tool).
- Tests: `translation-keys.test.ts` (each key read by code exists in FR and EN, including template keys) and `messages.test.ts` (same ICU params and tags in both files) will fail on any missing FR key.
- Locale switch: the footer form works without JS; the hero demo, tabs, dev story and counts must re-render from `useSiteContent()` on the server when the cookie changes (the action revalidates the layout). Do not read locale on the client from `navigator`.
- `/documentation.md` and `?vue=agent` are untouched but locale-dependent (`?lang=`).

---------------------------------------------------------------------------------------------------------------------

## 7. Fonts, tokens, layout: porting plan

1. Fonts: add `Schibsted_Grotesk` (400, 500, 600, 700) and `STIX_Two_Text` (400, italic) via `next/font/google` in `src/app/layout.tsx` (shared with the app: coordinate with the shell builder; the app prototype also uses Schibsted + STIX for original documents). Keep `Inter` 500 only if the `Brand` word stays Inter (the prototype's `.wordmark` is set in Schibsted 600: **logo word font is a brand decision**; `site-logo.test.ts` only pins the `<Link href="/accueil"><Brand` shape). `Geist_Mono`: the prototype says monospace is for the terminal only, using `ui-monospace`; the old site used it for kickers and meta. Remove kickers (no kicker in the new pages).
2. Tokens: the prototype's `tokens.css` has names (`--ground, --desk, --ink, --line, --m1..m4, --f1..f4, --r, --r-pill, --sheet-shadow, --t-h1...`) that do not exist in `globals.css` (`--bg, --fg, --accent, --panel, --glass-*, --line-strong...`). Either add the Papier tokens as a new block and migrate site components, or map them onto the existing variable names. Variables read at runtime by canvas code (`getPropertyValue('--accent')`, `--logo-2`, `particle-field.tsx:68-69`; `verre/connexions/jeu.tsx:346`) are pinned by `css-variables.test.ts`: when `ParticleField` is deleted its names stop mattering, but the Connexions game still reads some.
3. Layout: the real column is `Container` 1200px, px 20/32. The prototype is `.wrap` (`--maxw 1344`, margin 48/24/16) on a 12-column grid with sections starting on grid lines (4, 7, 10 for pricing). Build one `Wrap`/`Grid12` pair and use them everywhere; Tailwind's `grid-cols-12` is enough.
4. Header: the real one is `position: fixed` (`pt-32/40` on the hero compensates); the prototype's is `position: sticky; top:0` 72px, white, so content starts below it: no top padding hack. Anchors: prototype relies on `scroll-margin-top` plus (home) Lenis. Use `scroll-margin-top: calc(var(--nav-h) + 32px)`.
5. Global classes to rename when porting (collisions with Tailwind or the app CSS): `.grid`, `.wrap`, `.band`, `.sheet`, `.btn`, `.hl`, `.tag`, `.small`, `.lead`, `.fict`, `.more`, `.num`, `.flag`, `.doc`, `.pile`, `.mini`, `.stamp`, `.vis`, `.term`. The app prototype reuses `.sheet`, `.btn`, `.hl`, `.flag`, `.num`, `.doc` from `ui.css` as shared pieces: **the site and the app should consume one component set** (sheet, flag, number chip, highlighter, ink pill, source document) owned by one builder, not two forks.
6. Static-first principle to keep: the prototype pages are readable with no script and under reduced motion (pre-hidden states are CSS under `html.js-motion` with a 3 s failsafe animation). In Next, Server Components render the final state; client islands only add motion. Do not hide content with state that only JS clears (SSR then looks empty).

---------------------------------------------------------------------------------------------------------------------

## 8. Home page motion: each animation, and what it needs

Loaded in the prototype: **GSAP 3.13.0** (core + **ScrollTrigger**, **Flip**, **SplitText**; SplitText is registered but I found no call to it in `hero/rules/dev/ambient.js`: do not port), **Lenis 1.3.4** (smooth scroll, drives ScrollTrigger; skipped on touch), **Rough Notation 0.5.1** (hand-drawn highlight SVG over a text range).

The repo has `motion` 14.5.0 (`motion/react`: `AnimatePresence`, `layout`, `useScroll`, `useTransform`, `animate`; already used in `(app)/template.tsx`, `verre/shell/sidebar.tsx`, `verre/discussions/messages.tsx`, ...), a global `MotionProvider` that maps `useInstant()` (system reduced motion **or** the footer "stop animations" switch) to `reducedMotion`, a CSS reveal (`site-reveal`, `animation-timeline: view()`), a CSS marquee, a CSS `@property --sweep` pattern (the app prototype registers it in `app.css:10`; `P/NOTES` drives the highlighter by animating `--sweep` 0 -> 1).

| # | Animation (prototype) | Where | Port with | Dependency needed? |
|---|---|---|---|---|
| 1 | Navigation settles (10px, fade 0.42 s) | `hero.js` | CSS keyframe (`site-rise` pattern) | No |
| 2 | H1 two lines rise out of a clip (0.6 s, 0.08 stagger, clip by 15 % under the line) | `hero.js` | CSS: wrapper `overflow:clip` + `translateY(100%)` -> 0, `animation-delay` | No (SplitText not used) |
| 3 | Three hand-drawn strokes under "Source included." (pink, green, blue, 0.2 s each) and a hand-drawn stroke under one marked phrase per heading (7 sections: rules 1-3, connectors, briefing, developers, security, close) | `core.js` `M.rough` | Author 4 colours x a few hand-wobbled SVG paths (or a `border-radius` irregular `clip-path` polygon) and wipe them in with `clip-path: inset(0 100% 0 0)` -> `inset(0)` (CSS) or `pathLength` (motion). Static markup already ships a flat stroke (`.swp__seg`, `.hmark` background) as the no-JS fallback. | **Rough Notation not needed.** It gives a randomised pencil look and redraws on resize; pre-drawn SVG gives the same look deterministically, with no layout measuring. Keep it only if the founder wants a different scribble each time (2 small packages: `rough-notation` ~3 KB + `roughjs`). |
| 4 | Lead, pill, tabs, stage rise 24px / fade | `hero.js` | CSS | No |
| 5 | The demo plays once: question written, sentence words, highlighter sweep (`--sweep`), document lands on the pile from the right with a 4 degree turn, flag pops with an overshoot (`back.out`), footnote row writes; total 2.6 s; any key/click jumps to the end | `hero.js` (`M.sweep`, `M.flagPop`, `M.sheetLand`) | The real `HeroDemo` already has a React clock; drive CSS classes/variables from it. Flag overshoot = `cubic-bezier(.34,1.56,.64,1)` (`--ease-flag` exists in the prototype tokens). Sweep = `@property --sweep` transition. Sheet landing = CSS `translate`/`rotate` transition from an offset. Skip-on-click = set clock to end. | No |
| 6 | Changing question: sheets leave (0.2 s), answer rebuilds sentence by sentence every 0.7 s; a second click during the change shows the final state at once | `hero.js` | React state + `AnimatePresence mode="wait"` or a keyed CSS animation | No |
| 7 | Selecting a source: **Flip** (pile sheets travel to new slots; the chosen one pulls right 14 % then passes over) | `hero.js`, `site.js` (`Flip.getState/from`) | `motion` `layout` prop on each sheet (shared layout animation) + a 2-keyframe `animate` for the "pull right then over" with `zIndex`; or plain CSS: slots via `data-slot` with `translate`/`rotate` transitions (the prototype's `.pile > .doc` already transitions on `translate`/`rotate`) | No. This is the one place Flip is convenient; `motion layout` is the equivalent. |
| 8 | Tab indicator slides (clip-path) | CSS in prototype already | CSS | No |
| 9 | Linking highlight (`.is-lit`: flags to 1.1, stroke deepens, sheet lifts 6px) | CSS already | CSS | No |
| 10 | **Pinned, scrubbed rules**: section pinned for `min(2000px, 2.2 x window height)` of scroll, one 30-unit timeline scrubbed (rule 1 sweeps, flags pop, documents land; transition to rule 2; empty flag draws itself; transition to rule 3; switch to Sophie triggers at unit 25 and rebuilds the DOM); list of three names with a moving marker as navigation; `.is-pinned` only >= 1024px and when a rule fits under the bar; otherwise stacked blocks with an entrance only; everything reverted and rebuilt on resize and on late fonts; hidden rules `inert`. | `rules.js` (336 lines), ScrollTrigger + Lenis | `position: sticky; top: var(--nav-h)` inside a wrapper of height `100svh + pin distance` (pure CSS pin, no JS pin), progress from `motion`'s `useScroll({target})` -> `useMotionValueEvent` toggling step classes, or CSS `animation-timeline: view()/scroll()` with `animation-range` per sub-animation (the site already uses `view()` under `@supports`; keep a JS fallback or accept the stacked fallback for non-supporting browsers). The unit-25 DOM rebuild becomes React state flipped by a threshold. | **No.** This is the hardest port (largest, most fragile, tuned in English). It is also where ScrollTrigger would save most time; the honest trade is one dependency vs. ~150-250 lines of sticky + `useScroll`. Flag it to the founder as an option: "GSAP (free, ~30 KB core + ScrollTrigger) vs. rebuild with the installed `motion`". My default: rebuild with `motion`. Whichever is chosen, the stacked fallback (phone, reduced motion, `data-motion=off`, no JS) is the SSR output. |
| 11 | Heading marks, entrance of every `[data-rv]` (20px, 70ms apart, once) | `ambient.js`, `rules.js`, `dev.js`, `pages.js` (vanilla IO for the inner pages) | `.site-reveal` (CSS `animation-timeline: view()`; works on anchor jumps without extra code) or a 20-line IntersectionObserver hook adding `.is-in` | No |
| 12 | Count-up 0 -> 42 in 800ms (the number keeps the width of "42"; H2 has an `aria-label` meanwhile so nobody hears "0 connectors") | `ambient.js` | `motion` `animate(0, TOOL_COUNT, { onUpdate })` or CSS `@property --n` + `counter()`; keep the `aria-label` with the final number | No |
| 13 | Two-row logo carousel, 40 s / 46 s, linear, endless; each row holds its 21 tools twice; slows to a stop on pointer or focus; stands still off screen; list is focusable (`tabindex=0`, `role=group`) so a keyboard can stop it | `ambient.js` | The real `LogoMarquee`/`.site-marquee` (`site.css:117-140`, two copies, hover pause, `data-reverse`) is already this; add `animation-play-state` on `:focus-within`, an `IntersectionObserver` pause, `tabindex`. The "slow to a stop" easing is JS-only; an abrupt CSS pause is acceptable. | No |
| 14 | Briefing memo: sheet rises, ten lines write in from the left (clip-path, 90ms apart) with their rule drawing, number chips pop; ~1.5 s | `ambient.js` | CSS stagger via `--i` triggered by an in-view class; chip pop = `--ease-flag` | No |
| 15 | Developers story: strip with marker travel, terminal prints 13 lines (40 ms apart), 3 sheets leave the terminal, land loose under "Evening", then file into the pile under "Night" (flags pop pink/green/blue), terminal title changes claude -> codex; 5.92 s; per-step replay (1.9 / 1.9 / 1.7 s); "Replay"; skip on click/key; pause off screen | `dev.js` (13.5 KB) + `core.js` | React state machine like `HeroDemo`; printing = CSS with `--i` delays; sheet travel between "loose" and "pile" = `motion` `layoutId` (or CSS transitions on slot classes); marker = CSS `left` transition (already so in the markup) | No (Flip -> `motion layout`) |
| 16 | Security: ticks then half rings draw (`stroke-dashoffset`, 70ms apart) | `ambient.js` | CSS: `pathLength="1"`, `stroke-dasharray: 1`, `stroke-dashoffset` 1 -> 0 | No |
| 17 | Close: statement rises, amber stroke, panel rises, sign-up sheet lands (48px right, 24px up, 3 degrees) | `ambient.js` | CSS | No |
| 18 | Footer blocks rise | `ambient.js` | CSS (`site-reveal`) | No |
| 19 | **Lenis**: inertial scrolling in step with ScrollTrigger; every in-page link is one 1.1 s travel whatever the distance; before it moves, the entrances of every section it will pass are put in their final state; the destination's entrance waits and plays on arrival; `leon:travel` event; "Developers" and "Product" have own landing positions | `core.js` (17 KB) | Native `scroll-behavior: smooth` + `scroll-margin-top`. If reveals are driven by CSS `view()` timelines or an `is-in` class, a jump needs no special handling. Skipped on touch in the prototype already. | **No. Recommend dropping Lenis**: it replaces native scrolling (accessibility, find-in-page, anchors, `inert` interplay) and its complexity exists mainly to serve the pin. If the founder wants the smoothing, Lenis alone is ~3 KB and optional. |
| 20 | Reduced motion handling | CSS `html.js-motion` pre-hide + failsafe; `M.ok` false under `prefers-reduced-motion` | Real site must also honour `data-motion="off"` (footer switch) and `useInstant()`: neither exists in the prototype. All JS motion gates on `useInstant()`; CSS gets the blanket `[data-motion="off"]` rule already in `globals.css:290-300`. | No |

Net: **no dependency is required.** Optional, decision for the founder: GSAP (+ScrollTrigger) only if the pinned rules are to be ported 1:1; Rough Notation only for randomised scribbles; Lenis only for inertial scroll. The prototype's own `pages.js` (inner pages) already proves the point: entrances without GSAP.
Plugin note: GSAP is free to use since 2025 (all plugins, incl. SplitText and the former club plugins); I did not check the licence text in the repo's context, verify before choosing it.

---------------------------------------------------------------------------------------------------------------------

## 9. Must keep: features, states and constraints that survive the port

Behaviour and wiring
- Locale by cookie `leon-locale` (default English), server action `setLocaleAction` from the footer form, works without JS and without a session; `<html lang>`.
- `/` for visitors = `/accueil` by `src/proxy.ts` rewrite; the logo of the public site goes to `/accueil` even when logged in; no `href="/"` inside `src/components/site/**` (contract `site-logo.test.ts`: regex `<Link[^>]*href="\/accueil"[^>]*>\s*<Brand` in header and footer files).
- Header: current-page state (`aria-current` page vs true on sections such as `/cas-usage/ventes`), `/inscription` swaps "Sign in" and "Create" (never links to the current page), mobile menu in a dialog with focus on first link, close button, hidden title, locale-correct labels.
- `GoogleOneTap` mounted only when a Google provider is configured, only without a session (it checks `/api/auth/get-session`), calls `oneTapAction`.
- Skip link to `#contenu`; `<main id="contenu" tabIndex=-1>`; `overflow-x-clip` so decor never scrolls the page sideways.
- `MotionSwitch` in the footer bar (and in the auth footer bar), `aria-pressed`.
- `SiteShell` props `footer: true | 'bar' | false` (auth layout uses `'bar'`).
- Metadata: per-page `title`/`description` from `site.meta.*`, home `title.absolute` + canonical `/`, `metadataBase` from `BETTER_AUTH_URL`, documentation `alternates.types['text/markdown']`, `generateStaticParams` for the six teams, `dynamicParams=false` -> 404.
- `TOOL_COUNT` and `{count}` params everywhere (never a literal 42); `toolLabel`, `ALL_TOOLS`, `TOOL_GROUPS`, `FAMILY_OF`.
- Documentation page: all of it (install command from `installCommand()`, null-address fallback without copy button, agent view via `?vue=agent`, `/documentation.md` route, copy buttons, the 598-line test).
- Catalogue: filter by name with `fold()` (accent- and case-insensitive), by family, by what-Leon-reads (new), clear button/Escape, `role="status"` count, all four empty/hidden states, OAuth vs API key indicator per tool (`OAUTH` set must stay equal to the connectors that have an OAuth app in `src/server/connectors/*/catalog.ts`).
- Pricing: plans, FAQ x6, tax note, link to sign-up; FAQ wording about MCP (address pasted, authorise, revoke; no token) is pinned by `content.test.ts`.
- Security statements that are claims about code: row-level security with tests, AES-256-GCM bound to row, permissions before ranking, secret masking and its limit, extension consent/switch/pause/no attachments/no private windows, logged full reads by assistants, "what is not yet" list.
- Cas d'usage: 6 team pages with questions (real search filters), gains, tools, demos, 9 situations; Product page: 4 pillars with anchors `#capte #garde #retrouve #discute`; `SYNTAX` examples of the real search bar.
- A11y: every demo has a `sr-only` final version, animated copy `aria-hidden`; tab roles; `aria-live` on the Julie/Sophie body; `inert` on hidden rules; 44px targets on touch (`pointer-coarse:min-h-10` etc.); focus ring 2px ink (white on ink bands); WCAG 2.2.2 pause/stop for anything that moves > 5 s.
- Typography: `nb()` on every string, thin non-breaking spaces in French.

Tests that pin this area (keep green)
- `src/test/contracts/site-logo.test.ts`, `page-links.test.ts` (every `href="/..."` literal in `src/app/**`, `src/components/**` resolves to a real route, with `[id]` for dynamic parts, query/hash stripped: new links like `/accueil#developers`, `/connecteurs`, `/documentation` pass; prototype relative links `app/signup.html`, `index.html#...` do not),
  `translation-keys.test.ts`, `src/i18n/messages.test.ts`, `src/i18n/request.test.ts`, `src/components/site/content.test.ts`, `pages/documentation*.test.ts`, `css-variables.test.ts`, `ui-imports.test.ts` (import-boundary rules for UI files), `next-route-handlers.test.ts`.

---------------------------------------------------------------------------------------------------------------------

## 10. Decisions the founder or lead must take (blocking items first)

A. **Dark theme.** Prototype is light only. Real site/app support dark (default dark) and a toggle (`ThemeButton`, `theme-toggle.tsx`, `data-theme` script, `[data-theme="dark"]` tokens 19-70 in `globals.css`). Either the new look ships light only (remove the toggle, force `light` in the boot script, keep the dark token block parked), or someone designs a dark Papier. Affects site, auth and app together.
B. **Nav entries.** Prototype: Product, Connectors, Developers, Security, Pricing, Sign in. Real: Product, Use cases (menu of 6 teams), Connectors, Security, Pricing, Documentation. Proposal: keep the real six; Developers is a home section reachable from the footer and from documentation; Use cases becomes a plain panel.
C. **Connector categories.** Prototype regroups the 42 tools (Notion -> Projects, Drive -> Email/chat/files, renames and reorders); the app's Connexions screen and onboarding read the real families. Pick one grouping for site and app.
D. **Security question form and sign-up form (close band).** Not backed by anything: choose between removing them, a `mailto:`/contact address, or building a real endpoint. No inert forms.
E. **Home rehoming.** Problem, Steps, Layers, UseCases tabs, Proof, FAQ, Assistant teaser are not on the approved home. Confirm they are dropped from the home and that their content lives on `/produit`, `/cas-usage`, `/securite`, `/tarifs`.
F. **Hero 4th scenario (unknown).** 3 tabs in the prototype; the 4th lives in rule 2. Keep the `inconnu` demo id.
G. **Motion libraries**: none required; GSAP/ScrollTrigger, Rough Notation, Lenis are optional (section 8).
H. **Logo word font** (Schibsted 600 in the prototype vs Inter 500 in `Brand`), **public radius** (6px vs the app's 12px cards), **mono usage** (terminal only vs kickers).

---------------------------------------------------------------------------------------------------------------------

## 11. Gaps

Prototype shows, real has no counterpart (new work)
- G3. Source documents with real structure (transcript, email, ticket, PR) and per-sentence source mapping; the 3-rule fragments; Julie/Sophie permission views; briefing with source chips; developers story and terminal; "what Leon reads" per connector (42 lines); pricing table rows (made for, billing, hosting); security "two sheets" with logos; security question form; close sign-up form; the flag layout algorithm (`layoutFlags`); highlighter system (`.hl`, `.swp`, `.hmark`, 4 colours + deeper tones); the stamp "Private to you"; the bottom sheet (`<dialog class="bsheet">`) for a source on a phone.

Real has, prototype home/pages do not show (must survive or be rehomed)
- G1. Theme toggle and dark theme; Use cases menu and Documentation in the nav; Use cases column and `MotionSwitch` and language **form** in the footer; Google One Tap; skip link target naming; auth pages' use of `SiteShell`.
- G2. Home: Problem (3 cards), Steps (3), Layers (3D), team tabs, Proof, FAQ (first 4), assistant terminal, family pill counts, logo sphere, particle field; pricing: `featured` plan and per-plan CTA and `recommended` badge, 8-item "everywhere" list, accordion FAQ; connectors: 4 steps, channels cards, family filter pills, by-family empty state, `OAUTH` iconography; security: 8 facts with icons, the 3D rights visual, the 4th "not yet" item; the whole of `/produit`, `/cas-usage`, `/cas-usage/<team>`, `/documentation`.
- G4. Prototype pages have no `<title>`/meta plumbing, no locale, no `generateMetadata`, no 404 for unknown teams, no `Container`/PageHero crumbs, no focus management for the menu (it uses `aria-expanded` and Escape only), no `data-motion="off"` handling, no pause control for anything that loops.
- G5. Prototype links that go nowhere: "See all 42 connectors", "Read the documentation" (x3), "Pricing", "What's missing", "Français", "Sign in"/"Create" on pricing/security (`href="#"` with `title="Not in this prototype"`, plus a notice script) -> map to `/connecteurs`, `/documentation`, `/tarifs`, `/securite#pas-encore`, locale form, `/connexion`, `/inscription`. Delete the notice code; the app prototype's rule 8 says nothing may be dead.

---------------------------------------------------------------------------------------------------------------------

## 12. Risks

1. **English-tuned layout**: pin lengths, `--dev-h`, heading line counts, terminal widths are measured on English. French will break them; budget a re-measure and accept 3-line headings.
2. **Pinned rules port is the schedule risk** (336-line scrubbed timeline, rebuilt on resize and late fonts, `inert`, DOM rebuild at unit 25, link to rules by names, stacked fallback). Timebox it, ship the stacked version first (it is the SSR/mobile output and complete), then add the pin.
3. **Class-name collisions** (`.grid`, `.wrap`, `.sheet`, `.btn`, `.hl`) with Tailwind and the app prototype's shared kit; two forks of the same pieces (site, app) will drift. One owner for the shared kit.
4. **Shared shell**: auth pages render `SiteShell` + `AuthAside`; a header rewrite changes sign-in/sign-up. The app's `AppShell` is separate, but root fonts and tokens are shared: a font change in `src/app/layout.tsx` hits everything.
5. **Content truth**: 42 "what Leon reads" lines, terminal wording, security statements and the "in progress" list are public claims. Each must be verified against code (connectors `catalog.ts`, capture code, `deleteAccount` flow) and the brand rules (no promise the code does not keep). The Microsoft connectors are in flux.
6. **Data model change fans out**: `DemoSource`/`Demo`/`BRIEFING` are consumed by 6 team pages, `TeamTabs`, `AuthAside`, tests; keep FR/EN `Twin` types in sync.
7. **Hydration and SSR**: random or date-based fictional data, `window` reads, timers must live in client islands; server markup must equal the final static state.
8. **Accessibility regressions**: loss of `MotionSwitch` or of `useInstant` gating would break WCAG 2.2.2 (a looping marquee remains); Lenis breaking find-in-page/anchors; `inert` handling; touch targets (prototype 40px nav pill, 44px elsewhere).
9. **Inconsistent copy already in repo**: `pricingDescription` mentions "30-day pilot"; `NOT_YET` mentions no complete erasure although a delete-account flow exists; home `<title>` differs from the prototype's. Settle before translating.
10. **Contract tests** break on prototype-style links (`index.html#...`) and on missing FR keys: run `vitest` for `src/test/contracts`, `src/i18n`, `src/components/site` after each batch.
11. **Fonts and layout shift**: two new Google fonts through `next/font` (self-hosted, no layout shift if `display: swap` + size-adjust); the prototype waits for fonts (up to 1.5 s) before motion starts; do the same by gating the intro on `document.fonts.ready`.
12. **Unverified**: I did not run the prototype, did not open the app, did not run tests, and did not read `P/js/motion/*.js` line by line (relied on their NOTES and on a grep of API calls); `P/css/*.css` read for tokens and selectors only; `S/pages/produit.tsx` and `cas-usage.tsx` and `documentation.tsx` read for structure (function map and keys), not every line; `fx/*.tsx` not read in full (they are to be deleted); browser support of CSS scroll-driven animations (Safari) not verified.

---------------------------------------------------------------------------------------------------------------------

## 13. Suggested order of work (for the lead who splits builders)

1. Shared kit + tokens + fonts (one owner, used by site and app): sheet, flag, number chip, highlighter, ink pill, source document, `Wrap`/`Grid12`, reveal utility.
2. Shell: `SiteHeader`, `SiteFooter`/`SiteFooterBar` (keep exports and the auth `'bar'` mode), skip link, MotionSwitch, language form, Google One Tap untouched.
3. `PageHero`/`PageSection`/`CtaBand` restyle -> gives `/produit`, `/cas-usage`, `/cas-usage/<team>`, `/documentation` the new look for free.
4. Pricing, Security, Connectors pages (static, mostly server components; connectors catalogue island).
5. Home static (all sections in final state, no motion), then islands: hero demo, rules (stacked first), dev story, count-up/marquee.
6. French copy for everything new, then re-measure at 1512x771, 1680x850, 1280x800, 390x844 in both languages.
7. Delete: `fx/*`, `fx.css`, `signal.css`, `pages.css`, unused `site.home.*` / `site.layers.*` / `site.connectors.steps.*` keys, `Aurora` in the shell (after the app builder confirms it does not need `ThinkingProvider`).
