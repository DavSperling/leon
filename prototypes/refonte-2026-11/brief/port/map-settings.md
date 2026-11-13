# Port map: Settings

Area: `/reglages` (the Settings screen). Read in full: `src/app/(app)/reglages/page.tsx`, `actions.ts`, every file of
`src/components/verre/reglages/`, the prototype `papier/app/settings.html|js|css`, and `NOTES.md`.
Paths below are relative to the worktree root. The prototype is `prototypes/refonte-2026-11/papier/app/` (called "proto").

Verdict in one line: the four chips (Profile, Security, Assistants, Workspace) are enough, no fifth group. But the
prototype only draws about a third of what the real screen does. Members and invitations leave Settings for Team. A
connected-assistant card kind, the browser extension, language, groups, team repositories, managers, org-chart import and
the delete-organisation owner/admin split have no prototype counterpart and are designed in section 6.

---------------------------------------------------------------------------------------------------------------------

## 0. How the real screen works today (so the port does not break it)

### Server page: `src/app/(app)/reglages/page.tsx` (208 lines), a server component
- Auth: `requireUserContext()` (line 54) gives `ctx` {userId, tenantId, principals}. No ctx = redirect (inside the helper).
- One `Promise.all` (55-79) reads 11 things: `listApiTokens(ctx)`, `listMembers(ctx)`, `canInvite(ctx)`, `getSession()`,
  `getMembership(ctx)`, `readAbout(ctx.userId)`, `deletionInfo(ctx)`, `listDepotsEquipe(ctx)`, `readSsoSetup(ctx)`,
  `listGroups(ctx)`, `managersSeeAll(ctx)`.
- Search params (45-49, 80-82): `?annuaire=google|microsoft|refus` and `?error=...` = the return from Google/Microsoft after
  "Import the org chart". `directory = mayInvite ? await directoryState(ctx, annuaire, error) : null` (82).
- Derived values:
  - `twoFactor = Boolean(session.user.twoFactorEnabled)` (83)
  - `live` = tokens not revoked (84-86)
  - `tokens` = `kind === 'manuel'` (89)
  - `computers` = `kind === 'ordinateur'`, name with `COMPUTER_TOKEN_PREFIX` ("Ordinateur : ") sliced off (90-92)
  - `assistants` = `kind === 'assistant'` AND `refreshExpiresAt > now` (95-97). An expired assistant is not listed.
  - `serverUrl = env.BETTER_AUTH_URL` (98)
  - `extensionPrompt = t('extensionPrompt', {serverUrl})` (101)
- Who sees what (the ONLY three roles in the real product):
  - member: everything under Profile, Security, Computers, Tokens, Assistants, Extension, and the read-only Members list.
  - admin = `canInvite(ctx)` true (owner OR admin role; `members.ts:53`): Members management, Org-chart import (only if
    `directory.providers.length > 0`, i.e. a provider is configured on the server), Managers, Groups, Team repositories, SSO.
  - owner = `deletion.isOwner` (line 151): Delete the organisation. A non-owner admin does NOT see it at all today.
- `generateMetadata` (41-43): title = `settings.title`.
- Loading: `src/app/(app)/loading.tsx`; errors: `src/app/(app)/error.tsx` (generic, shared by all app screens).
  The page has no empty state of its own; each section has its own.
- Layout shell: `max-w-[1008px]`, `PageHeader title subtitle` (106), then `SettingsTabs` (108-205).

### Tabs: `src/components/verre/reglages/settings-tabs.tsx` (111 lines), client
- `TABS = ['profil','securite','equipe','integrations']` (11); labels `settings.tabProfile|tabSecurity|tabTeam|tabIntegrations` (13-18);
  icons lucide UserRound, ShieldCheck, Users, Blocks (19).
- Anchor map `SECTIONS` (22-28): `membres` to equipe; `ordinateurs`, `jetons`, `assistants`, `extension` to integrations.
  Exported `tabOf(hash)` (29-32) is imported by `settings-tabs.test.ts` and `src/test/contracts/page-links.test.ts:3`.
- Active tab follows `location.hash` on mount and on `hashchange` (42-50); choosing a tab does `history.replaceState('#tab')` (52-55).
- Layout: Radix `Tabs`, vertical column (200px) when container is at least 720px wide, else horizontal row (`useMinWidth`). Motion `layoutId="settings-ink"`.
- Panels are passed as `panels: Record<Tab, ReactNode>` from the server page.
- `reglages.tsx` (23 lines): `INLINE` (code pill class), `SECTION` (spacing and `scroll-mt`) and `Step` (numbered list item) used by
  the extension block and every section. Verre-only: delete with the port.

### Server actions: `src/app/(app)/reglages/actions.ts` (550 lines, `'use server'`)
Every action starts with `requireUserContext()` (or `getSession` + redirect `/connexion` for the password ones). The
password-checking ones go through `passwordCheckAllowed()` (306-310) = shared login rate limit by e-mail; refusal = `security.tooManyAttempts`.

| Action (line) | Input | Result | Used by |
|---|---|---|---|
| `setLocaleAction` (49) | FormData `locale` fr or en | void; sets cookie `LOCALE_COOKIE` 1 year, `revalidatePath('/','layout')` | preferences.tsx AND `components/site/site-footer.tsx` AND `onboarding/about-step.tsx` (do NOT rename or move) |
| `createTokenAction` (65) | name (trim, 1-80) | `{token, hint}` or `{error: settings.invalidTokenName}`; revalidates | create-token.tsx |
| `revokeTokenAction` (193) | token uuid | `{ok}` (also used for computers and assistants) | tokens.tsx `TokenRow` |
| `createInvitationAction` (104) | placement + name | `{url, expiresAt}` or `{errors}` | `onboarding/invite-form.tsx` (shared with onboarding) and members.tsx |
| `setMemberPlacementAction` (117) | memberId, department/job/seniority | `{ok}` or `{errors}` | members.tsx `EditPlacementForm` |
| `setDepotEquipeAction` (142) | repo `owner/name`, checked | `{ok}` or `{error}` (depotInvalid, depotRefused, depotUnreadable, depotFailed) | depots-equipe.tsx |
| `saveGroupAction` (167) | id or null, name, member ids (max 500) | `{ok}` or `{error}` (groupInvalid, groupNameTaken, groupRefused); revalidates /reglages and /documents | groups.tsx |
| `deleteGroupAction` (185) | id | `{ok}`; revalidates /reglages and /documents | groups.tsx |
| `setManagerAction` (203) | memberId, managerId or null | `{result: 'ok'|'refuse'|'boucle'|'proprietaire'}`; revalidates /reglages and /equipe | members.tsx |
| `startDirectoryImportAction` (218) | FormData `provider` | never returns: `redirect()` to Google/Microsoft or `/reglages?annuaire=refus#equipe` | annuaire.tsx (plain `<form action>`) |
| `applyDirectoryImportAction` (228) | provider | `{count}` or `{error: DirectoryError|'refus'}` | annuaire.tsx |
| `setManagersSeeAllAction` (244) | boolean | `{ok}` | managers.tsx |
| `setMemberRoleAction` (254) | memberId, admin or member | `{ok}` | members.tsx |
| `removeMemberAction` (265) | memberId | `{ok}`; revalidates /reglages and /equipe | members.tsx |
| `updateProfileAction` (275) | name (trim 1-100) | `{ok}` or `{error: security.nameInvalid|profileFailed}`; calls `auth.api.updateUser` | security-settings.tsx `ProfileSettings` |
| `updateAboutAction` (290) | text (trim, max `ABOUT_MAX_CHARS` = 500; empty clears it) | `{ok}` or `{error: about.tooLong|failed}` | about.tsx |
| `changePasswordAction` (313) | current, new, confirmation | `{ok}` or `{error}`: `auth.passwordLength` (8-128), `auth.passwordsMismatch`, `security.tooManyAttempts`, `security.wrongPassword`; signs out the other sessions | PasswordSettings |
| `enableTotpAction` (334) | password | `{uri, backupCodes}` or `{error}` (tooManyAttempts, enableFailed, wrongPassword) | SecuritySettings |
| `verifyTotpSetupAction` (351) | 6-digit code | `{ok}` or `{error: codeInvalid|codeWrong}`; then `revokeOtherSessions`; revalidates | SecuritySettings |
| `disableTotpAction` (369) | password | `{ok}` or `{error}` | SecuritySettings |
| `regenerateBackupCodesAction` (384) | password | `{backupCodes}` or `{error}` | SecuritySettings |
| `deleteAccountAction` (484) | `{password, code, word, successorId|null, organizationToo}` | `{error}` only on failure; on success the server signs out and `redirect('/connexion?supprime=compte')` | delete-account.tsx |
| `deleteOrganizationAction` (495) | `{password, code, word}` | same; redirect `/connexion?supprime=organisation` | delete-account.tsx |
| `registerSsoAction` (515) | previous state, FormData (protocol, domain, issuer, clientId, clientSecret, entryPoint, metadata) | `SsoFormState {error?, values?}` (secret never returned; errors ssoInvalid, ssoRefused, ssoAlready, ssoDiscoveryFailed) | sso.tsx (`useActionState`) |
| `verifySsoDomainAction` (535) | none | `{ok}` | sso.tsx |
| `removeSsoAction` (542) | none | `{ok}` | sso.tsx |

Deletion flow detail: `confirmIdentity` (412-434) checks, in order: rate limit; the word equals `deleteAccount.word` ("DELETE" in
en, "SUPPRIMER" in fr); password via `auth.api.verifyPassword`; the 6-digit TOTP if two-factor is on (or the session vanished).
`runDeletion` (436-480) then deletes, forgets Pipedream users, sends the deletion e-mails (batched, 600 ms apart), clears cookies, redirects.
`DeletionRefused` reasons map to `deleteAccount.refused.successeur|autre_organisation|pas_proprietaire|situation`.
The contract test `page-links.test.ts:122-130` requires `actions.ts` to write exactly `?supprime=compte` and `?supprime=organisation`.

No API routes (Hono) are called from Settings. The only network is these server actions, plus two redirects: Google/Microsoft
(directory import) and the Better Auth OAuth/SSO endpoints the other side uses (`/api/auth/sso/...`, shown to copy). The
install command points to `<origin>/install` and docs to `/documentation` (public route, `(site)` group).

---------------------------------------------------------------------------------------------------------------------

## 1. Inventory of every real section: who sees it, every control, every state

Notation: [M] member, [A] admin (owner or admin), [O] owner only.

### 1.1 Profile (real tab `profil`)

**ProfileSettings** (`security-settings.tsx:232-308`), title/description `security.profileTitle|profileDescription` [M]
- Card: initials circle (`initialOf(name)`), name, and `security.membership` = "{role} · {organization} · since {date}" where
  role comes from `roleLabel(role, {owner, admin, member})` of `settings.owner|admin|member` and date is `formatDate`. Hidden if `membership` is null.
- Form: Name input (`security.name`, `name="name"`, required, maxLength 100, autoComplete name); Email (`security.email`) read-only; Save (`security.save`).
- States: pending (button loading); success `security.profileSaved` (live status); error from `updateProfileAction` (`nameInvalid` / `profileFailed`, live alert).
- Props from page: `name`, `email` from session, `membership` from `getMembership(ctx)` = `{role, organizationName, since}|null`.

**AboutSettings** (`about.tsx`, 64 lines) [M]
- Textarea (label `about.label`; placeholder `about.placeholder`; `maxLength = max` = 500 from server; `rows 4`, autoGrow), live counter "{n} / {max}".
- Description `about.description` ("Leon reads this when it prepares your morning briefing... Nothing else uses it."). Save (`about.save`).
- States: pending; success `about.saved`; errors `about.tooLong` ({max}) / `about.failed`. An empty text clears the field server-side.
- Page passes `about ?? ''` and `ABOUT_MAX_CHARS`.

**PreferencesSettings** (`preferences.tsx`, 51 lines) [M]; NO prototype counterpart
- Language select (`preferences.language`; options `preferences.french` "Français" / `preferences.english` "English"; `defaultValue = useLocale()`).
  On change: `setLocaleAction(FormData{locale})` in a transition. No Save button; applies at once (cookie + layout revalidation).
- Theme select (`preferences.theme`; `preferences.dark|light`): `useTheme()` from `src/lib/verre/theme.ts`, `setTheme()` writes `<html data-theme>`; no server call.
- Title/description `preferences.title|description` ("Language and appearance. Changes apply right away.").

**DeleteAccountSection** (`delete-account.tsx:145-171`, via `DeletionSection`/`DeletionContent`) [M]
- Red button titled `deleteAccount.title` opens a dialog (fresh `key` per opening so password, word and error never survive a close).
- Dialog: `deleteAccount.irreversible`; bullet list of effects; error notice; optional Successor select; Password; optional 6-digit code; typed word; Cancel; Delete permanently (`deleteAccount.confirm`, destructive, disabled until `ready`).
- `ready = word.trim() === t('word') && (!successors || successorId !== '')`.
- Branches driven by `DeletionInfo` (`server/auth/delete-account.ts:21-28`): `soleActiveMember`, `needsSuccessor`, `successors[]`, `organizationName`, `isOwner`, `activeMembers`.
  - sole active member: description `descriptionSole`; effects `effectLogin` + `effectSole {organization}`; sends `organizationToo: true` (the whole organisation is deleted)
  - otherwise: `description`; effects `effectLogin`, `effectTools`, `effectStays {organization}`
  - `needsSuccessor` (only owner with other active members): Successor `Select` (`deleteAccount.successor`, help `successorHelp`, placeholder `successorPlaceholder`) is required; `successorId` goes to the action
  - two-factor on: the 6-digit code field (`security.code`, numeric, maxLength 6, required) appears
- Success never returns: server redirects to `/connexion?supprime=compte`. Errors shown in the notice (`wrongWord`, `wrongCode`, `security.wrongPassword`, `tooManyAttempts`, `failed`, `refused.*`).

### 1.2 Security (real tab `securite`) [M]

Title/description `security.title|description`.

**PasswordSettings** (`security-settings.tsx:45-104`)
- Title `passwordTitle`, description `passwordDescription`. Form: Current (`currentPassword`), New (`newPassword`, help `passwordHint`, min 8, max 128, autoComplete new-password), Confirm (`confirmPassword`); button `changePassword`.
- States: pending; success `passwordChanged` (live status: other sessions signed out); error = ONE string (`auth.passwordLength`, `auth.passwordsMismatch`, `security.wrongPassword`, `security.tooManyAttempts`), shown above the form.

**SecuritySettings** (two-factor, `security-settings.tsx:106-228`, prop `enabled` = `twoFactor`)
- Title `twoFactorTitle`, description `twoFactorDescription`. One of four views:
  1. NOT enabled: text `notConfigured`; Password field (`security.password`); button `configure` runs `enableTotpAction(password)`.
  2. SETUP (after enable returns `{uri, backupCodes}`): `scan` text; `QRCodeSVG value=uri size=192` (qrcode.react, white tile); `<details>` `showKey` revealing the secret taken from `uri.searchParams.get('secret')`; `BackupCodes` (title `backupTitle`, `CopyButton label=copyCodes` copying codes joined by newline, help `backupHelp`, 2-column monospace list); form with 6-digit `code` (numeric, one-time-code, maxLength 6; spaces stripped before the call) and `activate`. Success: setup cleared, message `enabled`.
  3. CODES (after regenerate): `BackupCodes` + button `codesSaved` ("I've saved my codes") that clears them.
  4. ENABLED: text `enabledNotice`; Password field with help `regenerateHelp`; two submit buttons `regenerate` and `disable` using `formAction`.
- Messages: success `enabled|disabled`; errors `wrongPassword`, `enableFailed`, `codeInvalid`, `codeWrong`, `tooManyAttempts`.
- The "enabled" truth comes from the server prop after `revalidatePath('/reglages')`. Local state only covers SETUP and CODES.
- There is NO list of sessions, no "sign out everywhere" button, no passkeys. Sessions appear only as sentences ("your other sessions will be signed out") and server effects (`revokeOtherSessions` after change-password and after 2FA activation).

### 1.3 Integrations (real tab `integrations`): four sections, each with its own anchor [M]

**ComputersSection** (`computers.tsx`, 94 lines; anchor `#ordinateurs`; used by Connections cards and by "What leaves" in onboarding `code-tools-card.tsx:81`)
- Title `computersTitle`, description `computersDescription` (what a computer sends: sessions you accepted, text and actions, secrets masked).
- Only when `command !== null` (`installCommand()` returns null if the server address is refused: "nothing false to copy"):
  - Path 1 (only when `instructions !== null`): `claudeCode.withClaude` + `withClaudeLead` + `CopyButton label=claudeCode.ask copiedMessage=claudeCode.copied`. The value is `claudeCodeInstructions(t)` (localised, no token in it).
  - Path 2: `claudeCode.inTerminal` + `settings.computersLead` + `CodeLine code=command wrap` (`curl -fsSL <origin>/install | sh`).
  - Link `claudeCode.docs` to `/documentation` in a new tab (`common.newTab` for screen readers). `page-links.test.ts:80` asserts `computers.tsx` is one of exactly three files that link `/documentation`.
- List: `TokenRow` per computer (aria-label `yourComputers`); empty: `EmptyState` `noComputers`. Revoke confirm uses `computerRevokeDescription` (mentions `~/.leon/bin/leon login`), success `computerRevoked`.
- Focus management after a row leaves: neighbour row or first button of `#ordinateurs`.

**TokensSection** (`tokens.tsx`, 239 lines; anchor `#jetons`; Step 3 of the extension links to it) + `CreateTokenContent` (`create-token.tsx`, 90 lines) [M]
- Title `tokensTitle`, description `tokenDescription` ("A token grants access to what you can see. It is shown only once."). Button `createToken`.
- Create dialog (2 steps, mounted with a fresh `key` per opening): step 1 form "Device name" (`deviceName`; error from `createTokenAction`, `invalidTokenName`; button `createTokenSubmit`, `sending` while pending; Cancel). Step 2: token in a selectable `<code>`, warning `copyToken` ("Copy it now; it won't be shown again."), `CopyButton`, Done. Title `tokenCreated`, text `pasteToken`.
  - Step 2 is NOT dismissible: `hideClose`, `dismissible={false}`, Escape prevented. Only "Done" closes, so the secret is never lost by accident. This is a real safety feature.
  - The new token is already in the list (revalidate); the list hides it while the dialog is open (`created` hint) and shows it on close with a 3 s accent highlight (`fresh`).
- List rows (`TokenRow`, 131-239): name, `leon_…{hint}` (or `clientHost` for assistants), "created {date}", "used {relative}" or `neverUsed`, Revoke button + `AlertDialog` (`revokeNamed {name}`, description by kind, confirm `revoke`). `data-revoke={id}` is used for focus.
- Toasts: `tokenRevoked`, `tokenAlreadyRevoked` (when `ok` false), `revokeFailed` (throw). Pending row at 60 % opacity.
- Empty: `noTokens`. On mount, scrolls to `location.hash` target (arrival with an anchor).
- `REVOKE_WORDS` (120-124): per kind, `manuel` = tokenRevoked / revokeDescription; `ordinateur` = computerRevoked / computerRevokeDescription; `assistant` = assistantRevoked / assistantRevokeDescription.

**AssistantsSection** (`assistants.tsx`, 87 lines; anchor `#assistants`; Connections' `mcp_remember` card links here) [M]
- Title `assistantsTitle`, description `assistantsDescription`; lead `assistantsLead`; `CodeLine code=address` where `address = RESOURCE` (`server/oauth/metadata.ts`, `<origin>/api/mcp`). It MUST be exactly the metadata address (Claude compares it character for character).
- Five clients (12-24): `ClaudeAi` (claude.ai and Claude Desktop), `Chatgpt`, `ClaudeCode` (command `claude mcp add --transport http leon <addr>`), `Codex` (two commands: `codex mcp add leon --url <addr>`, `codex mcp login leon`), `Cursor` (Cursor and VS Code). Name `client<Id>Name`, how `client<Id>How`, commands in `CodeLine wrap`.
- List of connected assistants = `TokenRow` for `kind assistant` (shows `clientHost`; the access-token hint is not shown because it changes each hour); aria `yourAssistants`; empty `noAssistants`; revoke wording `assistantRevokeDescription`, toast `assistantRevoked`.

**Browser extension** (inline in `page.tsx:168-201`; anchor `#extension`; Connections' `claude_ai` and `chatgpt` cards link here) [M]
- Title `extensionTitle`, description `extensionDescription`; `CopyButton label=askClaude value=extensionPrompt` (the prompt contains the server URL and tells Claude to let the user paste the token himself).
- Three numbered steps (`Step`): 1 `step1` + `pnpm ext:build`; 2 `step2` + `chrome://extensions`, `developerMode`, "Load unpacked" (`loadUnpacked`), `chooseFolder` + `extension/.output/chrome-mv3`; 3 `step3` + link "a token created above" (`tokenCreatedAbove`) to `#jetons`.
- Then `serverAddress` + code `WXT_PUBLIC_LEON_URL` + `serverAddressEnd`, and `CodeLine code=serverUrl`.
- The prototype has NOTHING for this. It must survive.

### 1.4 Team (real tab `equipe`): admin-only blocks are marked [A]

**MembersSection** (`members.tsx`, 392 lines; anchor `#membres`; empty-team action on `/equipe` links to it) [M list, A manage]
- Title `membersTitle`, description `membersDescription` (privacy default: team tools visible to all; assistant conversations, e-mail, Drive, Slack stay with their owner).
- [A] "Invite" (`invite`) opens `CreateInvitationContent` (272-315): step 1 = `InviteForm` (shared with onboarding: name optional max 100, department, role/job, seniority; refusals via `onboarding.inviteErrors`, code `permission` when not admin); step 2 = the link in `<code>`, warning `copyInvite` + `validUntil` + date (links work once and expire in 7 days: `INVITATION_DAYS`), `CopyButton`, Done. Step 2 is not dismissible.
- Active members list (aria `membersList`). Each row: name, e-mail, and
  - [A] placement line "job · level · department" or `placementNotSet`; Manager select (`manager`, options `noManager` plus the other active members; `setManagerAction`; toasts `managerSaved` / `managerLoop` / `managerOwner` / `memberFailed`); Role select (`role`: `member` / `admin`; `setMemberRoleAction`; toast `roleSaved`); Remove button + AlertDialog (`removeNamed`, `removeDescription`, `memberRemoved {name}`); pencil `EditPlacement` (`editPlacement {name}`; dialog with `PlacementFields`; descriptions `editPlacementDescription` / `editOwnPlacementDescription`; action `setMemberPlacementAction`).
  - an owner or the reader's own row: no Role select and no Remove, just the role badge (but the Manager select and the pencil stay).
  - [M, non-admin]: `reportsTo {name}` caption and the role badge only. `department/job/seniority` come back null for non-admins (SQL-level).
- Former members (`formerMembersTitle`, `formerMember {name}`): a separate list of deleted accounts, no controls.
- This whole block belongs to the Team screen of the new interface (proto `team.html|js`), NOT to Settings. See section 3 and risks.

**DirectorySection** (`annuaire.tsx`, 118 lines; anchor `#organigramme`) [A, and only if `directoryProviders()` is non empty]
- Title `directoryTitle`, description `directoryDescription`; help `directoryHelp` (needs a directory-admin account; people not in Leon are ignored, nobody is invited).
- One submit button per configured provider (`directoryGoogle`, `directoryMicrosoft`), name=`provider` value=`google|microsoft`, `<form action={startDirectoryImportAction}>` (works without JS; redirects away).
- On return `/reglages?annuaire=…#equipe` the page computes `DirectoryState {providers, provider?, plan?, error?}` and the section scrolls to itself. Then:
  - error notice: `directoryRights` / `directoryUnreachable` / `directoryAddress` ("Choose the Google or Microsoft account with the same address as your Leon account.") / `directoryRefused`
  - plan preview: each change "{name}: reports to {manager}" (`directoryUnder`) or `directoryNone`, with `directoryBefore (was: …)`; or `directoryNothing`; plus kept/outside counts (`directoryKept`, `directoryOutside`)
  - Apply (`directoryApply {count}`, only when there are changes; loading while pending): `applyDirectoryImportAction` then toast `directoryApplied {count}` and `router.replace('/reglages#equipe')`; failure toasts the mapped error. Cancel (`directoryCancel`) does the same replace.
- Server redirect targets that contain `#equipe`: `src/server/auth/annuaire.ts:287-288` and `actions.ts:224`. Renaming the group anchor means changing those three places.

**ManagersSection** (`managers.tsx`, 50 lines; anchor `#managers`) [A]
- Title `managersTitle`, description `managersDescription`; one Switch (`managersToggle`) bound to `managersSeeAll(ctx)`; law note `managersLaw` ("In most countries, the law requires you to tell your employees. Leon doesn't do it for you.").
- Optimistic (`useOptimistic`); a refusal or throw toasts `managersFailed` and the switch returns to what the page reads.

**GroupsSection** (`groups.tsx`, 212 lines; anchor `#groupes`) [A]
- Title `groupsTitle`, description `groupsDescription`; primary button `groupNew` opens `GroupDialog` (create).
- List (`listGroups(ctx)` = `Groupe {id, service|null, nom|null, membres[]}`): label `nom` or the translated department (`onboarding.departmentLabelKey`); caption "Department · n people" (`groupService`, `groupCount`).
- Department groups (service) are read-only. Free groups (`nom` set) get Edit (`groupEdit`, aria `groupEditTitle {name}`) and Delete (`groupDelete`, AlertDialog `groupDeleteTitle`, `groupDeleteDescription`; toasts `groupDeleted {name}` / `groupRefused`).
- `GroupDialog`: Name (`groupName`, max 80, required, error inline from action: `groupInvalid`/`groupNameTaken`/`groupRefused`) + fieldset `groupMembersLegend` with a Checkbox per active member (scrolling list max-h 64); Save toasts `groupSaved`.
- Empty: `groupsEmpty` + `groupsEmptyHelp`.
- Writes revalidate `/documents` too (documents shared to a group).

**DepotsEquipeSection** (`depots-equipe.tsx`, 142 lines; anchor `#depots-equipe`) [A]
- Title `depotsTitle`, description `depotsDescription`. Data: `listDepotsEquipe(ctx)` = `{depots: {depot, coche}[], githubBranche}`.
- Warning `depotsNone` when `githubBranche && no checked repo` ("GitHub is no longer synced, and what was synced is private to whoever connected it").
- List (aria `depotsList`): a Checkbox per repo, optimistic (`useOptimistic`); an unchecked repo the page no longer reads stays in place (`withUnchecked`, exported and unit-tested in `depots-equipe.test.ts`: keep that export); errors toast the action's message, throw = `depotFailed`.
- Empty: `depotsEmpty`. Add form: `depotAdd` input (placeholder `depotPlaceholder` `acme/leon`, help `depotHelp`), button `depotAddSubmit`; error inline; success toast `depotAdded`.

**SsoSection** (`sso.tsx`, 179 lines; anchor `#sso`) [A]
- Title `ssoTitle`, description `ssoDescription`. Prop `setup: SsoSetup|null` (`server/auth/sso.ts:45`: `providerId, protocol, domain, verified, dns {name,value}|null, redirectUrl, entityId|null`).
- No setup: `SsoForm`: Protocol select (`ssoProtocol`: `ssoOidc` / `ssoSaml`), Domain (`ssoDomain`, help `ssoDomainHelp`, placeholder acme.com); OIDC: Issuer (`ssoIssuer`, type url, help `ssoIssuerHelp`), Client ID (`ssoClientId`), Client secret (password, never returned); SAML: Entry point (`ssoEntryPoint`, url, help `ssoEntryPointHelp`), Metadata XML (`ssoMetadata`, textarea mono 5 rows, help `ssoMetadataHelp`). Values (except the secret) are kept on error. Save `ssoSave` (`sending` while pending). Error notice `ssoInvalid` / `ssoRefused` / `ssoAlready` / `ssoDiscoveryFailed`.
- Setup exists: `SsoStatus`: domain + protocol badge (OIDC / SAML) + badge `ssoVerified` (success) or `ssoPending` (warning); copy lines: `ssoRedirectUrl` (OIDC) or `ssoAcsUrl` (SAML), `ssoEntityId` (SAML only); if `dns`: `ssoDnsIntro` + `ssoDnsName` + `ssoDnsValue`; "Verify the domain" (`ssoVerify`, only if not verified; toasts `ssoVerifiedToast` / `ssoNotYet`); "Remove SSO" (`ssoRemove`) with a native `window.confirm(ssoRemoveConfirm)` (toasts `ssoRemoved` / `ssoRemoveFailed`).

**DeleteOrganizationSection** (`delete-account.tsx:174-194`) [O only]
- Title `deleteOrganization.title`, description `deleteOrganization.description` ("Only its owner can delete it. Everything it contains is erased, for everyone."), effects `effectAll {organization}` + `effectMembers {count}`; same dialog as the account one but no successor; `deleteOrganizationAction`; redirect `/connexion?supprime=organisation`.

---------------------------------------------------------------------------------------------------------------------

## 2. The prototype (`proto/settings.html|js|css`) in detail

Frame: `<main>`, `.set` (max-width max(75%-3px, 876px)), header `.head` with `<h1>Settings</h1>` and ONE ink pill: `Save` (`#save`,
form="profile-form", `hidden` until the profile is dirty). Under it, `.chips[data-chips]` (4 chips, `data-v` = profile, security,
assistants, workspace; event `leon:chip`). Four `<section class="grp">`, one shown at a time (`.is-on`); `?`: hash `#security|#assistants|#workspace`
(`show()` line 62-69; the Profile chip drops the hash). Without JS the four stack, each under its `.grp__h`.

- **Profile** (`#profile`, `.paper.rows`): head = `Leon.av(name)` + `<b><span class="mark">name</span></b>` + "Role · Workspace" (e.g. "Admin · Kestrel Studio");
  rows (`.row` = label 200px | value | action): Name (`#p-name`, maxlength 100, `data-req="Name"`), Email (text), About you (`#p-about`, 3 rows, placeholder "Your role and current focus"; refusal "500 characters at most.").
  Under the sheet, `.grp__end`: quiet button "Delete my account" (`data-step="delete-account"`).
  Dirty detection (`dirty()` 77) shows Save; submit = `Leon.validate`, `Leon.busy(save,'Saving…')` then `Leon.done(save,'Saved')`; the name is rewritten everywhere (sidebar, menu, head), the head name gets `mark.is-on` (highlighter).
- **Security** (`#security`, `.paper.rows`): two rows. Password row: action "Change password" (`data-step="password"`). Two-step sign-in row: state text "Off"/"On" (`#tfa-state`), button "Set up" / "Manage" (`data-step="tfa"`).
  - password panel (101-116): fields `pw-cur`, `pw-new` (hint "At least 8 characters."), `pw-again`; foot: ink "Change password", quiet "Cancel", note "Your other sessions will be signed out."; refusals under the field: "Your password must be 8 to 128 characters long." (new), "Passwords don't match." (again), "Incorrect password." (cur); busy "Changing…" then done "Password changed / Your other sessions have been signed out." (`Leon.panel.busy`, `thaw()` unfreezes after a refusal).
  - two-step, off (160-194): panel explains, password field, "Continue" ("Checking…"), then a second view: the QR (a drawn, non scannable fixture: `qr()` 123-133), "Show setup key", backup codes list (`codesHTML`: "Backup codes", "Copy codes", hint) and a "6-digit code" field, foot "Turn on" ("Turning on…"; code `000000` is the fake refusal); then done "Two-step sign-in is on".
  - two-step, on: status row (`Leon.pill('On')` + "Authenticator app"), password field with hint "New backup codes replace the old ones: those stop working.", foot: quiet "Turn off", line "New backup codes", "Done"; new codes shown with "I've saved my codes"; "Two-step sign-in is off" done view.
- **Assistants** (`#assistants`): `.sec__head` "Connected" with flag `tag.c2` (count) over `ul.grid` of **cards** (88px): computers (`data-pc`, glyph laptop, name, caption = coding tools) then tokens (`data-tk`, glyph key, name, caption `leon_…xxxx`); `#a-none` empty state "Nothing connected yet / Connect a computer or an assistant, and it appears here." Then `.sec__head--next` "Add" over three **tiles** (52px, with a 28px outline pill): "Computer" (Connect), "Assistant" (Connect), "Token" (Create).
  - computer card panel: facts (Coding tools, System, Connected, Last session, Leon receives); foot quiet "Disconnect" (confirm "Disconnect "name"?" / "Keep it") and "Done"; toast "Computer disconnected."
  - token card panel: facts Token `leon_…xxxx`, Created, Last used / "Never used"; foot quiet "Revoke" (confirm) and "Done"; toast "Token revoked."
  - Add Token panel: field "Device name" (error "Enter a device name of up to 80 characters."), hint; "Create token", then done "Token created" + copy line + "Copy it now; it won't be shown again."; the card appears at once (`redraw()`).
  - Add Computer panel: copy line of the install command, hint, facts (Works with, Before it sends, Leon receives). No panel foot (Done default).
  - Add Assistant panel: copy line "Address" (`https://leonmemory.com/api/mcp`), hint, facts for claude.ai/Claude Desktop, ChatGPT, Cursor and VS Code, Claude Code (command in `.code`), Codex (two commands).
- **Workspace** (`#workspace`, `.paper.rows`): head = `.ws__tile` initial + "Kestrel Studio" + "Open beta · no billing yet" (the head caption); rows: Owner (`av--s` + name; read-only), Company single sign-on (state "Not set up" | "Domain to verify" | "On", button "Set up" | "Manage"). Under the sheet: quiet "Delete the workspace".
  - SSO panel (294-356): `ssoFields()` (protocol select OIDC (Okta, Entra, Auth0…) / SAML; domain with live hint; issuer + client id + secret, or entry point + metadata XML; refusals "Write a domain, like acme.com." and "Write an address that starts with https://."); "Save SSO" ("Saving…"); then the status panel (statusrow pill "Domain verified"/"Domain to verify" + domain + protocol; copy lines for redirect/ACS and entity ID; DNS TXT name/value + hint; "Verify the domain" ("Verifying…"; first try fails "Record not found yet. DNS can take a few minutes, try again.", second succeeds); quiet "Remove SSO" with confirm "Remove SSO?" / "Accounts stay; they'll sign in another way." / "Keep it"; toast "SSO removed."). Done view "SSO is on".
  - Delete workspace panel (359-363): "Everything in "X" would be erased, for everyone: collected sources, documents, discussions and morning briefings." + pill "Only the owner can delete it" + "You are an admin" + Owner fact. No action available: the demo user is an admin, not the owner.
- Kit pieces used: `Leon.panel.open/busy/confirm/close`, `Leon.facts`, `Leon.field`, `Leon.validate`, `Leon.fieldError`, `Leon.busy/done`, `Leon.copy`, `Leon.pill`, `Leon.toast`, `Leon.av`, `Leon.card/tile`, `.chips`, `.tag.cN`, `.paper`, `.mark`. Settings-only CSS to port: `.rows/.row/.rows__head/.row__k|v|text|state|who`, `.glyph`, `.copyline`, `.code`, `.scan/.qr`, `.codes`, `.effects`, `.statusrow`, `.grp__end`.
- Everything in the prototype is local state; a reload resets it.

---------------------------------------------------------------------------------------------------------------------

## 3. Where every real section goes (the four groups; no fifth)

| Real section | Visible to | New home | How it looks (founder's taste) |
|---|---|---|---|
| Profile card + Name + Email | M | **Profile** sheet (proto head + rows) | head and rows as the proto; ONE Save pill in the page head, shown when name or about is dirty |
| About you | M | **Profile** sheet, third row | as the proto; the `max` counter moves to the panel-less row as quiet text only when near the limit, or is dropped (see gaps) |
| Language | M | **Profile** sheet, row "Language" (select; applies at once; no Save) | NEW row, not in proto |
| Theme | M | See gaps: Papier has no dark palette; row only if a dark Papier exists | |
| Delete my account | M | **Profile**, `.grp__end` quiet button, panel as the proto | proto panel plus real branches: sole member, successor select, 2FA code |
| Change password | M | **Security** row, panel as the proto | |
| Two-factor | M | **Security** row (Off/On + Set up/Manage), panel as the proto | real QR (qrcode.react) in the proto's `.qr` frame |
| Computers (install paths + list) | M | **Assistants**: computer **cards**; the "Computer" tile opens the install panel (Ask Claude path + terminal command + docs link) | caption: none (no real "tools" data) |
| Personal tokens | M | **Assistants**: token **cards**; the "Token" tile creates | as the proto |
| Connected assistants (OAuth) + MCP address + five clients | M | **Assistants**: NEW card kind "assistant" (caption = `clientHost`); the "Assistant" tile opens the address and the five clients | the proto has the tile but no card for the connected ones |
| Browser extension | M | **Assistants**: NEW fourth tile "Browser extension" (pill "Install"), its panel holds the 3 steps, the prompt copy and the server address | NEW |
| Members list, Invite, Role, Manager, Remove, placement pencil, Former members | M read, A manage | **Team screen** (`team.html` port): its panel and its Invite pill. NOT in Settings | see risks: Team builder must cover all of 1.4 Members |
| Import the org chart | A (if a provider exists) | **Workspace**: row "Org chart" with the provider button(s); the preview opens as a panel on return | NEW |
| Managers read private | A | **Workspace**: row "Managers read what's private" with a switch (applies at once) | NEW; the law sentence lives in a panel (see gaps) |
| Groups | A | **Workspace**: section head "Groups" + flag, group **cards** (caption "Department" for department groups only), tile "New group" | NEW |
| Team repositories | A | **Workspace**: one row "Team repositories" with "Manage" opening a panel (checkbox list + add field); row state turns red "None selected" when the real warning applies | NEW |
| Company SSO | A | **Workspace** row (proto) | as the proto, driven by the server `setup` |
| Owner | M | **Workspace** row (proto) | read-only |
| Delete the organisation | O (real: hidden for non-owners) | **Workspace**, `.grp__end` quiet button | owner: the real flow; admin: the proto's explanatory refusal panel (decision, see gaps); member: absent |

Workspace for a plain member: the sheet head + the Owner row only. Keep the chip so the four chips never change by role.

---------------------------------------------------------------------------------------------------------------------

## 4. Component plan: transform, do not paste

Create under `src/components/papier/reglages/` (or rename `verre/reglages/`; builder's call; update the 4 importers named in section 7).
Keep every Server Action and every server module exactly as they are. Only the React layer changes.

1. **Page** `src/app/(app)/reglages/page.tsx`: keep all reads and derived values (lines 54-98). Replace the JSX (103-207) with
   `<SettingsScreen>` that gets plain serialisable props: `profile {name,email,membership,about,aboutMax,locale}`, `twoFactor`,
   `computers`, `tokens`, `assistants`, `command`, `instructions`, `address`, `serverUrl`, `extensionPrompt`, `isAdmin`(mayInvite),
   `isOwner`, `deletion` (DeletionInfo), `members` (only for the group select in the group panel; non-former `{id,name}`),
   `groups`, `managersSeeAll`, `depots`, `githubBranche`, `sso`, `directory` (state or null), `initialGroup`. Drop `PageHeader subtitle`.
2. **Chips + groups** (replaces `SettingsTabs`): client component; chips from the kit (`aria-pressed`, one at a time); group ids
   `profil`, `securite`, `assistants`, `espace`. `tabOf(hash)` stays exported (tests import it) and maps both old and new anchors to one
   of the four groups (table in section 7). Follow `hashchange` as today. Keep `?annuaire=…` working: when present, open Workspace and auto-open the org-chart preview panel.
3. **Side panel**: the shell builder owns `Panel` (520px side sheet, scrim, Escape, focus return, `busy`, `confirm`). Settings consumes it.
   The panel must support: redraw while open; non-dismissible mode (token and invitation secrets; real `dismissible={false}`); form in body + button in foot (`form="…"`).
   The existing bottom `Sheet` in `ui/dialog.tsx:193` is a mobile sheet, not this. Do NOT use Radix `DialogContent` size md for new panels.
4. **Rows sheet** (`Rows`, `Row`, `RowsHead`): small presentational components from `settings.css` (`.paper.rows`). One per sheet.
5. Panels, one component each, all taking the same `{open, onClose}` shape and calling the existing actions:
   `PasswordPanel`, `TwoFactorPanel` (views: off, setup, enabled, codes; seeded by prop `twoFactor`), `DeleteAccountPanel`,
   `DeleteOrganisationPanel` (shared base `DeletionPanel` = the old `DeletionContent`), `ComputerPanel`, `ConnectComputerPanel`,
   `TokenPanel`, `CreateTokenPanel`, `AssistantPanel`, `ConnectAssistantPanel`, `ExtensionPanel`, `SsoPanel` (form / status),
   `DirectoryPanel`, `GroupPanel`, `RepositoriesPanel`.
6. State rule: the prototype keeps data in local arrays; the real page is server-driven. After each action, `revalidatePath('/reglages')`
   re-renders the page and the new props arrive. Panels that stay open over a change (SSO form to status, 2FA off to on, a created
   token) must derive their view from props (`sso`, `twoFactor`, `tokens`), plus the small local state the old components already had
   (`setup`, `codes`, `created`, `fresh`).

---------------------------------------------------------------------------------------------------------------------

## 5. Control by control: what each new control calls, and every state

### Page head
- `<h1>` = `settings.title`. Pill "Save" (`settings` or `security.save`/`about.save`; reuse `security.save`): present only on Profile and only when dirty.
- Save does: if name changed, `updateProfileAction(name)`; if about changed, `updateAboutAction(about)`; run in one transition, both results are reported by field (name error under Name, about error under About you). Busy "Saving…" (`settings.sending` is "Sending…"; add or reuse), done "Saved" (reuse `about.saved`'s short form or add `settings.saved`). Success messages `security.profileSaved` / `about.saved` become the one word.

### Profile
- Name field: refusal `security.nameInvalid` (empty or over 100). Server error `security.profileFailed`.
- About you: `maxLength` 500 and `about.tooLong` {max} on refusal; `about.failed`. Textarea autoGrow.
- Language: `setLocaleAction`; after it the page rerenders in the other locale (reload of strings). Options keep their own-language labels (Français / English).
- Delete my account: panel; states = idle, working (button "Deleting…"), refused (inline error under the field it concerns: wrong word under the word field; `wrongPassword`/`tooManyAttempts` under Password; `wrongCode` under the code; `failed`/`refused.*` as a panel-level note); on success nothing to show (server redirect to `/connexion?supprime=compte`; the proto's "account deleted" done view cannot exist). Destructive pill = `btn--danger` inside the panel only.

### Security
- Change password: panel; validate client-side with the same messages as the server (`auth.passwordLength`, `auth.passwordsMismatch`) so refusals land under "New" and "Confirm"; map the server's single `error` to the "Current password" field. States: idle, "Changing…", refused (per field), done "Password changed" (`security.passwordChanged`).
- Two-factor row text: "Off" / "On" from the `twoFactor` prop (the proto's wording; add `security.stateOn|stateOff` or reuse `preferences`-style new keys). Button: `security.configure` shortened to "Set up" when off; "Manage" when on.
- Off, step 1 password (`enableTotpAction`): "Continue" busy "Checking…"; refusals `wrongPassword`, `tooManyAttempts`, `enableFailed`. Step 2: QR + key + backup codes + code (`verifyTotpSetupAction`): `codeInvalid`, `codeWrong`; done `security.enabled`.
- On: Password field + "New backup codes" (`regenerateBackupCodesAction`) / "Turn off" (`disableTotpAction`); codes view with "I've saved my codes"; done `security.disabled`. A refusal re-enables the frozen panel (proto `thaw`).
- Digits only in the code field (proto line 196), maxLength 6.

### Assistants
- Computer card: name, caption (see gaps), opens `ComputerPanel`: facts Connected {createdAt}, Last used {lastUsedAt or `neverUsed`}, what a computer sends (`settings.computersDescription`). Foot: quiet "Disconnect" opens confirm (`revokeNamed`/title, `computerRevokeDescription`, yes `revoke`/"Disconnect", no "Keep it"); calls `revokeTokenAction(id)`; toasts `computerRevoked` / `tokenAlreadyRevoked` / `revokeFailed`.
- Token card: caption `leon_…{hint}`; panel facts Token, Created, Last used or `neverUsed`; hint `settings.tokenDescription`; Revoke confirm as above with `revokeDescription`; toasts `tokenRevoked`...
- Assistant card (new): name, caption `clientHost`; panel facts Client, Connected, Last used; Revoke confirm with `assistantRevokeDescription`; toast `assistantRevoked`. Not listed once `refreshExpiresAt` passed (server-side filter stays).
- Tile "Computer": panel = "Ask Claude" copy (`claudeCode.ask`, copied message `claudeCode.copied`, value `instructions`) when `instructions !== null`, terminal command with copy when `command !== null`, link to `/documentation` (new tab). When `command === null`: hide the tile (the old section hid the whole install block; do not show a wrong command).
- Tile "Assistant": panel = MCP address (copy; value `RESOURCE` untouched) + five client rows with their commands.
- Tile "Token": 2-step panel; step 2 non-dismissible until "Done"; token only in the panel; the card appears (highlighted via `mark.is-on`) only after the panel closes.
- Tile "Browser extension" (new): steps 1-3, the prompt copy (`settings.askClaude`), server address (`serverUrl`, copy). Step 3's link goes to the Token tile/panel instead of `#jetons`.
- Empty: "Nothing connected yet" (proto) replaces `noComputers`, `noTokens`, `noAssistants` (three old empty states become one; the old strings are then unused).
- Flag `tag.c2` next to "Connected": proto counts cards; the founder's rule says a flag may count a section, so keep it.

### Workspace
- Head: `.ws__tile` initial + organisation name (`deletion.organizationName`) + caption. Proto caption "Open beta · no billing yet" is invented; use a real fact or none.
- Owner row: owner name from `members` (role includes `owner`), `Leon.av` small.
- SSO row: state "Not set up" / "Domain to verify" (`ssoPending`) / "On" (`ssoVerified`); button "Set up" / "Manage" (a11y labels as proto). Panel = `SsoForm` or `SsoStatus` from `setup` prop; "Remove SSO" uses the panel confirm (replaces `window.confirm`); all messages from section 1.4.
- Managers row: switch with immediate effect; failure `managersFailed` as toast and the switch returns.
- Org-chart row (only if `directory`): per-provider buttons (`directoryGoogle`, `directoryMicrosoft`) as `<form action={startDirectoryImportAction}>`; return state opens `DirectoryPanel` (preview list + Apply + Cancel; errors in the panel; toasts `directoryApplied`); closing it calls `router.replace('/reglages#espace')`.
- Groups: cards + "New group" tile; `GroupPanel` create/edit (name + member checkboxes) and delete confirm; messages in section 1.4.
- Team repositories row: `RepositoriesPanel` (checkbox list, optimistic; add by `owner/name`; `depotsNone` warning; `depotsEmpty`). Row state text in danger colour when `githubBranche && no checked`.
- Delete workspace: owner = full flow via `DeletionPanel` (effects `effectAll`, `effectMembers`, password, 2FA, word); admin = proto's refusal panel (reuse `deleteAccount.refused.pas_proprietaire` + `deleteOrganization.description`); member = no button.

---------------------------------------------------------------------------------------------------------------------

## 6. Gaps

### In the prototype (the real product has it, the prototype does not draw it)
1. Language (fr / en) and Theme. The prototype has no preferences at all, and the Papier tokens have no dark palette (`grep dark` in tokens.css, ui.css, app.css returns 0). Language must survive: it is the whole i18n product. Theme: either drop the row until a dark Papier exists, or ask the founder (decision needed; default recommended: drop it and remove `useTheme`'s selector, keep the lib).
2. Connected assistants as cards (OAuth `kind assistant` tokens with revoke).
3. Browser extension (3 steps, prompt, server address). Anchor `#extension` is linked from Connections cards for `claude_ai` and `chatgpt` (`src/components/verre/connexions/carte.tsx:62-63`).
4. "Ask Claude" install path with `claudeCodeInstructions` and the docs link (proto only shows the terminal command).
5. Groups (list, create, edit with member checkboxes, delete) and their department groups.
6. Team repositories (checkbox list, add by name, the "none selected" warning).
7. Managers-see-private switch and its law notice (`managersLaw`, a legal duty note: keep it, in the panel or as a hint under the row; do not drop).
8. Org-chart import (Google, Microsoft; preview, apply; four error states; return URL handling).
9. Delete the organisation for the owner (the proto only shows the refusal for an admin).
10. Delete-account branches: sole active member (also deletes the organisation), required successor select. The proto only draws the plain branch and a done view that the real redirect makes impossible.
11. Members (list, invite link flow, role, manager, remove, placement edit, former members, read-only member view). Moves to Team; the Team prototype draws invite, role, manager, remove, but NOT the placement pencil (department, job, seniority of an existing member) nor "Former members" (as a "Left" status it does appear in the data) nor the read-only member view. To be confirmed in the Team map.
12. Descriptions that carry a promise and are not "explaining the screen": `about.description` (what the briefing does with the text), `managersDescription`/`managersLaw`, `directoryDescription` ("a reporting line set by hand here is never changed"), `depotsDescription` (only checked repos are synced and visible to all), `membersDescription` (privacy default), `computersDescription` (what a computer sends: secrets masked). The founder removes sentences under titles; put each inside its panel (or as one `.hint` beside the field) rather than deleting them. About-you's is the one that must be visible near the field (consent-like); decision needed.
13. "Sessions": neither the real product nor the prototype lists them. Nothing to port. Do not invent a list.

### In the real product (the prototype shows it, the real data cannot)
1. Computer card caption "Claude Code" / "Codex, Cursor" and panel facts Coding tools, System, Last session. The real `ApiTokenRow` has only name, hint, createdAt, lastUsedAt, kind, clientName, clientHost. Show no caption (name only), and facts Connected and Last used. Adding tools/OS needs a schema and CLI change: out of scope, say so.
2. Workspace head caption "Open beta · no billing yet": no real source. Omit or use a real fact.
3. Workspace "Owner" comes from `members` (role includes `owner`); fine. But the real data has no "workspace domain" for the SSO placeholder (proto prefilled `kestrel.example`): use `acme.com` as the real field does.
4. "Account deleted" done view with "Go to sign-in": the real action redirects. Skip it.
5. Prototype requires "https://" client-side on issuer and entry point and a domain regex. The real validation is `SsoInputSchema` on the server (`server/auth/sso.ts:28`); client checks are an extra, the real `ssoInvalid` message stays the fallback.
6. Prototype says "workspace"; real en.json says "organization" (`deleteOrganization.*`, `deleteAccount.*`). The founder asked that confirmations come from the real product's words: keep the real keys, or rename in both `messages/en.json` and `messages/fr.json` together (fr says "organisation"/"espace"; check parity).
7. The sidebar warning row in `shell/sidebar.tsx:96-115` (`memoryLate`) links to `/reglages`, but the proto's alert goes to Connections. Not Settings' to fix; flag to the shell builder.

---------------------------------------------------------------------------------------------------------------------

## 7. Anchors, tests, i18n: what the port must update

### Inbound links to Settings (must still land somewhere sensible)
| Link | Where | Today | New target |
|---|---|---|---|
| `/reglages#ordinateurs` | `connexions/carte.tsx:58-61` (claude_code, codex, cursor, antigravity), `onboarding/code-tools-card.tsx:81` | Integrations tab, section | Assistants group, auto-open the "Computer" panel |
| `/reglages#extension` | `connexions/carte.tsx:62-63` (claude_ai, chatgpt) | Integrations | Assistants group, auto-open the extension panel (or MCP panel: note claude_ai/chatgpt cards actually want the MCP "Assistant" panel; builder to confirm with the Connections map) |
| `/reglages#assistants` | `connexions/carte.tsx:64` (mcp_remember) | Integrations | Assistants group |
| `/reglages#membres` | `equipe/index.tsx:58` (empty Team action) | Team tab | `/equipe` Invite (the Team builder), not Settings |
| `/reglages#profil` | `discussions/about-suggestion-card.tsx:163` | Profile tab | Profile group, focus About you |
| `/reglages?annuaire=…#equipe`, `/reglages?annuaire=refus#equipe` | `server/auth/annuaire.ts:287-288`, `actions.ts:224` | Team tab | Workspace group + auto-open the org-chart panel |
| `/reglages` | `shell/nav.ts:28`, `shell/sidebar.tsx:103`, `shell/command-palette.tsx:109`, `site/site-footer.tsx` (locale action only) | | unchanged |

Recommendation: keep `tabOf` mapping every OLD anchor to a NEW group so nothing outside has to change: `profil`, `securite`, `assistants`, `ordinateurs`, `jetons`, `extension`, `integrations` to their groups; `equipe`, `organigramme`, `managers`, `groupes`, `depots-equipe`, `sso` to Workspace; `membres` to the Team screen redirect (or Workspace if Team cannot take it).

### Tests that will break unless updated with the port
- `src/components/verre/reglages/settings-tabs.test.ts`: asserts `tabOf('#ordinateurs'|'#jetons'|'#assistants'|'#extension')` = `'integrations'`, `tabOf('#securite')` = `'securite'`, `tabOf('#membres')` = `'equipe'`, `tabOf('#claude-code')` undefined. Rewrite to the new group ids.
- `src/test/contracts/page-links.test.ts`:
  - line 3 imports `tabOf`; line 80 expects exactly `site-footer.tsx`, `onboarding/code-tools-card.tsx`, `reglages/computers.tsx` to link `/documentation` (move the link to the panel file and change the expected list; line 98 reads `src/components/verre/reglages/*.tsx` and `page.tsx` for `id="<anchor>"`: a section id must still exist for every `/reglages#anchor` that is not a group name, or the anchors above must resolve through `tabOf` only).
  - line 122-130: `actions.ts` must keep writing exactly `?supprime=compte` and `?supprime=organisation`.
- `src/app/(app)/reglages/page.test.ts`: it checks that the page splits tokens into `TokensSection`, `ComputersSection`, `AssistantsSection` by kind (assistants with an expired `refreshExpiresAt` dropped; computers with the prefix removed). Keep the splitting code in `page.tsx` and rewrite the assertions on the new component props.
- `src/components/verre/reglages/computers.test.ts` (167 lines), `assistants.test.ts` (142 lines): render the old sections and test the copy buttons (what they copy and confirm: `instructions`, `command`) and the client list/commands. Port the expectations to the new panels (address exactness, Codex two commands, `command null` hides install).
- `src/components/verre/reglages/depots-equipe.test.ts`: imports `withUnchecked` from `./depots-equipe`. Keep the export (or move test with it).
- `src/app/(app)/reglages/actions.test.ts`: tests the actions; do not change signatures.
- Other tests that mention `reglages` by path only: `(auth)/ordinateur/autoriser/page.test.ts`, `src/cli/setup.test.ts`, `install-hooks.contrat.test.ts`, `onboarding/tools-step.test.ts`, `code-tools-card.test.ts` (they check link targets such as `/reglages#ordinateurs`; keep that anchor or update them).

### i18n (namespaces `settings`, `security`, `deleteAccount`, `deleteOrganization`, `preferences`, `about`, plus `claudeCode`, `common`, `auth`)
All keys in both `messages/en.json` and `messages/fr.json`. Keep every key used by a kept control (sections 1 and 5). Candidates to remove
once the port is done (not before; check with a grep): `settings.subtitle`, `settings.tabsLabel` (keep: it labels the chips group), `tabProfile|tabSecurity|tabTeam|tabIntegrations` (rename to the four chip names; "Team" tab disappears, add "Assistants", "Workspace"),
`noComputers|noTokens|noAssistants` (replaced by one empty state), `computersLead` and others if their text moves into a panel (keep the text, only the place changes).
New keys needed (both locales): chip names Assistants and Workspace; row labels `Password`, `Two-step sign-in`, `Language`, `Company single sign-on`, `Owner`, `Org chart`, `Managers`, `Team repositories`; row states `On`/`Off`/`Not set up`/`Domain to verify`/`None selected`; tile pill words `Connect`/`Create`/`Add`/`Install`; `Manage`; `Saving…`/`Saved`; `Nothing connected yet`; `Delete the workspace` or keep "Delete the organization"; `Keep it`; "Disconnect".

---------------------------------------------------------------------------------------------------------------------

## 8. Risks and traps

1. Secrets shown once (token, invitation link, backup codes, delete flows). The old UI blocked Escape and outside-click at step 2 (`dismissible={false}`). The prototype panel closes on both. The shared panel needs a "locked" mode, or tokens get lost. Same for the 2FA setup view (backup codes shown once) and for `created`/`fresh` highlight timing.
2. State comes from the server. The proto is a local mock. Do not copy `tfa`, `sso`, `computers`, `tokens` variables: derive from props; after a successful action the new props arrive via `revalidatePath('/reglages')`. A panel left open must not show stale data (SSO form must flip to status when `setup` appears; the 2FA row must flip to "On" after `verifyTotpSetupAction`).
3. Delete flows end with a server `redirect()`. A client `startTransition(async () => { await run(...) })` handles it (the old code did the same). Do not add a "done" view and do not call `router.push`. Keep `organizationToo` in the payload (the server re-reads the situation and refuses on mismatch: `refused.situation`).
4. Rate limiting is shared by e-mail across login, password change, 2FA and deletion (`passwordCheckAllowed`). Several retries in tests will hit `tooManyAttempts`; surface it under the password field.
5. Optimistic controls (Managers switch, repository checkboxes) rely on `useOptimistic` plus a refusal returning to what the page reads. Keep it; do not replace by local `useState`.
6. `startDirectoryImportAction` is a plain `<form action>` that never returns (redirect). Keep the form and per-provider submit buttons; it must work with the panel closed and without JS.
7. Admin gating is server-side AND by prop (`mayInvite`, `deletion.isOwner`). A hidden control is not a security boundary: the actions re-check (`members.ts`, `organisation.ts`, `sso.ts`, `groupes.ts`, `depots-equipe.ts`). Do not weaken those; the UI only hides. Show "Delete the workspace" to admins as a refusal panel (the proto's choice) only if the founder confirms; the safe default is to match the real page (owner only).
8. Members leaving Settings means three outside dependencies: `/equipe` empty state link (`#membres`), `onboarding/invite-form.tsx` (imports `createInvitationAction` from this folder's actions: keep it exported), and the placement edit. If the Team port does not cover the placement pencil, administrators lose the ability to edit an existing member's department/job/seniority (`setMemberPlacementAction`). Check the Team map before deleting `members.tsx`.
9. `companies without a configured directory provider` and `command null` are real, valid states: each hides its control. Verify them (they are easy to lose when moving to rows).
10. i18n parity: the project tests en/fr key parity (messages in both locales); a key removed or renamed in one locale only fails the build. The delete word is localised ("DELETE" / "SUPPRIMER"): always compare with `t('word')`, never a literal.
11. QR: the proto draws a fake, non scannable QR. Use the real `QRCodeSVG` (dependency `qrcode.react` already installed) inside the proto's `.qr` frame (white tile, 136px) at a size that scans (at least 136; the old one used 192). Test scanning on a phone.
12. `useMinWidth`/Radix Tabs removal: the old tabs gave arrow-key navigation and `role=tab`. The chips group (`role=group`, `aria-pressed`) is the proto's decision; keep the group labelled (`settings.tabsLabel`) and keep keyboard order.
13. Contract test on the `/documentation` link location (section 7) fails silently if the link moves; update it in the same change.
14. Not verified by me (no server run, by instruction): that `team.html|js` panels cover roles/managers/remove exactly as the real actions, and `fr.json` strings for the new row labels.
