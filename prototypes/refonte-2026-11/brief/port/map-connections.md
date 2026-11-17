# Port map: Connections (/connexions)

Reader: the builder of this area. Read this file, then open the files it names. Paths are relative to the worktree
`/Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484` (R = that root;
P = `prototypes/refonte-2026-11/papier/app`). Line numbers are from the files as they are today.

Nothing was edited to write this map.

---------------------------------------------------------------------------------------------------------------

## 0. The short version

- The real screen is a diagram (Leon in the middle, one chip per connected tool and per capture channel, plus an
  arcade mini-game on top of it), then three lists (recommended, connected as rows, to-connect as tiles), then a
  centred Radix dialog for one tool.
- The approved prototype is: title, a "Connected" section of 88px cards, an "Add a tool" section (family chips,
  search, 52px tiles), and ONE side panel (520px) for one tool, with four views: connect, connected (just done),
  manage, repair.
- Port = keep the data flow of `page.tsx` and every server action, route and rule exactly as they are; replace the
  presentation: drop the diagram and the game, make connected tools cards, free tools tiles, and move the dialog
  content into the side panel.
- Biggest decisions for the founder (details in section 9): (a) the diagram, the capture-channel chips and the game
  disappear from this screen; capture health must live somewhere; (b) the real families differ from the
  prototype's demo families; (c) the prototype shows "Leon reads" and "How often" which the real catalogue does not
  have; (d) the shell's alert line in the prototype is "Intercom needs reconnecting", the real shell alert is "Memory out
  of date" (stale capture channels).
- Also used by onboarding: `AddConnection`, `ToolDialog`, `ReturnNotice` are imported by
  `src/components/verre/onboarding/tools-step.tsx` (lines 12-13, 305, 458, 523, 667-678) and mocked by
  `tools-step.test.ts:13`. Keep those three exports and their props working (see section 8).

---------------------------------------------------------------------------------------------------------------

## 1. Files of the area (real)

| File | Lines | Role |
|---|---|---|
| `src/app/(app)/connexions/page.tsx` | 61 | Server page. `requireUserContext`, reads `?branche/?erreur/?outil/?state`, loads connections, capture channels, onboarding member, groups, catalogue. Renders `<Connexions>`. |
| `src/app/(app)/connexions/actions.ts` | 221 | Server actions: `connectAction`, `replaceKeyAction`, `syncNowAction`, `setPausedAction`, `shareConnectionAction`, `deleteConnectionAction`. All call `requireUserContext`, validate with zod, never throw to the UI, never echo a key. |
| `src/app/(app)/connexions/actions.test.ts` | ~560 | Tests of the actions (unchanged by the port). |
| `src/components/verre/connexions/index.tsx` | 161 | Client screen `Connexions`: state (`openId`, `shownId`, `session`, `fresh`, `filter`), focus return, composes header, notice, setup warning, diagram, catalogue, dialog. |
| `.../carte.tsx` | 660 | The living diagram `CarteConnexions` (nodes, strokes, drag of the centre, legend, "Play" button). Capture channels as chips linking to Settings. |
| `.../jeu.tsx` + `partie.ts` + `partie.test.ts` | 591 + 249 + 92 | The arcade game "Quick Recall" played on the diagram. Record in `localStorage['leon:memoire-vive:record']`. |
| `.../catalogue.tsx` | 322 | Filter field, family pills, the three zones: Recommended (tiles), Connected (rows in one glass card), To connect (tiles grouped by family), empty state for no match. |
| `.../tool-dialog.tsx` | 709 | Radix dialog for one tool: `Panel`, `ConnectionCard` (one per connection), `AddConnection` (exported), `OAuthForm`, `KeyForm`, `PeriodField`, `FieldInput`, `AdminConsent`, `useManage`. |
| `.../parts.tsx` | 111 | `connState(c)` (word + tone + icon), `StateWord`, `StatusText`, `ConnStatus`, `stateDetail`, `keepTogether`. |
| `.../model.ts` + `model.test.ts` | 43 + 106 | Pure: `connectedTools` (problems first, then paused, then catalogue order), `recommendedToConnect`, `secretText` ("Key ••••abcd · connected by X on date"). |
| `.../return-notice.tsx` | 57 | `ReturnNotice`: the editor's return message + admin-consent link. Also used by onboarding. |
| `.../connexions.css` | 68 | `.cx-fresh-row` ring, diagram halo/live/trait animations. All of it goes. |
| `src/lib/connection-form.ts` | 274 | Pure helpers shared by page, actions, routes, UI (see section 3). KEEP UNCHANGED. |
| `src/lib/providers.ts` | 143 | 42 labels, 6 families (`dev, reunions, projet, crm, support, mails`), `FAMILY_LABELS(_EN)`, `PROVIDER_FAMILIES`. |
| `src/server/connectors/catalog.ts` | 178 | `listCatalog(locale)` -> `CatalogItem[]` (type at 59-71), `catalogItem()`. |
| `src/server/connectors/types.ts` | 119-152 | `CatalogField`, `CatalogEntry`, `CatalogEnglish`. |
| `src/server/connectors/registry.ts` | 94 | `CONNECTORS` (42, any may be `null` = "Coming soon"), `getConnector`. |
| `src/server/connectors/connections.ts` | 28-46, 102-117, 159-341 | `ConnectionView` type, `listConnections`, `requestSyncNow`, `setConnectionPaused`, `shareConnection`, `deleteConnection`, `replaceConnectionSecret`, who-may rules `manageable`/`createdByMe`/`creatorIsMember`. |
| `src/server/connectors/oauth-routes.ts` | 160-215, 455-575 | Hono routes `POST /api/v1/connexions/oauth/:provider/debut`, `GET /:app/retour`, `GET /pipedream/retour`; mounted at `src/server/api/app.ts:42`. |
| `src/components/verre/documents/partage.tsx` | 1-80 | `GroupOption`, `usePartageOptions`, `usePartageLabel`, `ShareSelect` (reused here for "who sees what a connection reads"). |
| `src/components/verre/reglages/depots-equipe.tsx` | 140 | GitHub team repositories (Settings page, owner/admin only). NOT on this screen. |
| `messages/en.json` + `messages/fr.json`, namespace `connections` | 92 keys each, identical key sets | Listed in section 7. Also `documents.share*` and `settings.depots*`. |
| Prototype: `P/connections.html` | 343 | Static page; blocks `conns`, `tiles`, `chips`, `conn-count`, `add-count` are generated. |
| Prototype: `P/connections.js` | 159 | The screen's logic (cards, tiles, filter, panel views). |
| Prototype: `P/app.js` | 94-125 (facts, field, pill, who), 363-440 (panel) | Shell helpers the screen uses. |
| Prototype: `P/connections.css` | 5 | Only the `.known` rule ("already connected" line). |
| Prototype data: `prototypes/refonte-2026-11/shared/demo-data.js:255-264, 290-298`; `papier/js/app-data.js:100-158` | | `connections`, `catalogue`, `reads`, `connect` (how: oauth/key, private, fields, where). |

Logos: real `public/logos/<providerId>.svg` (same 42 file names as the prototype's `shared/logos`). Today read through
`ToolIcon` (`src/components/verre/ui/chips.tsx:87-111`, 22px white tile, `/logos/<kind>.svg`). In cards and tiles use
the plain `<img class="logo" src="/logos/<id>.svg">` the kit uses (36px card, 28px tile).

---------------------------------------------------------------------------------------------------------------

## 2. Data and rules (do not change; the new UI is built on them)

### 2.1 Page data (page.tsx)

`page.tsx:24-60`. Order of work: `requireUserContext()`; `setupReturn(params)` (GitHub's setup-URL return: redirect to
the page in `?state=` plus `?branche=`, only when `state` is `/bienvenue/outils`); then in parallel
`listConnections(ctx)`, `channelHealth(ctx)`, `readOnboardingMember(ctx)`, `listGroups(ctx)`; `listCatalog(locale)`;
`oauthNotice(params, locale)`; `consentUrl` = catalogue item of `notice.tool`'s `adminConsentUrl`, never from the
address; `recommended` = `DEPARTMENTS[member.department].tools` when the member has a known department, else `[]`;
`canConnect = connectorsKey() !== null`; `stale = staleChannels(channels, now)`.
Props to `Connexions` (index.tsx:28-44): `catalog, recommended, connections, viewerId, canConnect, notice, consentUrl,
channels, stale, now, groups`.
`generateMetadata` title = `connections.title`.

### 2.2 `ConnectionView` (connections.ts:28-46)

`id, provider, label (account label, e.g. "julie@x" or "Acme"), config (non-secret; for a non-creator `depots_confirmes`
is stripped), secretHint (last 4 chars), status 'active'|'paused'|'error', since, nextSyncAt, lastSyncAt, lastError (<=300
chars, written by Leon), itemsSynced, createdBy {id,name}, createdAt, canManage, isCreator, creatorLeft, partage
('equipe' | 'moi' | group id | null)`.
Everyone in the workspace sees every connection of the workspace (several per tool, several people).

### 2.3 `CatalogItem` (catalog.ts:59-71)

`id, label, family, available (connector exists), privateRaw (what it reads is private to the connector's owner:
Gmail, Outlook, Drive, Slack), oauthReady (button available: own OAuth app configured OR Pipedream configured),
keyAccepted, oauthPreFields (non-secret fields to fill BEFORE the click), adminConsentUrl (Outlook only, when the app
is configured), fields[] (name, label, kind secret|text|list|select, placeholder, help, options), keyHelp, docsUrl,
triedForReal, oauthHelp, warning`. Texts are already localised by `listCatalog(locale)`.

Auth families (for knowing who uses what): Pipedream = gmail, drive, slack (`connector.pipedream`); own OAuth = airtable,
asana, attio, basecamp, clickup, confluence, github, gitlab, helpscout, hubspot, jira, linear, miro, outlook, notion,
monday, productboard; every other tool = key only. `panelMode(item)` (connection-form.ts:121) decides:
`oauth+key | oauth | key | none`.

### 2.4 Who may do what

| Action | Allowed to | Enforced in | Today's UI |
|---|---|---|---|
| See the screen, see all connections | any workspace member | RLS + `listConnections` | |
| Connect a tool (key or button) | any member (needs `connectorsKey()`) | `connectAction`, `startHandler` | form |
| Sync now | any member, if status is active or error and the creator is still a member | `requestSyncNow` (connections.ts:297) | button disabled by `canSyncNow` (not paused, not creatorLeft) |
| Pause / Resume | creator OR owner/admin (`canManage`) | `setConnectionPaused` (`manageable`) | shown only if `canManage` |
| Delete | creator OR owner/admin (`canManage`) | `deleteConnection` | shown only if `canManage` |
| Reconnect (OAuth/Pipedream), Replace key | creator only (`isCreator`); the secret is the creator's own account | `replaceConnectionSecret` (`createdByMe`), `replaceKeyAction` ("notCreator"), `ownConnection` in oauth-routes | shown only if `canManage && isCreator` |
| Change who sees what the connection reads | creator only, never GitHub | `shareConnection` (refuses GitHub: team repos decide) | `ShareSelect` if `isCreator && !github`, else read-only text |
| Choose GitHub team repositories | owner/admin | Settings, `setDepotEquipeAction` | Settings > Team tab, not here |
| Admin-consent link (Outlook) | anyone who clicks (an admin has to act at Microsoft) | catalogue | link |

---------------------------------------------------------------------------------------------------------------

## 3. Every state (real) and how it appears in the new composition

Card/tile vocabulary of the prototype (NOTES.md "Card and tile"): `Leon.card({logo,name,sub,err,pill,ink,hl,label,attrs})`
88px; `Leon.tile(...)` 52px; the whole rectangle is the control; no count, date or size on it; `err` = caption in red
and a red dot on the logo; `pill` = a 28px pill at the right (outline, or ink with `ink:true`) instead of the chevron.

### 3.1 A connected tool (one card per TOOL, not per connection)

One card per provider that has at least one connection, in the order of `connectedTools()` (model.ts:14-22): any
problem first (error or stopped), then paused, then catalogue order. The card is the worst state of its connections
(`rank` model.ts:10). Name = `CatalogItem.label`. No count of connections on the card (today `catalogue.tsx`/`carte.tsx:350`
show a count: drop). The whole card opens the tool's panel; `aria-label` = "Manage {Tool}" or "Reconnect {Tool}".

| Real state (source) | Today | New card |
|---|---|---|
| Active, first sync pending (`status active`, `lastSyncAt` null) | "Active . first sync pending" | normal card, caption = scope (below). Panel shows the working pill "First sync in progress". |
| Active, synced | "Active . last sync 4 min ago . 1,842 items" | normal card, caption = scope. No date, no count on the card. |
| Paused (`status paused`) | "Paused" | normal card, caption "Paused" in the quiet ink (replaces the scope caption; not red). |
| Error (`status error`, `lastError`) | "Error: <reason>" in red, diagram stroke red with x | `err: true` card: red dot, red caption "Error" (`statusError`); if the viewer can fix it (`isCreator`), `pill: 'Reconnect'`, `ink: true` (this is the view's ONE ink pill; if two tools are broken only the first gets it, the others get an outline pill). Reason (`lastError`) lives in the panel. |
| Stopped (`creatorLeft`) | "Stopped: Ana is no longer a member" | `err: true` card, red caption "Stopped" (`statusStopped`), no pill (nobody can reconnect it; an admin can delete it in the panel). |
| Several connections of one tool in different states | one row per connection | card shows the worst state; the panel lists each connection (3.5). |

Scope caption (what Leon reads is visible to): resolve per connection `partage ?? (entry.privateRaw ? 'moi' : 'equipe')`,
GitHub always `'equipe'` (tool-dialog.tsx:403-405). `'equipe'` -> "Team"; `'moi'` -> "Only you" when `isCreator`, else
"Only {createdBy.name}" (new key); a group id -> its label from `usePartageLabel(groups)` (e.g. "Sales", falls back to
"A group"). With several connections use the viewer's own connection first, else the first.
Highlighter colour `hl` by family like `connections.js:7` (`HL`, 1..4 by family index).

### 3.2 A tool to add (tile)

`Leon.tile({logo: id, name: label, pill: 'Connect', hl, label: 'Connect {Tool}', attrs: data-open})`; `li` carries the
family and a lowercase search string (`connections.js:17-18`).

| State | Source | New tile |
|---|---|---|
| Can be connected | `available` | tile with outline pill "Connect" (`connect`) -> opens the tool's panel in connect view |
| Coming soon | `!available` (connector `null`; none today, all 42 exist, but the code path must survive) | tile that is not a control: no pill, quiet caption "Coming soon" (`soon`). Do not draw a disabled button (NOTES "Never"). Needs one rule in the screen's own sheet. |
| Already connected by a colleague (team tool) | `toolStates` rule | not a tile: it is a card in Connected (everyone sees all connections). |
| Recommended and still to connect | `recommendedToConnect()` (model.ts:26-37), only when `member.department` is known | see 3.3 |

### 3.3 Recommended for your role (not in the prototype)

Real today: a section "Recommended for your role" (`recommended`) of tiles ABOVE Connected, only when the person's
department has recommended tools they still have to connect, and those tools are removed from "To connect"
(catalogue.tsx:145-148). It is filtered by the same search and family.
Proposed: keep the rule and the data (`recommended` prop, `recommendedToConnect`), draw it as a section of 52px tiles
placed BETWEEN "Connected" and "Add a tool" (the founder wants the connected ones first and bigger), with the flag
count `<span class="tag c1">` like the other section heads. Hidden when empty. In an empty workspace (no connection yet)
put it first, since "Pick your first one below" is then the main action. Heading text: `recommended` ("Recommended for
your role").

### 3.4 Page states

| State | Source | New composition |
|---|---|---|
| Normal | | title "Connections" (`title`) + optional ink pill: none (the view has no single primary action; the ONE ink pill is a "Reconnect" on a broken card, else none) |
| No tool connected | `connections.length === 0` | Connected section empty block: `<div class="empty"><h3>No tool connected yet</h3><p>Pick your first one below.</p></div>` (prototype `connections.html:~145`, `connections.js:66`; new keys `noneConnected`, `pickFirst`). Today the section is just absent. |
| Server not set up | `!canConnect` (`LEON_CONNECTORS_KEY` missing) | Today: warning Notice with the sentence `serverSetup` + code `openssl rand -base64 32` + `serverSetupEnd` (index.tsx:119-127). Keep the message (it tells the operator what to do). Draw it as one `.paper` under the title (a sheet on the desk) with the code in `<code>`. In panels, connect/replace/reconnect controls are not drawn; the panel shows `connectorsUnavailable`. Cards and tiles still open panels. |
| Setup note + admin consent in return | `notice.adminConsent && consentUrl` | see 3.7 |
| Filter finds nothing | `count === 0` (catalogue.tsx:292-319) | `.empty` block: `<h3>No tool matches "{query}" in {Family}</h3>` + `.btn.btn--line.btn--sm` "Clear filters" (`clearFilters`) (the view has no ink pill for it, so a line button). Reuse `noMatch`, `noMatchQuery`, `inFamily`, `noFamily`; DROP the `catalogueCount` scope ("in the 42-tool catalogue") because the founder removed counts. |
| Filter finds only a connected tool | prototype only | line "{Tool} is already connected." with a quiet "Manage" (`.known p`, `connections.js:51-52`, `connections.css`). New keys `alreadyConnected`. Real catalogue.tsx does not do this: it filters the connected zone too. Port the prototype: the filter narrows only the TILES (and recommended); connected cards stay. |
| Live count for screen readers | `count` sr-only (`aria-live`) | keep a `.vh` live region (`connections.js:55`) with "{n} tools shown" (the key `count` exists). It is not drawn. |

### 3.5 One tool's panel (the side sheet): views and every state

Replaces `ToolDialog` (Radix `Dialog`, `size="lg"`, tool-dialog.tsx:636-709) and its `Panel`/`ConnectionCard`.
Use the kit's side panel (520px, native `<dialog>`; the foundation builder provides it as a React component: head
logo 44 + title, body, foot; busy highlighter in the foot; in-place confirm; Escape on the confirm only answers "no";
click on another card/tile opens that one at once). `title` = tool label; head `sub` empty. The panel opens for:
- click on a card: manage view, or repair view when the card is broken;
- click on a tile: connect view;
- `?open=<tool>` (the command bar, sidebar alert): `Leon.openHere` -> same as clicking it. New: read `?open=` in
  `Connexions` and open on mount; the real command bar/sidebar builders push `/connexions?open=<id>`.

Prototype views (connections.js:83-107) -> real contents:

**A. connect view** (`P.view === 'connect'`; tool has no connection of the viewer's, or "Connect another account")
- Body, in this order:
  1. warning of the editor, `entry.warning` (icon + text, `TriangleAlert`), when present (Outlook "private like a conversation", Intercom, ...). This is important disclosure: keep.
  2. facts: "Who will see it" = `privateTool`/`sharedTool` sentence (tool-dialog.tsx:689-693 today puts it in the dialog description; prototype `whoDefault`). "Leon will read": prototype `t.reads` (NOT in the real catalogue, see gaps). "How often: Every 15 minutes": NOT in the real UI; do not copy without checking the real cadence (see gaps).
  3. "Read items from" select (`periodLabel`, `since.7/30/90/365`, default 30, name `since`) with the short hint `periodHelp`. In the prototype this field does not exist; it is real (OAuthForm:290, KeyForm:210) and sets the first sync's start and cost: keep as one labelled field.
  4. for `oauth` modes: the pre-fields (`entry.oauthPreFields`, e.g. Jira site, GitLab/Airtable choices) as fields, then `entry.oauthHelp` (what the person will see at the editor, plus write-access disclosures) as a hint.
  5. for `oauth+key`: a quiet link "or paste a key" (`pasteKey`) that unfolds the key form (focus on the first input).
  6. for `key` modes: `keyHelp` + link "Where to find the key" (`whereKey`, `docsUrl`, new tab, `newTab` sr-only) (prototype: `<p class="where"><b>Where to find it.</b> ...`), then `entry.fields` (secret = password input, text, list = textarea one per line, select), each with its `help` as `.hint`. A key is never prefilled or shown again.
  7. `others = otherOwnersNote(conns, viewerId, locale)` ("Already connected by Ana.") + `duplicateWarning` ("Avoid connecting the same workspace twice.") as one quiet note, only when another person already has this tool.
  8. Outlook: `adminConsentUrl` link "Admin consent link" with the sentence `ADMIN_CONSENT_MESSAGE(_EN)` (connection-form.ts:171-174), under the button.
  9. `!triedForReal`: quiet note `notTested` ("Not tested with a real account yet.") at the end of the body.
- Foot (the ink pill of the panel):
  - mode `oauth` / `oauth+key`: `type=submit form="oauth-form"` "Continue with {Tool}" (`connectWith`), `data-focus`. The form is a REAL `<form method="post" action="/api/v1/connexions/oauth/{id}/debut">` (`oauthStartPath`, connection-form.ts:114) with hidden `retour` (when not `/connexions`), the pre-fields and `since`. It navigates away; there is no simulated busy. On submit the label becomes "Opening {Tool}..." (new key `opening`), fields frozen; `pageshow` resets it (tool-dialog.tsx:270-274). Under it the note: prototype "<Tool>'s own sign-in page opens. Leon never sees your password." Only keep that sentence for tools that really use OAuth/Pipedream (true for those); a key tool must not say it.
  - mode `key`: `type=submit form="panel-form"` "Test and connect" (`testConnect`), busy label "Testing..." (`testPending`). Prototype wording "Connect {Tool}"; the real action tests the key first, keep "Test and connect" so the person knows nothing is saved before a good test. Note: "The key is encrypted. Only you can replace it." (`KEY_NOTE`) is true for the real product (secrets sealed, `isCreator` rule): keep.
  - mode `oauth+key` with the key form open: the key form's own submit is a line button (`btn--line`, "Test and connect") inside the form: one ink pill per view (today's `secondary`, tool-dialog.tsx:214).
  - mode `none`: no button; text `unconfiguredApp` ("The {Tool} app is not configured on this server."). Foot is the default "Done".
  - `!canConnect`: instead of the form, `connectorsUnavailable`.
- Refusals (all `{error}` of `ActionResult`, under the last field, `role="alert"`, in the product's words; the key is never repeated): `badRequest`, `unknownTool`, `notConfigured`, `toolUnavailable`, `keyRejected` ("{Tool} rejected the key."), `toolNotResponding`, `saveFailed`, `replaceFailed`, `syncUnavailable` (action threw), `invalidFieldsMessage` ("Check these fields: A, B"), and the English `ConnectorHttpError` messages (e.g. "Repository not accessible: acme/leon"). After an error the focus returns to the first secret field (tool-dialog.tsx:177-182).
- Success of a key connect: `connectAction` -> `{ok, account}`, `revalidatePath('/connexions')` refreshes `connections`; the panel then shows view C for the new connection (detect by `connections` for this tool growing, as `before` does at index.tsx:82-110) and fires `toast.success(connectedToast)` is NOT needed any more: view C says it in place.

**B. repair view** (prototype `view === 'repair'`; real: a connection with `status error`, viewer is `isCreator`)
- Body: status row with the err pill (`Error`/`Stopped`), then the reason paragraph `panel__what` = `lastError` (real text, e.g. "Intercom rejected the key"), then facts Account (`c.label`) and Visible to, then:
  - OAuth/Pipedream connection (`canReconnect(c)`): nothing else; foot button submits a real POST form to `oauthStartPath(provider)` with hidden `reconnect=<c.id>` and `retour`. This replaces the tokens of the SAME connection, it does not create one.
  - key connection: key form with ONLY the secret fields (`replaceId`), "Test and replace" (`testReplace`) -> `replaceKeyAction({id, fields})`; prototype labels the foot button "Reconnect" for both; use "Reconnect" on the foot for both and keep the key form's submit in the foot (`form="panel-form"`).
- Foot: ink "Reconnect" + quiet "Not now" (closes) + `KEY_NOTE`. Hidden (not disabled) when `!canConnect`; when `isCreator && oauth && canConnect && !entry.oauthReady` show `appGone` ("The {Tool} app is no longer configured on this server, so it can't be reconnected.") in place of the button.
- If the viewer is NOT the creator (an admin or a colleague opens a broken card): manage view with the err pill and reason, no Reconnect; text: who connected it (`createdBy.name`) so they know whom to ask. Admin can still pause/delete.
- Stopped (`creatorLeft`): same, reason = "{name} is no longer a member" (from `statusLine`); no Sync now, no Reconnect, Delete for `canManage`.

**C. connected view** (prototype `view === 'connected'`; just connected)
- `.done`: working pill "First sync in progress" (`firstSync`, new), `<h3><span class="mark is-on">{Tool} is connected</span></h3>` and one paragraph: real text from `oauthNotice` "{Tool} is connected. The first sync starts within a minute." (connection-form.ts:269; the prototype's "every 15 minutes" is not in the product text), facts Visible to; foot "Done" (ink, `data-focus`) + "Manage" (line).
- Shown after: a key connect (3.5.A), and the return from the editor `?branche=<tool>` (3.7).

**D. manage view** (prototype default; real: tool has >= 1 connection, none being repaired)
- Panel body = `entry.warning` (if any), then ONE BLOCK PER CONNECTION (`conns` of this tool, creation order, `connections.ts:190`), then "Connect another account", then `notTested` note.
- A connection block:
  - status row: pill + one button on the right:
    - active, synced: ok pill `Synced {formatSince(lastSyncAt)}` (new key `syncedAgo`; today `statusLine` builds "Active . last sync ..."); button `btn--xs btn--line` "Sync now" (`syncNow`) -> `syncNowAction(c.id)`. In place: busy "Requesting..." then "Sync requested" for 1.6 s (`Leon.busy/done` pattern), failure `syncFailed` as a refusal line under the row. The old toast `syncRequested` ("Sync requested. It will start within a minute.") is replaced by the in-place label, per the kit's rule. A sweeping/working pill while `nextSyncAt <= now` is optional.
    - active, never synced: work pill "First sync in progress"; Sync now still allowed.
    - paused: muted pill "Paused" (the kit has no muted pill: one rule in the screen's sheet); button "Resume" (`resume`) -> `setPausedAction(id,false)`, no Sync now (`canSyncNow` false).
    - error: err pill "Error"; "Reconnect" (creator, see B) else nothing.
    - stopped: err pill "Stopped"; no button.
  - facts: Account (`c.label`), Visible to, Items saved (`itemsSynced`, locale number; 0 -> "None yet"), Connected by/when (the old `secretText`: "Key ....abcd . connected by Julie on 12 Oct 2026"; keep the information in a "Connected" row: by whom and when, and "Key ....abcd"/"Token ....abcd"). `Leon reads` row only if the catalogue gets a `reads` text (gap).
  - Visible to:
    - creator and not GitHub: a `.field` select = `ShareSelect` (options: "Whole team", "Only me", each group; `shareConnectionAction(id, value)`; saved at once; success in place ("Saved") or `shareSaved` toast; failure `shareFailed`), prototype documents does the same for files (documents.js).
    - everyone else or GitHub: read-only value: "Team" for GitHub and team, "Only {creator name}", or the group label.
    - Today the select lives under the `groups &&` guard (tool-dialog.tsx:424); `groups` is always passed on this screen but NOT in onboarding (`ToolDialog` is called without `groups` at tools-step.tsx:667-678), so there it is hidden. Keep that.
  - quiet row of `linkbtn`s: "Pause" / "Resume" (`canManage`; `setPausedAction`; the pill changes in place), "Replace key" (creator, key connection; unfolds `KeyForm replaceId`, `aria-expanded`), and for GitHub only a link to Settings > Team repositories (see 3.9).
  - "Delete connection" (`btn--quiet`, `canManage` only): with ONE connection it goes in the foot like the prototype (`data-act="ask-delete"`); with several, inside each block.
- Confirmation (`Leon.panel.confirm` equivalent, in place of the foot): title `deleteTitle` "Delete "{label}"?", text `deleteConfirm` ("Leon will stop reading {Tool} with {these tokens, which will be deleted | this key, which will be deleted}. Previously captured sources will remain in memory."), yes "Delete" (`delete`), no "Keep it" (new `keepIt`). Action: `deleteConnectionAction(id)` (for Pipedream also `forgetPipedreamUser`). OK -> close or redraw the panel (if other connections remain), `toast.success(connectionDeleted)`; not ok -> `toast.error(connectionMissing)`; thrown -> `toast.error(syncUnavailable)`.
- "Connect another account" (`another`, prototype "Connect another {Tool} account"): shows view A for the same tool, with `Not now` in the foot to return to D. Hidden when `!canConnect`.

### 3.6 Filters and search (tiles only)

- Search field: kit `.search` (`data-slash`, `/` focuses). Placeholder/label `filter` ("Filter tools"; prototype "Search tools"). Match = folded (accent-insensitive, `fold` from `@/lib/verre`) label OR folded family label (catalogue.tsx:139-141), so "mail" finds Gmail by family. Escape clears when not empty (catalogue.tsx:173-178); the clear X button (`clearFilter`) may go (the kit field has none) but keep Escape.
- Family chips: `<div class="chips" role="group" aria-label="Families" data-chips>` "All" + the families present in the catalogue in `PROVIDER_FAMILIES_ORDER`; a second click on the pressed family goes back to All (catalogue.tsx:219). Event `leon:chip` -> React state. Labels `family.*`.
- Both combine. Prototype section head: `<h2>Add a tool</h2><span class="tag c3">{n}</span>` with the search at the right (`sec__tools`): the flag counts the tiles drawn (today's sr-only `count` becomes the visible flag; allowed: "flags that count").
- Today's search is sticky on mobile only; not in the prototype: drop.

### 3.7 Errors returned in the address (`?branche=`, `?erreur=`, `?outil=`)

Written by `oauth-routes.ts:505-514, 545-555`; read by `oauthNotice(params, locale)` (connection-form.ts:245-274). Codes
(`OAUTH_RETURN_CODES`, 150-160) and their messages (en, 213-241):
`branche=<tool>` success ("{Tool} is connected. The first sync starts within a minute."); `annule` ("Connection to
{tool} cancelled."); `expire` ("The link expired. Please start again."); `refuse` ("{Tool} denied the authorization.");
`indisponible` ("{Tool} isn't responding. Try again in a moment."); `champs` ("Check the fields you entered.");
`admin` (Outlook: "Your company's Microsoft administrator must approve Leon first." + admin-consent link);
`admin_accorde` (SUCCESS tone: "Consent granted: click Continue with Outlook again."); `autre_compte` ("Reconnect {tool}
with the same account and site, or add another connection."); `vide` ("Leon is connected to {tool}, but can't access
anything yet." / Airtable: no base chosen / GitLab: member of no project).
Also GitHub's setup URL: `?state=/bienvenue/outils&branche=github` redirects to onboarding (page.tsx:26-27).

The prototype has nowhere to put these (no notice, nothing under the title). Proposed, in the founder's taste:
1. Success with a tool (`branche`, or `admin_accorde`): open that tool's panel in view C ("{Tool} is connected") and nothing else; no ring (`fresh`/`cx-fresh-row` goes).
2. Error with a known tool (`outil=`): open that tool's panel in the connect view with the message as a refusal line (`field-error` style, `role="alert"`) above the foot; for `admin` also the admin-consent link in the panel body (`consentUrl` from the server as today); for `autre_compte` open the manage view of that tool.
3. Error without a tool: `toast.error(text)` (a toast that stays until closed).
4. Remove the query from the address after reading it (`router.replace('/connexions')`, keeping `?open=`), so a reload does not replay it (today the notice stays after a reload).
Alternative if the founder wants a visible strip: one `.paper` line under the title, same texts. Whatever is chosen, the text must be in the DOM at server render (today `ReturnNotice` uses `AnimatePresence initial={false}` for that, return-notice.tsx:21) or a screen reader and a no-JS user miss it: render it server-side in the panel (open `<dialog>` is not possible without JS) or as the `.paper` line. Decision needed (section 9, item 6).
`ReturnNotice` stays exported (onboarding uses it) and keeps its tone/live/`adminConsent` logic; restyle it as a refusal/status line, not a glass `Notice`.

### 3.8 Flows (what each control calls)

| Flow | Control | Calls | Result |
|---|---|---|---|
| Connect by button (own OAuth) | foot ink "Continue with {Tool}" | `POST /api/v1/connexions/oauth/{id}/debut` (CSRF same-origin, body <= 64 KB; fields `retour`, `since`, pre-fields) -> 303 to the editor -> `GET /api/v1/connexions/oauth/{app}/retour` | redirect to `/connexions?branche=<id>` or `?erreur=<code>&outil=<id>` (or `retour` page). Not signed in: 303 to `/connexion`. |
| Connect by button (Pipedream: Gmail, Drive, Slack) | same form | `startHandler` -> `pipedreamStart` (creates a Pipedream Connect link; a new Pipedream user per connection and per reconnect) -> `GET .../pipedream/retour` | same returns; on failure the Pipedream user is forgotten. The departure takes about a second: the button must say "Opening ..." (tool-dialog.tsx:267). |
| Connect by key | `connectAction({provider, fields, since})` | tests with a real HTTP client against the connector's hosts, then `createConnection`; `revalidatePath('/connexions')` | `{ok, account}` or `{error}` |
| Replace key | `replaceKeyAction({id, fields})` (secret fields only, rest from the stored config) | creator only | `{ok, account}` ("Connected: {account}") or `{error}`; old key kept if the new one is refused |
| Reconnect OAuth | POST to `.../debut` with `reconnect=<id>` | creator only (`ownConnection`) | replaces tokens of the same connection; restarts it unless paused |
| Sync now | `syncNowAction(id)` | sets `nextSyncAt = now` | `{ok}` |
| Pause / Resume | `setPausedAction(id, bool)` | `manageable` | `{ok}` |
| Share | `shareConnectionAction(id, partage)` | creator; refuses GitHub | `{ok}` |
| Delete | `deleteConnectionAction(id)` | `manageable`; Pipedream forgets the account | `{ok}`; what was captured stays (connection_id becomes null) |
| Filter / recommended | client only | | |
| Capture channels (today only in the diagram) | chip = link | `CANAL_REGLAGE` in carte.tsx:57-65: `claude_code, codex, cursor, antigravity` -> `/reglages#ordinateurs`; `claude_ai, chatgpt` -> `/reglages#extension`; `mcp_remember` -> `/reglages#assistants` | navigation |

Every action already returns `{ok:false}` / `{error}` and never throws; the client still wraps calls in try/catch
(`useManage`, tool-dialog.tsx:359-380) and falls back to `syncUnavailable`: keep both layers.

### 3.9 GitHub team repositories

Not on this screen today: owner/admin choose them in Settings, Team tab (`DepotsEquipeSection`,
`src/components/verre/reglages/depots-equipe.tsx`, rendered at `reglages/page.tsx:149` for `mayInvite`;
`setDepotEquipeAction`, strings `settings.depots*`). On this screen it shows as: GitHub's "Visible to" is fixed to
the team and has no select (tool-dialog.tsx:403-405, 427); the catalogue `help`/`oauthHelp` of GitHub say "Leon only
syncs the team repositories chosen by an admin (Settings, Team tab)". The prototype's GitHub card shows the repos as the
account ("kestrel/app, kestrel/site"); the real account label is whatever `accountLabel()` returns.
Port: no new logic here. Optional small addition (needs the viewer's role passed from the page, as `mayInvite` is in
Settings): a quiet link "Choose team repositories" in GitHub's manage view -> `/reglages#depots-equipe`.
A GitHub connection with no team repository reads nothing until an admin ticks one: this is the likeliest "it is
connected but nothing arrives" case, so the link is worth having.

### 3.10 The diagram, the capture channels and the game (real, absent from the prototype)

What `carte.tsx` shows and what is lost if it is removed:
- A summary line: "N connected tools . last sync {time}" (dates and counts: the founder removed those).
- One chip per connected tool with the connection states in a tooltip: all of it is in the cards and panel.
- One chip per capture channel (`channels`, filtered to `CANAL_REGLAGE` keys; 7 kinds), with "No captures yet" / "Last
  capture {time}" / "No captures for N days" (late = `stale`, 24 h rule `STALE_AFTER_MS`, stale.ts:6), linking to Settings.
  THIS information is shown nowhere else except the sidebar's alert "Memory out of date . {channels}"
  (`shell/sidebar.tsx:84-118`, `shell/mobile-bar.tsx:116`, fed by `(app)/layout.tsx:14-20`).
- Drag of Leon's circle, legend, "Play" and the game (`jeu.tsx`, `partie.ts`, `partie.test.ts`, `connexions.css`).
Proposed: remove the diagram and the game with their keys; keep capture health as a third section on this screen:
"Captures" (flag count optional), 7 tiles (52px) with `ToolIcon`-like logo (`/logos/claude-code.svg`, `cursor.svg` exist;
others need an icon, `kindIcon` in chips.tsx), name = `kindLabel`, a caption only when something is wrong:
"No captures for N days" (red, `captureSince`) ; a channel that never captured shows "No captures yet" quiet; the whole
tile is a link to `CANAL_REGLAGE[kind]` (kit: `href`). Alternative: move it to Settings > Assistants (the prototype's Settings
already has "a computer or a token opens its panel"). Founder decides (section 9, item 1).

---------------------------------------------------------------------------------------------------------------

## 4. Prototype -> real, piece by piece

| Prototype piece | Where | Real counterpart | Work |
|---|---|---|---|
| Page title only, no subtitle | `connections.html` `<header class="head"><h1>Connections</h1>` | `index.tsx:117` `PageHeader title subtitle` | Keep `t('title')`. Drop `t('subtitle')` ("By default, what Leon reads ... Whoever connects a tool can change who sees it."). Its content survives as the panel's "Who will see it" fact and the share select. No ink pill in the head. |
| Section "Connected" + flag count | `connections.html` `#connected`, `tag c2` | `catalogue.tsx:242-265` Section `connected` (`t('connected')`: "Your connected tools") | Rename to "Connected" (value of key `connected`, or keep and shorten). Flag = number of cards drawn (tools, not connections). Grid of 88px cards `ul.grid`. |
| Card (name, caption, chevron / red dot + "Reconnect" ink pill) | `connections.js:12-16` `Leon.card` | `catalogue.tsx:37-88` `ConnectedRow`; `parts.tsx` `connState` | Build `ConnectedCard` from `connectedTools()`; caption rules in 3.1. `data-outil={id}` stays (focus return, `index.tsx:98`). Delete `ConnectedRow`, `StateWord`, `StatusText` usage on cards. |
| Empty connected block | `connections.html #conn-none`, `connections.js:66` | absent today | New `.empty` block (keys `noneConnected`, `pickFirst`). |
| Section "Add a tool" + flag + search + chips + tiles | `connections.html #add`, `connections.js:17-20, 46-59` | `catalogue.tsx:158-224, 267-290` | Tiles 52px, no group headings per family (the chips do the grouping; prototype is one flat grid in catalogue order: family order then label, which `listCatalog` already sorts). Drop `h3` family titles. |
| "Already connected" line | `connections.js:51-52`, `connections.css` | none | New small component (`KnownLine`). |
| No-match empty | `connections.html #empty` | `catalogue.tsx:292-319` `EmptyState` + Button | `.empty` + line button; reuse keys, drop count. |
| Side panel, 4 views | `connections.js:83-107`; `app.js:363-440` | `tool-dialog.tsx:636-709` `ToolDialog`, `Panel` 527-634, `ConnectionCard` 382-525 | Rebuild on the new side-panel component; sections 3.5 A-D. Keep `AddConnection` (export) as the form body reusable by onboarding. |
| `L.facts`, `L.pill`, `L.who`, `L.field`, `.hint`, `.statusrow`, `.done`, `.panel__what`, `.panel__note` | `app.js:94-125`, NOTES "The kit" | `Field/Input/Select/Textarea` of `@/components/verre`, `StatusText` | Create the React equivalents once (shared with Documents/Team panels); this screen only consumes them. |
| `Leon.panel.busy` (fake 1.3 s) | `connections.js:111` | `useTransition` / `leaving` state | Real pending states, no fake delay. Button label = verb + ellipsis. Highlighter in the foot while pending. |
| `Leon.panel.confirm` | `connections.js:136` | `AlertDialog` in `ConnectionCard` (tool-dialog.tsx:492-513) | In-place confirmation with the real texts. |
| `Leon.toast` | `connections.js:140` | `toast` from `@/components/verre` | Only for what cannot be seen in place (delete, errors). |
| `Leon.openHere` / `?open=<tool>` | `connections.js:150` | none | Read `searchParams.open` in `page.tsx` (validate against `PROVIDER_IDS`) and pass `initialOpen`; also push-state open on card click if the shell wants deep links. |
| `?state=empty` | `connections.js:158` | none (prototype-only) | Not ported. A real new workspace is `connections.length === 0`. |
| Sidebar alert "Intercom needs reconnecting" + nav flag | `app.js:350-` shell | `(app)/layout.tsx` feeds `stale` capture channels only | Gap: see 5. |
| Fictional-example line `.fict` | page foot | none | Do not port. |
| Prototype tool data: `reads`, `connect.how`, `connect.where`, `connect.fields` | `app-data.js` | `CatalogItem.oauthHelp`, `keyHelp`, `docsUrl`, `fields`, `oauthReady`, `keyAccepted` | `where` = `keyHelp`; `fields` = `entry.fields`; `how` = `panelMode`. `reads` has no counterpart. |

---------------------------------------------------------------------------------------------------------------

## 5. Gaps

Prototype shows, real lacks:
1. "Leon reads" / "Leon will read" (one sentence per tool, e.g. Slack "The channels you are a member of. Never your direct messages.", `app-data.js:100-148`). Real catalogue has only `oauthHelp`, `keyHelp`, `warning`. Options: add optional `reads` (+ `en.reads`) to `CatalogEntry` (types.ts:129-152) and the 42 `*/catalog.ts` files (content work; text must be true, check each connector); or omit the row. Never ship the prototype's strings unchecked.
2. "How often: Every 15 minutes. Each item is kept word for word." Not in real copy. Check the real schedule (`src/server/connectors/queue.ts` / `sync.ts`: `again: 'soon' | 'later' | 'office'`, per-connector `minIntervalMs`) before stating any cadence. Real text says only "The first sync starts within a minute."
3. "Items saved: 1,842" as a fact: real has `itemsSynced`. OK.
4. A sidebar/nav flag and alert for a broken connection ("Intercom needs reconnecting"). Real shell: `MemoryStatus` shows stale CAPTURE channels only; nothing tells a person that a connection is in error. Needs `listConnections` (or a cheap count of `status='error' or creatorLeft`) in `(app)/layout.tsx` and a new alert in `shell/sidebar.tsx`/`mobile-bar.tsx`; owned by the shell builder. This screen provides `?open=<tool>` for it. Keep the capture alert too.
5. Muted "Paused" pill, "work" pill variants: prototype pill kinds are `''|err|work`. Paused needs one more rule in the screen's sheet.
6. "Visible to" avatars (`L.who` draws up to 3 member initials). Real page has no members list; draw text only (or the creator's initials via `av` for "Only you").
7. Family model: prototype families are "Email, chat and files / Meetings / Projects and docs / Engineering / CRM / Support"; real families (`providers.ts:5-32`): Dev, Meetings, Projects, CRM, Support, Mail chat and calendar. Membership differs (prototype: Notion and Jira/Confluence under "Projects and docs", Drive and Slack under "Email, chat and files"; real: Notion under dev, Drive under projet). `PROVIDER_FAMILIES` also drives Team's "follow" filters (`FOLLOW_FAMILIES`) and the public site (`FAMILY_LABELS_EN`): do NOT change them for this port. Chips use real families.

Real has, prototype lacks (must survive; proposed place in brackets):
1. Recommended for your role (between Connected and Add).
2. "Read items from" period select on every connect (panel connect view).
3. "Pause" / "Resume" (quiet links in the manage block).
4. "Replace key" for a healthy key connection; "Reconnect" for a healthy OAuth connection (the prototype only offers Reconnect on an error). Keep both as quiet links for the creator in manage view.
5. Per-connection share select (creator, not GitHub) and its read-only forms.
6. Several connections per tool, several people (blocks in the panel; `otherOwnersNote`).
7. Stopped state (`creatorLeft`).
8. `!canConnect` setup warning, `appGone`, `unconfiguredApp` (`panelMode none`), `Coming soon` tiles, `notTested` note, `entry.warning`.
9. Return-from-editor messages (3.7) and the admin-consent link.
10. Pre-fields before the OAuth click (Jira site, GitLab, Airtable bases, etc.).
11. "or paste a key" fallback beside the button (`oauth+key`).
12. `retour` page handling (`/connexions` or `/bienvenue/outils`).
13. Capture channel health chips, diagram, game (3.10).
14. i18n: every string in both languages (section 7).
15. `generateMetadata` title.

---------------------------------------------------------------------------------------------------------------

## 6. Build order and file plan

1. `page.tsx`: keep as is; add `?open=` read (validated by `PROVIDER_IDS`) -> prop `initialOpen`. Optionally pass viewer role for the GitHub link. Keep `setupReturn` redirect first.
2. `model.ts`: keep `connectedTools`, `recommendedToConnect`; add pure helpers with tests: `cardOf(tool, conns, viewerId, groups, t)` -> `{sub, err, pill}`; `scopeOf(c, entry)`. Keep `secretText` for the "Connected" fact. `model.test.ts` extended.
3. New `tool-card.tsx` / `tool-tile.tsx` (or one `tl.tsx`) producing the kit's markup (`<li class="c{n}"><button class="tl card ...">`). Pure markup function + React wrapper so it can be string-tested like `connections.js` `selfCheck`.
4. `catalogue.tsx`: rewrite around chips + search + tiles + known line + empty; remove `ConnectedRow`, `FreeTile`, `GlassCard`, `AnimatePresence`.
5. `tool-dialog.tsx`: rewrite `ToolDialog` as the side panel with views A-D; keep `AddConnection`, `KeyForm`, `OAuthForm`, `PeriodField`, `FieldInput` logic (rename classes), keep `useManage`. Keep `ToolDialog` props (`entry, open, onOpenChange, onCloseAutoFocus, conns, viewerId, now, canConnect, session, returnTo, groups`); add optional `view`.
6. `index.tsx`: remove diagram/game/subtitle/`fresh`; keep state for open tool, `session`, focus return (`onCloseAutoFocus`, `[data-outil]` lookup).
7. Delete: `carte.tsx`, `jeu.tsx`, `partie.ts`, `partie.test.ts`, the diagram/ring parts of `connexions.css`, `parts.tsx` `StateWord`/`ConnStatus` once unused (keep `connState`, `stateDetail`, `keepTogether` if used). Check `rg` that nothing else imports them (only `index.tsx` imports `carte`; `tools-step.tsx` imports `return-notice` and `tool-dialog`).
8. Messages: add new keys to BOTH `messages/en.json` and `messages/fr.json` (same key set is checked: they are identical today); remove dead ones (`play*`, `game*`, `dragLeon`, `graphLabel`, `summary*`, `lastCapture`/`captureNone`/`captureSince` only if the Captures section is dropped, `subtitle`, `catalogueCount`).

---------------------------------------------------------------------------------------------------------------

## 7. i18n keys (`connections` namespace; en values)

Used and kept: `title` "Connections"; `connected` ("Your connected tools": retitle "Connected"); `toConnect` ("Connect a tool":
retitle "Add a tool"); `recommended`; `filter`; `families` "Tool families"; `all`; `manage`; `connect`; `soon`; `connectorsUnavailable`;
`serverSetup`, `serverSetupEnd`; `noMatch`, `noMatchQuery`, `inFamily`, `noFamily`, `clearFilters`; `count` (plural, sr-only live);
`statusActive/Paused/Error/Stopped`; `periodLabel`, `periodHelp`, `since.7/30/90/365`; `whereKey`, `testPending`,
`testConnect`, `testReplace`, `connectWith`, `pasteKey`, `unconfiguredApp`; `syncNow`, `resume`, `pause`, `syncFailed`,
`connectionResumed/Paused` (toasts become in place: keep for errors), `connectionMissing`, `notConfigured`, `badRequest`, `notCreator`,
`unknownTool`, `toolUnavailable`, `keyRejected`, `toolNotResponding`, `saveFailed`, `replaceFailed`, `reconnect`, `appGone`,
`replaceKey`, `delete`, `deleteTitle`, `deleteConfirm`, `tokens`, `key`, `connectionDeleted`, `another`, `duplicateWarning`,
`notTested`, `privateTool`, `sharedTool`, `syncUnavailable`, `adminConsent`, `newTab`, `family.*` (6), `connectedToast`
(the old toast; the new view C replaces it), `syncRequested` (replaced by the in-place label).
Also used from other namespaces: `documents.shareWith`, `shareLabel`, `shareSaved`, `shareFailed`, `shareTeam`, `shareMe`,
`shareGroup`; `onboarding.*` department labels (via `departmentLabelKey`) in `usePartageOptions`.
Non-localised strings in `connection-form.ts` (en and fr hard-coded, selected by `locale`): `statusLine`, `resultMessage`,
`invalidFieldsMessage`, `otherOwnersNote`, the `OAUTH_RETURN_CODES` messages, `ADMIN_CONSENT_MESSAGE(_EN)`, `secretText`
in model.ts. Keep as they are (tests rely on them).
Dead after the port: `subtitle`, `catalogueCount`, `play`, `playHint`, `gameName`, `gameHowTo`, `gameScore`, `gameLevel`,
`gameLives`, `gameBest`, `gameMagnet`, `gameOver`, `gameNewBest`, `gameReplay`, `gameQuit`, `dragLeon`, `graphLabel`,
`summary`, `summaryLastSync`, `clearFilter` (if the X goes), `lastCapture`/`captureNone`/`captureSince` (unless Captures tiles keep them), `statusActive` is still used by the panel pill.
New (add in en AND fr): `noneConnected` "No tool connected yet", `pickFirst` "Pick your first one below.", `alreadyConnected`
"{tool} is already connected.", `opening` "Opening {provider}...", `keepIt` "Keep it", `notNow` "Not now", `syncedAgo`
"Synced {time}", `firstSync` "First sync in progress", `syncRequestedShort` "Sync requested", `requesting` "Requesting...",
`onlyName` "Only {name}", `itemsSaved` "Items saved", `none` "None yet", `account`, `visibleTo`, `connectedBy`,
`readsLabel` (only if `reads` is added), `connectedDone` "{provider} is connected." (+ `oauthNotice` text for the sentence),
`chooseRepos` (optional, GitHub link), `connectedAnother`.

---------------------------------------------------------------------------------------------------------------

## 8. Constraints for the builder (must keep)

- Server side: do not touch `actions.ts`, `connection-form.ts`, `oauth-routes.ts`, `connections.ts`, `catalog.ts`. The OAuth start must stay a real HTML form POST to `oauthStartPath(provider)` (CSRF origin check, cookie set by the server, 303 redirect); it cannot be a `fetch`.
- A key is never prefilled, never re-shown, never echoed in an error; `form.reset()` after a success (tool-dialog.tsx:184).
- Focus: after open, focus the primary action when the tool has no connection (`firstStop`: `[data-autofocus]` then first form input then submit), else the panel itself (not "Sync now": an absent-minded Enter would launch it) (tool-dialog.tsx:67-72, 676-680). After a delete or an add the focused button disappears: return focus to the panel (`focusDialog`, 668-672). On close, if the opener was redrawn, focus the card of that tool (`[data-outil=id]`, index.tsx:92-103) else the search field. Keep `data-outil`.
- Accessibility: state is never colour alone (word + icon or caption); labels "Manage {Tool}", "Reconnect {Tool}", "Connect {Tool}"; sr-only " (opens in a new tab)" on external links; `aria-live` on results; `role="alert"` on refusals; `aria-pressed` on chips; `aria-expanded` on "Replace key"/"or paste a key".
- Reduced motion: no looping or ring animations (nothing of the diagram stays).
- Phone (390): one column, 44px controls; the panel becomes full width.
- Onboarding keeps working: `AddConnection` (props `entry, onAdded, returnTo`), `ToolDialog` (props above, called without `groups`), `ReturnNotice` (props `notice, consentUrl`), and `OAuthReturnPath` = `/connexions | /bienvenue/outils`. If their markup changes, update `onboarding/tools-step.tsx` and its test mock together (one PR, or keep a compat wrapper).
- Tests: `model.test.ts` and `actions.test.ts` must still pass; add tests for the new card caption rules (error, stopped, paused, private, group, GitHub) and the filter (family + folded search + "already connected").

---------------------------------------------------------------------------------------------------------------

## 9. Decisions for the founder (default chosen in this map in bold)

1. Diagram, capture-channel chips and the "Quick Recall" game: **remove from Connections**; capture health kept as a "Captures" section of tiles linking to Settings (alt: move to Settings > Assistants; alt: drop). The game's record is browser-only data, nothing server-side is lost.
2. Families: **keep the real six** (Dev, Meetings, Projects, CRM, Support, Mail chat and calendar); do not adopt the prototype's demo families.
3. "Leon reads" row: **omit until a true `reads` text exists per tool**; "How often": **omit** until the real cadence is confirmed.
4. Recommended section: **keep, between Connected and Add** (first in an empty workspace).
5. Paused card: **caption "Paused" (quiet)**, not red.
6. Return-from-editor message: **open the tool's panel with the result (success view C or refusal line); unknown tool -> toast; strip the query after reading.** Alt: one `.paper` line under the title.
7. GitHub: **optional quiet link to Settings > Team repositories** (needs viewer role on the page).
8. Sidebar alert for a broken connection: **belongs to the shell port**; this screen only needs `?open=<tool>`.

---------------------------------------------------------------------------------------------------------------

## 10. Risks

- Onboarding shares `ToolDialog`, `AddConnection`, `ReturnNotice` (section 8). A restyle that renames props or removes exports breaks `/bienvenue/outils` and its mocked test.
- The OAuth button is a navigation; porting the prototype's fake `panel.busy` would make it look done before it left. Use the real submit and the `pageshow` reset.
- After a key connect the panel must wait for the revalidated `connections` prop (server action returns before React re-renders with new data); otherwise view C opens on an empty `conns` list. Detect growth of this tool's connections, with a timeout fallback to a plain success line.
- One card per tool but several connections: delete/pause/reconnect must always act on a specific connection id; never from the card.
- Showing the prototype's fictional strings ("Every 15 minutes", "Never your direct messages") as product claims would be wrong; every claim must come from the catalogue or the product.
- Query-string results are replayed on reload today; removing them needs `router.replace` without losing `?open=`.
- Deleting `carte.tsx` removes the only on-screen capture-channel health; make the placement decision before deleting.
- `messages/en.json` and `fr.json` must keep identical key sets (92 today each).
- GitHub: `shareConnection` refuses GitHub on the server; never show a share select for it even if `groups` is passed.
- `connectedTools()` ranks by the worst connection; a tool with one broken and one healthy connection shows red on the card. Intended; the panel shows the healthy one too.
