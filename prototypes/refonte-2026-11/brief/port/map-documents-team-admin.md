# Port map: Documents, Team, Admin

Area: documents-team-admin. Written by reading every file listed below in full. Nothing under the worktree was edited.
Worktree root (WT): /Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484
Prototype root (PR): WT/prototypes/refonte-2026-11/papier/app/ (app.css, app.js, NOTES.md, documents.*, team.*, lists.css)

Language of the real product: i18n through next-intl (messages/en.json, messages/fr.json). The Admin page is the exception: French only, hard-coded strings.

---------------------------------------------------------------------------------------------------------------

## 0. Read this first: three mismatches between prototype and product

1. **The prototype's "Team" is not the product's "Team".**
   - Prototype team.html = a grid of the workspace's 38 members + Invite + a person panel (role, manager, Remove). That is the real Settings > Team tab (src/components/verre/reglages/members.tsx), not /equipe.
   - Real /equipe = "My team": the org chart centred on the reader, the people UNDER the reader (reports), and for the chosen report: what the reader follows (tool families), "Also see their private items", recent activity. The prototype shows none of it.
   - The prototype's Settings (settings.js:56-75) has four groups (Profile, Security, Assistants, Workspace) and no members, groups or org chart. So after the port the real Settings > Team tab must have a new home, and it is the Team screen (section 3).
2. **Documents data is thinner than the prototype's.** Real `listDocuments` (WT/src/server/documents/documents.ts:264-290) returns id, title, createdAt, ownerUserId, ownerName, folderId, folderName, ownerFormer, partage. No size, no "reading" state, no kind. Prototype's `size`, `state: 'reading'` and `type` have no real source (see gaps G1, G2).
3. **Real "Visible to" has three kinds of value** (`equipe`, `moi`, or a group uuid), the prototype has two (Team, Only you). Groups are a real feature (migration 0055) shared with Connections (src/components/verre/connexions imports the same `partage.tsx`). Do not break that import: the Connections builder will use `ShareSelect`/`usePartageLabel`/`GroupOption` from here.

---------------------------------------------------------------------------------------------------------------

## 1. Files of the area (all read in full)

### Documents
| File | Lines | Role |
|---|---|---|
| WT/src/app/(app)/documents/page.tsx | 26 | Server page. `requireUserContext()`, then in parallel `listDocuments(ctx)`, `canInvite(ctx)` (named `admin`), `listGroups(ctx)`. Renders `<Documents documents viewerId admin groups>`. `groups` is mapped to `{id, service, nom}`. `metadata.title = 'Documents'` (hard-coded). |
| WT/src/app/(app)/documents/actions.ts | 116 | Server actions (see section 2.1). |
| WT/src/app/(app)/documents/actions.test.ts | 142 | Vitest for addFileAction, deleteDocumentAction, deleteFolderAction. Keep green; do not change the action signatures. |
| WT/src/components/verre/documents/index.tsx | 531 | Client UI. `Documents` (l.482), `UploadForm` (l.91), `DocumentItem` (l.292), `FolderItem` (l.360), `groupDocuments` (l.462), `FormatIcon` (l.70), `LOGOS` map (l.59). |
| WT/src/components/verre/documents/partage.tsx | 68 | `GroupOption` type, `usePartageOptions(groups)` (Whole team / Only me / each group), `usePartageLabel(groups)`, `ShareSelect({share, value, groups, label})`. Also used by Connections (connexions/index.tsx:14, connexions/tool-dialog.tsx:58). |
| WT/src/components/verre/documents/dropped-files.ts | 82 | `readDropped(entries)` (drag of files and whole folders via webkitGetAsEntry), `readPicked(files)` (webkitdirectory picker). Pure, no UI. KEEP UNCHANGED. |
| WT/src/components/verre/documents/dropped-files.test.ts | 152 | Tests of the two above. KEEP. |
| WT/src/lib/documents.ts | 192 | Contract shared server/browser: `PartageSchema`, `aclOf`, `DOCUMENT_MAX_BYTES` (10 MB), `FOLDER_MAX_FILES` (200), `OFFICE_EXTENSIONS`, `TEXT_EXTENSIONS`, `DOCUMENT_ACCEPT`, `isIgnoredPath`, `selectFolderFiles`, `documentExtension`, `isReadableName`, `DocumentErrorCode` (missing, unreadable, empty, too_long, folder_full, ignored, failed). Do not touch. |
| WT/src/server/documents/documents.ts | (read l.160-345) | `addDocument`, `listDocuments`, `deleteDocument`, `shareDocuments`, `deleteFolder`. |

### Team
| File | Lines | Role |
|---|---|---|
| WT/src/app/(app)/equipe/page.tsx | 45 | Server page. Reads `?personne=<memberId>`. Loads `listReports(ctx)`, `listMembers(ctx)`, `managersSeeAll(ctx)`; `selected` = the matching report else `reports[0]` else null; `activity = reportActivity(ctx, selected)` (max 12 source hits). Builds `chart` from non-former members (`id,name,managerId,department,job,self`). Title from `team.title`. |
| WT/src/app/(app)/equipe/actions.ts | 28 | `setFollowedAction(memberId, families)`, `setSeeAllAction(memberId, on)`; both `revalidatePath('/equipe')`, return `{ok}`. |
| WT/src/components/verre/equipe/index.tsx | 267 | `Team` (l.33), `People` (l.78, list of reports as links to `/equipe?personne=<id>`, indented 14 px per depth, caption "Reports to {name}" when depth>1), `Person` (l.122, follow chips + switch + activity), `ActivityItem` (l.251). |
| WT/src/components/verre/equipe/org-chart.tsx | 175 | `orgView(members, focusId)` (pure, exported, tested), `OrgChart` (l.53), `Box` (l.122). |
| WT/src/components/verre/equipe/org-chart.test.ts | 48 | Tests `orgView`. KEEP; keep `orgView` signature. |
| WT/src/app/globals.css | l.750-800+ | `.org-tree` CSS (boxes and lines), uses Verre tokens (`--line-strong`). Must be rewritten with Papier tokens (`--line`, `--ink-2`). |
| WT/src/server/auth/organisation.ts | l.20-160 | `Report` type (memberId, name, email, managerId, managerName, depth, families, voitTout), `listReports`, `reportActivity`, `setFollowed`, `setSeeAll`, `managersSeeAll`, `setManagersSeeAll`, `setManager`. |

### Where members are invited and managed: it is SETTINGS today
| File | Lines | Role |
|---|---|---|
| WT/src/app/(app)/reglages/page.tsx | 208 | Loads `listMembers`, `canInvite`, `listGroups`, `managersSeeAll`, `directoryState`, `listDepotsEquipe`, `readSsoSetup`, `deletionInfo`. The `equipe` panel (l.136-155) renders MembersSection, DirectorySection, ManagersSection, GroupsSection, DepotsEquipeSection, SsoSection, DeleteOrganizationSection. |
| WT/src/app/(app)/reglages/actions.ts | 550 | Actions for members (see 2.2). |
| WT/src/components/verre/reglages/members.tsx | 392 | `MembersSection`, `MemberItem` (manager Select, role Select, Remove AlertDialog, pencil `EditPlacement`), `CreateInvitationContent` (two-step dialog), `EditPlacementForm`, `roleLabel`. |
| WT/src/components/verre/onboarding/invite-form.tsx | 89 | `InviteForm({onCreated, secondaryAction})`: name (optional, "To tell links apart"), PlacementFields (department, job, seniority, all three required), submit "Create link". Shared with onboarding step "Collaborateurs": do not fork it, restyle it once. |
| WT/src/components/verre/onboarding/placement-fields.tsx | (not opened) | `PlacementFields`, `usePlacementForm`: lists of departments/jobs/seniority (messages `onboarding.departments/jobs/seniority`). |
| WT/src/components/verre/reglages/groups.tsx | 212 | `GroupsSection`, `GroupDialog` (name + member checkboxes, create or edit). |
| WT/src/components/verre/reglages/managers.tsx | 50 | `ManagersSection`: switch "Managers read what's private to the people under them" (`setManagersSeeAllAction`). |
| WT/src/components/verre/reglages/annuaire.tsx | 118 | `DirectorySection`: "Import the org chart" from Google Workspace / Microsoft 365, preview of changes, Apply. |
| WT/src/components/verre/reglages/depots-equipe.tsx, sso.tsx, delete-account.tsx | | NOT mine (Settings > Workspace in the prototype: SSO l.294-356, delete workspace l.358). Listed so nobody drops them: they sit in the same `equipe` panel today. |
| WT/src/server/auth/members.ts | | `MemberRow`, `canInvite`, `listMembers`, `setMemberRole`, `removeMember`, `createInvitationLink`, `setMemberPlacement`. |
| WT/src/server/auth/groupes.ts | | `Groupe`, `listGroups` (readable by every member), `saveGroup`, `deleteGroup`, `setGroupMembers`. |

### Admin
| File | Lines | Role |
|---|---|---|
| WT/src/app/(app)/admin/page.tsx | 14 | `getSession()`; if no session or `!isAdmin(email)` (LEON_ADMINS env) -> `notFound()` (404, deliberately not a 403). Renders `<AdminDashboard stats={await adminStats()} now>`. |
| WT/src/components/verre/admin/index.tsx | 338 | `AdminDashboard`, `Tile`, `DailyBars` (SVG bars, native `<title>` hover per day), `Breakdown`, `Table`. French only, hard-coded, fr-FR number formats, USD costs. |
| WT/src/server/admin/stats.ts | | `adminStats()`, `isAdmin()`, type `AdminStats`. |

No Hono route is involved in these three screens: everything is server components plus server actions (`'use server'`). The Hono API (src/server/api/*) is for ingest, MCP, CLI, OAuth; no change needed there for this area.

Prototype files read: PR/documents.html (177), PR/documents.js (159), PR/team.html (302), PR/team.js (180), PR/lists.css (shared, Documents and Team), PR/NOTES.md (guide), PR/settings.js (to see what Settings takes), ../js/app-data.js (data shapes).

---------------------------------------------------------------------------------------------------------------

## 2. What the server and the actions do today (the contract the new UI must keep)

### 2.1 Documents actions: WT/src/app/(app)/documents/actions.ts
| Action | Line | Input | Output | Notes |
|---|---|---|---|---|
| `uploadDocumentAction(prev, formData)` | 43 | form fields `file`, `partage` | `{error: DocumentErrorCode\|null, partial}` | For `useActionState`; revalidates `/documents`. Used by the single-file `<form>`. |
| `addFileAction(formData)` | 69 | `file`, `partage`, optional `folderId`+`folderName`+`path` (all three or none; zod `folderFields` l.57) | same | Called file by file (a folder sends up to 200). Does NOT revalidate: the page calls `router.refresh()` once at the end. A network error does not stop the next files. |
| `deleteDocumentAction(formData)` | 86 | `id` (uuid) | void | Silent on failure. Server rule (`supprimer_document`, migration 0034/0042): author, or an admin for a FORMER member's document. |
| `deleteFolderAction(formData)` | 94 | `id` = folderId | void | Author only, deletes the author's files of that folder. An admin cannot delete a former member's folder in one go (only file by file). |
| `shareDocumentAction(target, partage)` | 103 | `{id}` or `{folderId}`, `partage` | `{ok}` | Author only (`partager_document`, 0055). `ok:false` when nothing changed. |

`partage` values: `'equipe'`, `'moi'`, or a group uuid (`PartageSchema`, src/lib/documents.ts:8). ACL: `aclOf`.

Rules the UI enforces and the server re-checks:
- max 10 MB per file (`DOCUMENT_MAX_BYTES`), 200 files per upload (`FOLDER_MAX_FILES`, one cap for folders + single files together), readable formats only (`DOCUMENT_ACCEPT`), hidden/dependency/lock/secret files skipped in folders (`selectFolderFiles`, counted as "skipped").
- Re-sending a folder with the same name by the same author replaces the old one (addDocument, l.~200). Not visible in UI; keep.
- A group deleted meanwhile -> `DocumentError('failed','groupe')`.

### 2.2 Settings actions that manage members (WT/src/app/(app)/reglages/actions.ts). They stay where they are; the new Team screen imports them.
| Action | Line | Does | Revalidates |
|---|---|---|---|
| `createInvitationAction({name, department, job, seniority})` | 104 | Returns `{url, expiresAt}` (link shown once; token only hashed in DB) or `{errors}` (fields name/department/job/seniority/form; `permission` for non-admins) | none |
| `setMemberPlacementAction(memberId, placement)` | 117 | Department/job/seniority of a member; admin only | `/reglages` (ADD `/equipe`) |
| `setManagerAction(memberId, managerId\|null)` | 203 | `{result: 'ok'\|'refuse'\|'boucle'\|'proprietaire'}`; messages `managerLoop`, `managerOwner`, `memberFailed` | `/reglages`, `/equipe` |
| `setMemberRoleAction(memberId, 'admin'\|'member')` | 254 | Never touches an owner | `/reglages` (ADD `/equipe`) |
| `removeMemberAction(memberId)` | 265 | Not oneself, not an owner; session, tokens, connections stop at the next request; what they brought stays | `/reglages`, `/equipe` |
| `saveGroupAction(id\|null, nom, membres[])` | 167 | Create/rename + set members; errors `groupInvalid`, `groupNameTaken`, `groupRefused` (strings already translated, returned as `{error}`) | `/reglages`, `/documents` (ADD `/equipe`) |
| `deleteGroupAction(id)` | 185 | `{ok}` | `/reglages`, `/documents` |
| `setManagersSeeAllAction(on)` | 244 | Org policy: managers read the private items of their reports (migration 0057) | `/reglages`, `/equipe` |
| `startDirectoryImportAction(formData{provider})` | 218 | Redirects to Google/Microsoft; on failure `redirect('/reglages?annuaire=refus#equipe')` | |
| `applyDirectoryImportAction(provider)` | 228 | `{count}` or `{error: 'droits'\|'injoignable'\|'adresse'\|'refus'}` | `/reglages`, `/equipe` |

IMPORTANT: when the screens move from /reglages to /equipe, every action above that revalidates `/reglages` only must also revalidate `/equipe` (and the reverse). Otherwise the Team grid is stale after a role change. Add the paths, do not rename.

### 2.3 Rights (who sees what): keep exactly
- `canInvite(ctx)` = owner or admin (roles are comma lists in Better Auth: `owner`, `admin`, `member`).
- `listMembers`: department/job/seniority are `null` for non-admin readers (even on their own row); former members have `email: ''` and `former: true`.
- Any member reads `listGroups`.
- Documents: a private document ('moi') only appears for its author (RLS); the page never needs to hide it.
- `/equipe` content is server-filtered: `listReports` only returns people under the reader.

---------------------------------------------------------------------------------------------------------------

## 3. PROPOSED COMPOSITION

### 3.1 DOCUMENTS (route `/documents`, files `src/app/(app)/documents/page.tsx` + `src/components/verre/documents/index.tsx`)

Page = prototype documents.html: `.page` > `.head` (h1 "Documents" + ink pill "Add a document") > `.sec` "Files" with flag `.tag c3` (count of tiles) > `ul.grid.grid--3` of tiles (52px). No subtitle (drop `documents.subtitle`, `addSection`, `teamSection`, `teamDescription`, `formats`, `dropHint` from the screen; see "text that moves").

**Tile for one document** (kit `tile`, picture 28px):
- picture: the format logo. Real `LOGOS` (index.tsx:59) maps pdf, docx/rtf -> word, xlsx/csv -> excel, pptx, odt -> writer, ods -> calc. The prototype has only pdf, word, excel, powerpoint, text. Use the kit's 4 logos + the `logo--text` document icon (lists.css:7) for everything else, including odt/ods (the writer.svg and calc.svg files exist in /public/logos today; keep them if present in the new `shared/logos`, otherwise fall back to `logo--text`).
- name: title without its extension (prototype `base()`), one name only. Folder files never appear as tiles (they are inside the folder tile).
- one quiet caption: `Team` (partage `equipe`) / `Only you` (`moi`) / the group's name (partage = uuid; label from `usePartageLabel`, unknown group -> `documents.shareGroup` "A group"). Nothing else: no date, no author, no size. Wrong state only: nothing today (see G2 for "Reading…").
- `hl` (highlighter stroke when pointed) by kind: pdf 1, excel 2, word 3, powerpoint 4, text 3 (documents.js:11).
- the whole tile is a `<button>` that opens the document panel. NO share select, NO trash button on the tile (today's row has both: they move into the panel).

**Tile for one folder** (new, not in the prototype): same tile, picture = a folder icon (kit has no `#i-folder`; add one inline svg, 1.6 stroke), name = folder name, caption = the folder's share (taken from the most recent file, `latest.partage`, as FolderItem does at index.tsx:375). NO file count on the tile (today's "n files" goes into the panel). Rows are built exactly as `groupDocuments` (index.tsx:462): key = `ownerUserId:folderId`; a folderId reused by another member stays a separate folder. Keep that function, move its output into tiles.

**Section tools** (in `.sec__head`, `.sec__tools`):
- Search field (new, because real workspaces have hundreds of files; the prototype has 7): filters tiles by title; a folder matches on its name or any inner path. Same pattern as team.js `filter`. Empty result: `.empty` "No document matches".
- A "Visible to" select (see "Add" below). Label `documents.shareWith`, default "Team".
- A `.btn.btn--line.btn--sm` "Add a folder" (`documents.chooseFolder`). The ink pill stays "Add a document" alone.

**Add** (replaces `UploadForm`, index.tsx:91-289):
- Ink pill `#add-doc` = clicks a hidden `<input type="file" multiple accept={DOCUMENT_ACCEPT}>`. "Add a folder" clicks the hidden `webkitdirectory` input (`{...{ webkitdirectory: '' }}`, index.tsx:256). A whole-page drop (prototype `.drop` overlay "Drop to add it to Leon") takes files AND folders through `readDropped`, using the same Visible-to value.
- WHY the select must exist before the file is sent: today the share is chosen before sending. The prototype adds everything as Team and lets the author change it afterwards; in the real product that would index a private file for the whole team first. Do not copy that. Keep `partage` chosen first; default "Team" (what the product does today).
- The sending loop is the real one, unchanged: `send()` (index.tsx:118-181): `readPicked`/`readDropped` -> `selectFolderFiles` per folder and for singles -> refusal if `uploads.length > FOLDER_MAX_FILES` (`tooManyFiles`) or 0 (`noReadableFiles`) -> for each file `addFileAction(FormData{file, partage, folderId?, folderName?, path?})` (`.catch(() => null)` counts as failed) -> counts `{added, partial, skipped, failed}` -> report line -> `router.refresh()` once -> `finally` clears `progress`. Single file selected by the pill goes the same way through `addFileAction` (drop the `useActionState` + `uploadDocumentAction` path; keep the action exported, its test and the `tooBig` pre-check logic: refuse locally if `file.size > DOCUMENT_MAX_BYTES`, because Next refuses oversize bodies before the action runs and shows the error page).
- Feedback surface = the prototype's `.refused` strip above the grid (role="alert") generalised to three tones (error = danger tokens as in lists.css:10-14; warning; success/neutral = `--line` + `--ink`). Messages, all existing keys:
  - progress `documents.sending` "Sending: {done} / {total}" (role="status"; neutral)
  - report `documents.report.added|partial|skipped|failed` joined by " · " (success, or warning if failed > 0)
  - refusals: `tooManyFiles`, `noReadableFiles`, `errors.failed`, and `errors.<code>` for `unreadable|empty|too_long|folder_full|ignored|missing|failed`. The formats sentence (`documents.formats`) lives ONLY inside the "unreadable" refusal, as the prototype does ("Leon reads PDF, Word, ... 10 MB max"); no standing helper text. Dismissable with an X (`aria-label` Dismiss), focus back to the pill.
  - partial: `documents.partial` "Document added, but only partly indexed: it is too large to be read in full." (warning)
- Disabled while sending: the pill, "Add a folder", the select, the drop. Pill shows `Leon.busy` style ("Sending…"). A dropped file during sending is ignored (`if (sending) return`, index.tsx:192).
- Live region `<p class="vh" role="status" id="doc-live">` announces "{n} files added".

**Panel of one document** (kit panel, 520px; replaces DocumentItem's row, index.tsx:292-357):
- head: logo (or `logo--text` icon), title = the full title (with extension).
- facts (kit `facts`):
  - Added by: `ownerName` with initials; `settings.formerMember` "{name} (former member)" when `ownerFormer`; "You" when `ownerUserId === viewerId`.
  - Added: `createdAt` through `formatRelative` or a date format (`@/lib/format`).
  - NO "Size" row (real data has no size; do not invent it, see G1).
  - Visible to: if the viewer is the author -> a `<select class="field">` with `usePartageOptions(groups)` (Whole team, Only me, then each group), saved at once through `shareDocumentAction({id}, partage)`; on `ok` toast `documents.shareSaved` "Sharing saved.", else `documents.shareFailed`; the control is disabled while pending (ShareSelect already does this: reuse `ShareSelect`'s logic, restyled as the prototype `select.field`). The quiet line under it (`SAY`, documents.js:107) must stay true: team -> "Everyone in {workspace} can find it in search and in answers."; moi -> "Only you can find it. It isn't shared with the team."; group -> "Only the members of {group} can find it." (new string; true per groupes.tsx:35). If the viewer is not the author -> the value as plain text (`usePartageLabel`), no select.
  - Wording alignment: the prototype says "Only you"; the real option is `documents.shareMe` "Only me". In a SELECT the author reads "Only you"? Keep the product's `shareTeam`/`shareMe` strings in the select and use the prototype's captions "Team" / "Only you" on tiles. Add two keys (`documents.captionTeam`, `documents.captionMe`) rather than reuse `shareTeam`/`shareMe`; do not duplicate in code.
- foot: `Delete` (btn--quiet, `data-act="ask-delete"`) only when `owner || (admin && document.ownerFormer)` (exact condition at index.tsx:341), and `Done` (btn--line push). Confirmation (kit `panel.confirm`): title "Delete {title}?", text from the real effect: "It leaves Leon: search and answers stop using it, for everyone. This can't be undone." (true: passages, vectors and runs go with it; threads that linked it lose the link), yes "Delete", no "Keep it". On yes: `deleteDocumentAction(FormData{id})`. The action returns void and hides failures: change it to return `{ok}` (`deleteDocument` already returns a boolean) so the panel can toast the failure; keep revalidate. Then close the panel and move focus to the next tile (documents.js:141).
- Non-author, non-admin: details only, no foot except Done.

**Panel of one folder** (new):
- head: folder icon, title = folder name. facts: Added by (latest file's author), Added (latest), Visible to (select, only for the author; saved through `shareDocumentAction({folderId}, partage)`, applies to every file of the folder: say so in the quiet line "Applies to every file in this folder."), Files: a list of rows built like `FolderItem`'s inner list (index.tsx:377-382): path without `${folder.name}/` prefix, sorted `localeCompare` by locale; each row = format logo 20px + path; clicking a row opens THAT document's panel (so delete of a single file, and the admin's per-file delete for a former member's folder, stay reachable). Panel `back` returns focus to the folder tile.
- foot: `Delete folder` (btn--quiet) only when `latest.ownerUserId === viewerId` (index.tsx:383,441). Confirm: title "Delete {name}?" text "Every file of this folder leaves Leon, for everyone. This can't be undone." yes "Delete folder". Calls `deleteFolderAction(FormData{id: folderId})`; same change to return `{ok}`.
- A former member's folder: no folder delete (rule above); the files inside can be opened and deleted one by one by an admin.

**Empty state**: no documents -> `.empty` (prototype documents.html:143): h3 `documents.emptyTitle` ("No documents yet." keep the product's text, the prototype's "No documents yet" without period is the same), p `emptyDescription` must change: it says "Add a file above" and nothing is above any more -> "Add a file and Leon reads it." (prototype). `?state=empty` is a prototype device only: do not port.

**Deep link**: `?open=<document id>` (the prototype uses the file name; the real key is the id). Page reads it in the server component (or `useSearchParams`) and opens the panel on load. This is how a source "Open in Documents" (Chat/Home builders) and the command bar reach a file. Folder: `?open=<folderId>`. Agree with the shell builder: `Leon.go('doc', id)` -> `/documents?open=<id>`.

**Loading / error**: no loading UI today beyond Next's `loading.tsx` (src/app/(app)/loading.tsx, shell builder). No page-level error state besides `error.tsx`.

**Responsive**: grid--3 at 1512, one column under 600 (kit). The drop overlay padding changes under 900 (lists.css:31).

### 3.2 TEAM (route `/equipe`; files `src/app/(app)/equipe/page.tsx`, `src/components/verre/equipe/index.tsx`, `org-chart.tsx`, + new files for the members views)

The product's nav label for this route stays `team`. Page = prototype team.html: `.head` h1 "Team" + ink pill "Invite" (admins/owners only: `canInvite`; members see no pill) > one chips group `[People] [Org chart] [Groups]` > the view. Chips are the kit's single-select group (`role="group" data-chips`, `leon:chip`); keep the pressed view in the URL (`?vue=gens|organigramme|groupes`, default People) so that reload and the Settings redirect work. The "Groups" chip appears only for `canInvite`.

The page server component must now load for everyone: `listMembers`, `listReports`, `managersSeeAll`, `listGroups`; and for admins also `canInvite` (rename `admin`), `directoryState(ctx, annuaire, error)` (only when `canInvite`, as reglages/page.tsx:82), because the view needs them. All of it is already server-side code; nothing new on the DB except G3.

#### View "People" (default) = prototype team.html
- Section "People" with flag = number of people shown; search field (`search`, `/` focuses, filter on name + job + email as team.js:13; email only searchable for admins since non-admin rows have no placement but DO have the email; fine).
- Tiles (52px): picture = initials on pastel (`Leon.av` equivalent: build an `Avatar` from `MemberRow.name`, tint stable per member id; one-word name -> two initials); name; ONE caption by priority: `You` (self) > `Former member` (former) > job label (`onboarding.jobs…` via `jobLabelKey(department, job)`, admins only because non-admins get `job = null`) > nothing. No email, no role, no date on a tile. Active members first (order of `listMembers`: createdAt), former members after.
- **Reports section** (the real "My team"): when `reports.length > 0`, a first section "Your team" (flag = reports.length) of CARDS (88px, picture 36px, `hl`), caption = "Reports to {managerName}" only for indirect reports (depth > 1), otherwise the job label / nothing. This is how the product's `People` list (equipe/index.tsx:78-120) survives, indentation dropped (the tile grid has no tree). Both a card and a tile exist for the same person: acceptable (the rule is "card = what the person has or looks at first"). The same panel opens from both.
- When nobody reports to the reader: no section, no empty state (today's `team.emptyTitle/emptyDescription/emptyAction` "Nobody reports to you ... Open members" disappears with the old structure; the link `/reglages#membres` no longer exists).
- Click a tile or card -> person panel (below). `?personne=<memberId>` kept as a deep link (today's org chart and People list link to it; the command bar `Leon.go('person')` should send `/equipe?open=<email>` in the prototype, but real keys are member ids: choose ONE param, recommended `?personne=` because it already exists in links and in page.tsx:15; the shell builder must call it).
- Empty states: no search result -> `.empty` "Nobody matches “{q}”" + `Clear the search` button (team.js:39-43).

#### Person panel (kit panel) = prototype `openPerson` + the real admin and manager tools
head: initials avatar 44px, title = name, sub = job label (admins only).
Body facts, in this order, each only when it applies:
1. Email (`MemberRow.email`; absent for a former member).
2. Status: only for a former member -> "Former member". (Pending invitation: see G3.)
3. Role: admin viewer and target not owner, not self, not former -> `<select class="field">` Member / Administrator -> `setMemberRoleAction(memberId, role)`; toast `settings.roleSaved` / `memberFailed` (field error under the select as `Leon.fieldError`). Owner or self or former -> bold text via `roleLabel(role, {owner, admin, member})` (members.tsx:39). Non-admin viewers see the role text only.
4. Manager: admin viewer, not former -> select "Nobody" + every other ACTIVE member -> `setManagerAction(memberId, id|null)`; refusals shown under the field: `result 'boucle'` -> `settings.managerLoop`, `'proprietaire'` -> `managerOwner`, `'refuse'` -> `memberFailed`; success toast `managerSaved`. Non-admin viewers see "Reports to {manager name}" (`settings.reportsTo`) as text when they have one (members.tsx:201). Back the select to its saved value on refusal (team.js:96).
5. Placement (admin viewer only; hidden for others, the data is null anyway): Department, Role (job), Seniority rows from `placementOf` (members.tsx:66). The pencil dialog `EditPlacement` becomes inline: a small `btn--xs btn--line` "Edit" in the facts that swaps the three rows for `PlacementFields` and a Save/Cancel in the foot, or simpler and consistent with the prototype's "saved at once" selects: three selects saved together by one `Save` button in the panel foot (the placement action takes the 3 values at once and refuses partial ones: department+job+seniority required, `ready` check in EditPlacementForm l.356). Use `usePlacementForm` + `PlacementFields` + `setMemberPlacementAction`; copy for self: `settings.editOwnPlacementDescription` becomes the quiet line "Only an owner or an admin can change them." Do NOT add a sentence under the title.
6. Reports (people under this person): avatars + first names (team.js:64) from `members` filtered by `managerId`, active only.
Reader-is-the-manager block (only when the person is in `reports`, i.e. `reports.find(r => r.memberId === id)`): this is the real "My team" detail.
7. "Also see their private items": a `Switch` (kit gap, see G5) only when `seeAllAllowed` (org policy); optimistic with `useOptimistic(report.voitTout)`; `setSeeAllAction(memberId, on)`; on failure toast `team.followFailed`. The help text `team.seeAllHelp` ("You also read what {name} doesn't share: emails, AI conversations, private documents...") is a legal-grade statement: keep it as the `.hint` under the switch (NOT removable).
8. "What you follow": multi-select chips for `FOLLOW_FAMILIES` (src/lib/providers): labels `connections.family.<f>` plus `team.documents` for `documents`; `aria-pressed`, check icon when on; optimistic (`useOptimistic(report.families)`); the toggle rebuilds `next` in `FOLLOW_FAMILIES` order (index.tsx:150-153); `setFollowedAction(memberId, next)`; failure toast `followFailed`. Hint `team.followingHelp` ("What you tick changes nothing for anyone else.") kept as `.hint`. The kit chips are single-select, so this is a multi-toggle variant (G5).
9. "Recent activity": up to 12 `SourceHit`s from `reportActivity` (page passes `activity` for the SELECTED report only today; with a panel the activity must load on open, see risk R2). Each hit = a tile (52) with the tool logo for `hit.kind`, name = `hit.title` (or `team.untitled`), caption = nature (`NATURE_LABELS` fr / `NATURE_LABELS_EN` en; keep the locale switch of index.tsx:256), tile is a link to `hit.url` ("Opens {Tool} in the real product" in the prototype; in the real app it is a real link, `target` as `SourceLink` does). No snippet, no date on the tile (today's `SourceChip date` and 2-line snippet go: the snippet may live in the panel only if the tile is opened to a source panel; do not port). Below it a `.linkbtn` "Everything {name} wrote" -> `/?q=de:<email>` (today index.tsx:225; the Search/Home builder owns that destination, keep the `de:` operator).
   States: `families.length === 0` -> empty "You follow nothing from this person" (`nothingFollowed`; drop the help line or keep it as one `.hint`, "Tick a tool family above..."); `no hits` -> "Nothing recent in what you follow" (`nothingRecent`) + the real caveat `nothingRecentHelp` ("Leon links an item to a person by email address: what they write under another address does not show here.") as `.hint` (it explains a failure mode: keep). While saving a toggle the activity block is `aria-busy` and at 60 % opacity (index.tsx:222).
foot: `Remove from the workspace` (btn--quiet) only for an admin viewer when the target is not owner, not self, not former (members.tsx:221). Confirmation: title `settings.removeNamed` "Remove {name} from the workspace?", text `settings.removeDescription` (already true and used by the prototype), yes `settings.remove`, no `settings.cancel`; `removeMemberAction(memberId)`; toast `settings.memberRemoved`; error `memberFailed`. Then close, redraw, `Leon.shell.people(n)` equivalent: the sidebar's "{n} people" under the workspace name must follow (the shell builder exposes a hook; `workspace-menu.tsx`).
Self and owner: no change controls (role fixed, no Remove), the manager select still shows for admins (an owner's manager only changeable by an owner: server answer `proprietaire`).

#### Invite = ink pill "Invite" -> panel (replaces the Dialog in members.tsx:84-92 and `CreateInvitationContent`)
- Step 1 panel "Invite to {workspace}": `InviteForm` fields: Name (optional, hint `onboarding.teammates.nameHint` "To tell links apart"), Department, Role, Seniority (all three required), foot ink pill "Create the link" (`onboarding.teammates.createLink`) + Cancel. Disabled until the three are chosen (`ready`). Errors under fields from `inviteErrors` (messages `onboarding.inviteErrors`); `permission`/`form` errors as `Notice` error. Note the label clash: the prototype calls the JOB "Role" (team.js:126) while its person panel calls Member/Admin "Role". The product uses `settings.role` for Member/Admin and `onboarding.job` for the job; use the product's job label in the form and, in the facts, "Role" only for Member/Admin, to avoid two different "Role" in one panel.
- Step 2 (after `createInvitationAction`): same panel redrawn, done block `settings.inviteCreated`, the link in a readonly field, hint `settings.copyInvite` ("Copy it now; it won't be shown again."), facts: Works "Once, to create one account", Expires = `formatDate(expiresAt)` (the prototype's hard-coded "In 7 days" must be the real date from `expiresAt`; `INVITATION_DAYS = 7`), Sending "Send it yourself. Leon doesn't send emails." (`inviteCreatedDescription`). Foot: `Copy link` (ink-less? keep the prototype: `.btn` + `Done` line) -> CopyButton behaviour (`data-copy`). RULE kept from today: step 2 cannot be dismissed by Escape or a click outside (`dismissible={false}`, `onEscapeKeyDown` prevented, `hideClose`): the link disappears with the panel. The kit's panel closes on Escape/outside: the panel builder must support a "locked" mode for this step, or the link is lost. Only "Done" closes.
- Each opening starts a new session (`key={session}`), so a previous link never shows.

#### View "Org chart"
- Section tools (admin only): `Import from Google Workspace` / `Import from Microsoft 365` as `.btn--line .btn--sm`, one per `directory.providers` (`startDirectoryImportAction` is a `<form action>` with `name="provider" value=...`: keep it as a form, it ends in a redirect). Shown only when `directory.providers.length > 0`.
- Body: a single `.paper` with the chart. Boxes become 52px tiles (width ~200px): initials avatar + name + job caption (admins) or "You"; NO "n people" count on the box (today `team.chartReports`), NO department in the caption. Keep `orgView(members, focusId)` untouched (exported and tested). Interaction: click a box = recentre on that person (a `<button>`, as the real non-reachable boxes do); clicking the box that is already centred opens that person's panel (replaces today's link `/equipe?personne=` on reachable boxes). "Back to me" (`team.chartBack`) = `.btn--quiet .btn--xs` in the section head when `!focus.self`. Keep `keepInView` (scrollIntoView inline centre) and the scroll-inside-card behaviour. Lines: rewrite `.org-tree` (globals.css:754-800) with `--line` instead of `--line-strong`. `aria-current="true"` on the centred box.
- Admin only, above the chart: the `Managers read what's private to the people under them` switch (was ManagersSection) with the real hint `settings.managersLaw` ("In most countries, the law requires you to tell your employees. Leon doesn't do it for you.") kept as `.hint`. `setManagersSeeAllAction(on)`, optimistic, toast `managersFailed` on failure. Section title text `managersDescription` is dropped; its content is already in `team.seeAllHelp`.
- Directory import result (after the redirect back): a panel "Import the org chart" opened on load when `directory.plan` or `directory.error` exists: error -> `directoryRights|Unreachable|Address|Refused` (`nb()`), plan -> list "{name}: reports to {manager}" (`directoryUnder`/`directoryNone`, `directoryBefore`), kept/outside counts as one `.hint` (`directoryKept`, `directoryOutside`), foot ink-less `Apply ({count})` -> `applyDirectoryImportAction(provider)` (toast `directoryApplied` or the error text) and `Cancel` (`router.replace('/equipe?vue=organigramme')`); "Nothing to change" (`directoryNothing`) when empty and no Apply button. This panel is the one place a second ink button is acceptable (it is another surface, as in the prototype's panel foots).

#### View "Groups" (admin only)
- Section "Groups" with flag count; tiles (52): picture = group icon (`#i-team`), name = `nom` or the department's label (`onboarding.departments`), caption = `Department` for service groups (`settings.groupService`) and nothing for free groups; NO member count on the tile (`groupCount` goes to the panel).
- Section tools: `.btn--line .btn--sm` "New group" (`settings.groupNew`). (The ink pill of the view stays "Invite".)
- Panel of a group: free group -> Name field (max 80, error under it from `saveGroupAction`'s `{error}` string), Members checklist of ACTIVE members (checkbox list, max-height scroll, as GroupDialog l.185-199), foot `Save` (ink-less `.btn`) + `Delete` (quiet, confirm `groupDeleteTitle` / `groupDeleteDescription` "Documents shared with this group will only be visible to their author, or to the other groups they were shared with."). Service group -> read-only: name, "Department", the member list (from `g.membres` ids -> names), no foot but Done (real: `g.nom` null means no edit/delete, groups.tsx:86).
- Empty: `.empty` `groupsEmpty` + one short line `groupsEmptyHelp` ("Set each member's department in the member list, or create a group.") -> shorten to "Set each member's department, or create a group."
- Toasts: `groupSaved`, `groupDeleted`, `groupRefused`.

### 3.3 ADMIN (route `/admin`; `src/app/(app)/admin/page.tsx`, `src/components/verre/admin/index.tsx`)
Internal tool of the Leon team, not a customer screen, not in the nav, not in the prototype. Keep minimal and mechanical.
- Gate unchanged: no session or `!isAdmin(email)` (env LEON_ADMINS) -> `notFound()` (404, not 403). `getSession()` only (not `requireUserContext`): an admin with no organisation can still see it. `adminStats()` returns `AdminStats`; `now` passed from the page.
- Keep French and hard-coded (no i18n, as the file says: "il ne sert qu'à l'équipe"). Do not translate; do not add keys.
- Re-skin only: head `Admin` + NO subtitle/meta (drop "Ce qui se passe sur Leon..." and "Visible des seuls e-mails de LEON_ADMINS..."; move the "coûts et temps comptés depuis la mise en ligne" caveat into a `.hint` on the cost card since it changes how to read the numbers).
- `Tile` x8 -> cards (88px, kit card): name = label ("Utilisateurs"), caption = main value? The founder's no-count rule is for product objects; for a metric, the value IS the content. Use a `.paper` KPI block per metric (not a tile) with the value in `--fs-5` (28) and the detail line as quiet caption. Keep the 8 metrics and their detail strings exactly (utilisateurs, actifs, organisations, dépensé en API, connexions, temps passé, questions, coût par question incl. 2FA count) and fr-FR number formats.
- `DailyBars` x4 -> bars in `--ink`, baseline `--line`; keep the SVG, `role="img"`, aria-label, the native `<title>` hover per day, "total sur 30 jours". The class names `fill-accent`, `stroke-line`, `bg-glass-2`, `text-muted`, `text-fg` are Verre utilities: replace by Papier tokens.
- `Breakdown` x3 (par modèle, par usage, connecteurs) keep the proportional bar; empty strings kept ("Aucun appel sur 30 jours.", "Aucun connecteur branché."). The `Où va l'argent` description (calls, tokens, "appels ... sans tarif connu ne sont pas chiffrés") contains a real caveat: keep as `.hint`.
- `Table` x2 (50 organisations, derniers inscrits): a `.paper` with a plain table (these are long lists, NOT a tile grid), tokens only, `overflow-x:auto`, min-width 560. Columns and `seen()` ("jamais" for null) unchanged.
- States: only 404 and the "empty" strings above. No loading UI.

---------------------------------------------------------------------------------------------------------------

## 4. Prototype -> real (work table)

| Prototype piece | Real counterpart | Work |
|---|---|---|
| documents.html `.head` + `#add-doc` ink pill | `UploadForm` submit (index.tsx:238) | Pill opens hidden multi-file input; sends through `addFileAction`; remove `uploadDocumentAction` form path from the UI. |
| `.sec` "Files" + `.tag` count, `ul.grid--3` | `Section teamSection` + `GlassCard` + `<ul>` (index.tsx:500-527) | Replace by kit section; flag = tiles count. |
| documents.js `tile()` (name, caption Team/Only you, `hl`) | `DocumentItem` (index.tsx:292) | Caption from `partage` incl. group name; drop addedBy/date/ShareSelect/trash from the row. |
| (none) | `FolderItem` + `groupDocuments` | New folder tile + folder panel (3.1). |
| `.refused` strip (error only) | `Notice` for progress, report, errors, partial (index.tsx:263-286) | Tones success/warning/neutral/error in the same strip. |
| `.drop` overlay + window drag listeners (documents.js:96-100) | `UploadForm` drop handlers on the card (index.tsx:207-215) | Whole-page overlay; call `readDropped(entries)` with `webkitGetAsEntry()` (not `dataTransfer.files`, which loses folders). Prototype's `add(e.dataTransfer.files)` is NOT enough. |
| documents.js `kindOf` / `KIND` / `TEXT` (accept list) | `DOCUMENT_ACCEPT`, `isReadableName`, `LOGOS` | Do not port the prototype lists; import from `@/lib/documents`. NB prototype maps odt to word and ods to excel; real maps odt -> writer logo, ods -> calc logo. |
| `open(d)` panel: facts Added by / Added / Size / Visible to | `DocumentItem` + `ShareSelect` | Drop Size; Visible to has groups; author-only select. |
| `askDelete` panel.confirm | `<form action={deleteDocumentAction}>` + trash button (no confirm today) | Add confirmation; make action return `{ok}`. |
| `canDelete` (mine or admin of a left member) | `owner || (admin && ownerFormer)` (index.tsx:341) | Same rule. |
| documents.js read() "Reading…" 2.6 s timer | nothing | G2. |
| `?state=empty` | `documents.length === 0` -> `EmptyState` | Port the real condition, not the URL flag. |
| `L.openHere(name)` | none | `?open=<id>`. |
| team.html `.head` + `#invite` | `MembersSection actions` (members.tsx:82) | Pill gated by `canInvite`; moves to /equipe. |
| team.js `tile()` (av, name, caption You/Invited/Former/title) | `MemberItem` (members.tsx:132) + `People` (equipe/index.tsx:78) | One grid from `listMembers`; reports shown as cards on top. |
| team.js search `filter()` | none | Client filter (no server call). |
| team.js `openPerson` (Email, Status, Role select, Manager select, Reports) | `MemberItem` selects + `AlertDialog` Remove + `EditPlacement` | Same actions; add Placement rows and the reader-manager block. |
| team.js `askRemove` | `AlertDialog` (members.tsx:237) | Same strings (`removeNamed`, `removeDescription`). |
| team.js `above()` loop check and "Only an owner can change who is above an owner." | server `setManager` result `boucle` / `proprietaire` | Do NOT re-implement client-side; show the server's refusal (`managerLoop`, `managerOwner`). |
| team.js `openInvite`/`create`/`linkShown` | `CreateInvitationContent` + `InviteForm` + `createInvitationAction` | Real lists, real `expiresAt`, lock the panel on step 2. |
| team.js `openFresh` (invited person: Status, Department, Seniority) | no list of pending invitations | G3. |
| (none) | `OrgChart` + `orgView` | New view "Org chart" (3.2). |
| (none) | `Person` follow chips, seeAll switch, activity, `searchAll` | Inside the person panel for reports (3.2). |
| (none) | `GroupsSection` / `GroupDialog` | View "Groups". |
| (none) | `DirectorySection` | Org chart view tools + panel. |
| (none) | `ManagersSection` | Org chart view switch. |
| (none) | `AdminDashboard` | Re-skin (3.3). |

---------------------------------------------------------------------------------------------------------------

## 5. Every real feature and state that must survive (checklist for the reviewer)

Documents
- Upload: single file, many files, a chosen folder (webkitdirectory), a dropped folder or files (`readDropped`), 10 MB cap checked in the browser before sending, 200 files per upload, skipped files counted, hidden/dependency/lock/secret files left out, per-file sequential send with progress, one network error does not stop the rest, one `router.refresh()` at the end.
- Share chosen BEFORE sending: Whole team (default) / Only me / each group (`aclOf`).
- Report line: added / partial / skipped / failed counts; tone warning if any failed.
- Error codes: missing, unreadable, empty, too_long, folder_full, ignored, failed (all `documents.errors.*`, with the `nb()` non-breaking-space helper from `@/lib/verre`).
- Partial indexing notice (`documents.partial`).
- Author changes the share of one document, or of a whole folder; toast on success/failure; control disabled while saving.
- Non-author sees who can see it (`usePartageLabel`; a vanished group shows "A group").
- Delete: author; admin for a former member's file; folder delete author-only; folder of a former member only file by file.
- Folder shows its files with their path under the folder (root stripped), sorted by locale.
- Former-member author name: `settings.formerMember`. Untitled file: `documents.untitled`.
- Format logos by extension.
- Empty state. Accessibility: `aria-describedby` formats on the pickers (the formats text must stay reachable: keep it in the refusal AND as the `aria-describedby` target of the pickers, visually hidden if the founder will not see it, `vh`).
- `uploadDocumentAction` + `useActionState` path may be dropped from the UI, but keep the action (its test and external callers).

Team
- Org chart centred on the reader, recentring, "Back to me", scroll stays inside the card, a person without manager or whose manager left sits in the roots row (roots with a team first), former members excluded from the chart (page.tsx:26).
- Reports list incl. indirect ones with "Reports to {name}".
- Follow families per report + optimistic UI + failure toast; "documents" is a family.
- "Also see their private items" switch only if the org policy allows it; optimistic; failure toast; legal hint.
- Recent activity (<= 12), empty states (nothing followed / nothing recent + email-address caveat), "Everything {name} wrote" link (`de:` search).
- Members: invite link (name, department, job, seniority; one use; 7 days; shown once; not sendable by Leon), role change (never an owner), manager change (loop and owner refusals), placement edit (admin only; self via an admin), remove (not self, not owner), former members listed (no email), non-admins see names, roles and "Reports to" only.
- Groups: service groups read-only, free groups create/rename/members/delete, duplicate-name and non-admin refusals.
- Org policy switch for managers; directory import (Google/Microsoft): start (redirect), return with preview or error, apply with count, cancel.
- Sidebar people count follows invite/remove.

Admin
- 404 for non-admins, French strings, 8 KPI blocks, 4 daily series, cost by model/by use, connectors, 50 organisations, latest signups, "jamais" for no activity.

---------------------------------------------------------------------------------------------------------------

## 6. Real features the prototype does not show, and where each lives (founder's taste)

| Real feature | Lives in | Why |
|---|---|---|
| Visible to = a group (3rd kind) | Documents: select in the section tools (before sending) and select in the document/folder panel (after) | Same place as Team/Only you, one more option; no new rectangle. |
| Folders (upload, tile, share, delete) | Documents: a folder is a tile with a folder icon; its files, share and delete live in its panel | One name + one caption on the tile; detail in the panel. |
| Drop of a whole folder | Whole-page drop overlay | Same overlay as the prototype. |
| Groups (create/edit/delete, service groups) | Team > chip "Groups" (admin only), tiles + panel | Groups are people sets; Team is where people are. Removes a Settings section. |
| Org chart | Team > chip "Org chart" in a single `.paper` | A view, not a section above the grid (the grid stays first and fast). |
| "Also see their private items" | Person panel of a report, switch + legal hint | Detail of one person. |
| Follow families + recent activity + "Everything X wrote" | Person panel of a report | The old right-hand column of /equipe is exactly "one person's detail": it is the panel. |
| Reports list (the old "My team" left column) | Cards at the top of People (only if the reader has reports) | "What the person looks at first": card size. |
| Managers-read-private policy | Org chart view, admin-only switch row | It governs who reads whom. |
| Directory import | Org chart view tools + preview panel | It writes the chart. |
| Remove member, role, manager, placement | Person panel | Prototype already does role/manager/remove; placement added as facts. |
| Former members | Tiles with caption "Former member" at the end of People; panel shows name only | Prototype already has them. |
| Admin dashboard | /admin, re-skinned, no nav entry | Internal. |
| Team repositories (GitHub), company SSO, delete workspace | NOT here: Settings > Workspace (settings builder). They live today in the same `equipe` tab; the settings builder must take them. | |

Text that disappears from screens (no sentence explains a screen): `documents.subtitle`, `addSection`, `teamSection`, `teamDescription`, `dropHint`, `formats` as standing text (kept only in the refusal and `aria-describedby`); `team.subtitle`; `settings.membersDescription` ("By default, everyone can see what Leon reads in team tools. Assistant conversations, email, Google Drive, and Slack messages stay with their owner.") is a true privacy statement: it must not just vanish. Move it to the person panel's "Visible to"-style hint or to the invite panel step 1 as a `.hint`, decision for the founder; flagged in risk R6. `settings.groupsDescription`, `directoryDescription`, `directoryHelp` ("You need a directory administrator account...") -> `.hint` inside the import panel (technical prerequisite). Keep the messages files complete in both en.json and fr.json: only ADD keys, never remove in this port (other screens or tests may still use them).

---------------------------------------------------------------------------------------------------------------

## 7. New i18n keys to add (both en.json and fr.json)
documents: `captionTeam` "Team", `captionMe` "Only you", `sharedGroupSays` "Only the members of {group} can find it.", `sharedTeamSays`, `sharedMeSays`, `folderShareSays` "Applies to every file in this folder.", `files` (folder panel list label), `deleteConfirmTitle` "Delete {title}?", `deleteConfirmText`, `deleteFolderConfirmText`, `keep` "Keep it", `noMatch` "No document matches", `dismiss`, `emptyDescription` rewritten (existing key, new text), `reading` only if G2 is built.
team: `views.people|chart|groups`, `yourTeam`, `searchPeople`, `nobodyMatches` "Nobody matches “{q}”", `clearSearch`, `former` "Former member", `invited` "Invited" (if G3), `showInChart`/none, `groupMembers`, `managersSeeAllLabel` reuse `settings.managersToggle`.
Reuse unchanged: all `documents.errors.*`, `documents.report.*`, `documents.sending`, `settings.*` listed in section 2.2/3.2, `onboarding.teammates.*`, `onboarding.inviteErrors`, `connections.family.*`.

---------------------------------------------------------------------------------------------------------------

## 8. GAPS

In the prototype (missing vs product)
- G-a Folders, groups, folder upload button, folder delete, share per folder (documents).
- G-b Placement (department/job/seniority) editing; group management; org chart; reports/follow/private/activity; directory import; managers policy (team).
- G-c Search in Documents; confirmation texts for folders; a Placement view for non-admins (none, correct).
- G-d The prototype's person panel has no "Not allowed" state for non-admin viewers: real non-admins see no selects. Prototype assumes Julie = Admin. Build the read-only variant (role text, "Reports to", no foot).
- G-e No state for "invite refused" (non-admin / `permission`) and for server failures; use `Notice` error in the panel.

In the product (missing vs prototype)
- G1 **Size** of a document: not stored. Prototype shows it. Do NOT show it unless the builder adds `size` to the source metadata at upload time (`addDocument` has `file.size`; add `size` to `metadata`, expose in `listDocuments`). Existing documents would have none -> show the row only when present. Low value; recommend skipping.
- G2 **"Reading…" state** (highlighter under the caption, "Searchable once read", `statusrow` in the panel): the product has `ingest_runs.status` (`queued|running|done|failed`, src/server/db/schema/memory.ts:55-71) but `listDocuments` does not join it. To build it: join the latest ingest run per source in `listDocuments` and return `indexing: 'queued'|'running'|'done'|'failed'`; show "Reading…" for queued/running, "Couldn't be read" (danger caption, the only legit wrong-state caption) for failed; refresh with `router.refresh()` on an interval while any is pending (bounded, e.g. every 3 s up to 2 min). Without it, show nothing (do not fake a timer as the prototype does).
- G3 **Pending invitations** ("Invited" tiles, the new person appears at once, `openFresh` panel): the product stores them in `invitation_links` (src/server/db/schema/invitation-links.ts) but has no read function and no revoke; `members.ts` only hashes tokens. To build the "Invited" tile: add `listInvitations(ctx)` (admin only; unused and unexpired; name or job as title, department, seniority, `expiresAt`) and optionally `revokeInvitation(ctx, id)`. Link cannot be shown again (hash only): consistent with "won't be shown again". Until built: after "Create the link" the panel shows the link; no tile appears. If this is skipped the prototype's "the person joins the grid as Invited" is not true; say so to the founder.
- G4 **Directory import return URL** is hard-coded to `/reglages?annuaire=…#equipe` (src/server/auth/annuaire.ts:287-288, reglages/actions.ts:224, annuaire.tsx:39): moving the import to Team needs those three places to point to `/equipe?vue=organigramme&annuaire=…`, plus `directoryState(ctx, annuaire, error)` called from the equipe page. If not moved, the import button must stay in Settings.
- G5 **Kit pieces missing** (write in each screen's own sheet with tokens, say so in the report): a Switch; a multi-select chip (aria-pressed toggle, several on); a checkbox list; an Avatar for real members (prototype `Leon.av`); a folder icon; the `.refused` strip with non-error tones; a panel "locked" mode (invite link step); a `Select` styled as `select.field` inside `facts`.
- G6 Org chart has no prototype look: boxes as 52px tiles, lines in `--line`.
- G7 Admin has no prototype at all.
- G8 The prototype's `?state=empty`, `Leon.WORK` timers, fake links, `A.members` (38) and the "Fictional example" `.fict` line: NOT ported. The `.fict` foot must be removed from real pages.

---------------------------------------------------------------------------------------------------------------

## 9. RISKS
- R1 Moving Settings > Team to /equipe means TWO builders touch `src/app/(app)/reglages/page.tsx` (equipe panel l.136-155) and `reglages/actions.ts` (revalidate paths). Agree: Team builder removes MembersSection/GroupsSection/ManagersSection/DirectorySection from the page and from `settings-tabs` (and fixes `settings-tabs.test.ts`, `page.test.ts` in reglages); Settings builder keeps DepotsEquipe, Sso, DeleteOrganization in Workspace. If either side waits for the other, members can no longer be invited (nobody has the screen). Do it in one PR or in order: (1) add Team views, (2) remove from Settings.
- R2 The old page loads activity for ONE selected report (`?personne=`). A panel opened client-side from a grid has no activity unless fetched. Options: keep `?personne=<id>` as the panel's URL state (server component re-renders with `activity`; `scroll={false}` as today) or add a server action `loadReportActivity(memberId)` wrapping `reportActivity`. Prefer the URL (works with deep links, reload, command bar). Then opening a person = navigation: the panel must not close/flash on the RSC refresh (kit panel is client state; key it by id).
- R3 `revalidatePath` coverage (section 2.2): without adding `/equipe` to `setMemberRoleAction`, `setMemberPlacementAction`, `saveGroupAction`, `deleteGroupAction` the new Team grid is stale after those edits.
- R4 Privacy regression if the share-before-send choice is dropped (section 3.1). Also a dropped folder via `dataTransfer.files` loses folder structure: use `webkitGetAsEntry` via `readDropped` (tested).
- R5 Invite link loss: step 2 must not be dismissible by Escape or an outside click (section 3.2). The kit panel closes on both.
- R6 Privacy copy: `settings.membersDescription`, `managersLaw`, `seeAllHelp`, `nothingRecentHelp`, `followingHelp` are not decoration: they tell admins/managers what is read and employees' legal exposure. "No sentence under the title" must not delete them; keep as `.hint` next to the control.
- R7 `listMembers` returns `email: ''` for former members and null placement for non-admins; the new tile search and captions must not crash on null (`jobLabelKey(department, job)` with nulls: guard as in org-chart `Box`).
- R8 Role strings are comma lists; use `m.role.split(',')` and `includes('owner'|'admin')` (members.tsx:145), never `===`.
- R9 `FOLLOW_FAMILIES` / `NATURE_LABELS` imports (`@/lib/providers`, `@/components/search/view-model`, `@/lib/labels`) belong to other areas (search/connections): do not move them while they are being ported; import only.
- R10 `Documents` is a client component importing server actions with `FormData`; keep Server Action boundaries (`'use server'` file unchanged). The 12 MB request limit still forces file-by-file uploads: do not batch several files in one FormData.
- R11 `partage.tsx` is imported by the Connections screen: keep exports (`GroupOption`, `usePartageOptions`, `usePartageLabel`, `ShareSelect`) while restyling; restyle `Select` inside it only through the shared `Select` from the kit.
- R12 Admin: hard-coded French, no `t()`; if a builder wires next-intl "for consistency" it will break the fr-FR number/date formats and add keys for nothing.
- R13 `.org-tree` CSS is in global `src/app/globals.css`; the Verre -> Papier switch of globals.css is another builder's job: coordinate so the chart lines keep working (they use `--line-strong`, which may not exist in the Papier tokens: use `--line`).
- R14 Tests to keep passing: `actions.test.ts` (documents), `dropped-files.test.ts`, `org-chart.test.ts`, `reglages/actions.test.ts`, `reglages/page.test.ts`, `settings-tabs.test.ts`, `layout.test.ts` (nav). Run `pnpm vitest` on those after each step; nothing here needs a DB migration unless G2/G3/G1 are built.
