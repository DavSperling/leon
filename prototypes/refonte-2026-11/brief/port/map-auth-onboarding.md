# Port map: auth-onboarding (sign-in, sign-up, invitation, reset, the two "authorize" pages, onboarding)

Author: front-end port prep. Nothing was edited in the worktree. All paths below are relative to
`/Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484` ("WT") unless absolute.
Prototype = `WT/prototypes/refonte-2026-11/papier/app/` ("P"). Kit guide = `P/NOTES.md`.

Rule for every builder of this area: change markup, classes and layout. Do NOT change any server action, schema,
redirect, error code, i18n key that is still used, hidden field name (`token`, `retour`, `provider`, `decision`,
`space`, `port`, `etat`, `empreinte`, `usages`, `usage`, `outils`, `goals`, `department`, `job`, `seniority`, `size`,
`organizationName`, `code`) or `name=` of any input. The tests pin the props the pages pass and the strings.

---------------------------------------------------------------------------------------------------------------------

## 1. Real inventory: every page, form, refusal, redirect

### 1.1 Layout of the auth pages: `src/app/(auth)/layout.tsx` (26 lines)
- Wraps in `SiteShell footer="bar"` (`src/components/site/site-shell.tsx`): Aurora background, skip link, public
  `SiteHeader`, **`<GoogleOneTap>` (site-shell.tsx:31, only when `socialProviders.google`)**, `<main id="contenu">`,
  and `SiteFooterBar` (site-footer.tsx:41: "(c) 2026 Leon", **LanguageSwitch (the only language choice on the sign-in
  pages)**, MotionSwitch, tagline).
- Grid: left a 420px `GlassCard variant="raised" signal` (children), right `<AuthAside />` (>= lg). Anchored at top.
- Applies to EVERY page under `(auth)`: connexion, inscription, mot-de-passe-oublie, reinitialiser,
  invitation/[token], oauth/autoriser, ordinateur/autoriser, ordinateur/connecte. (The authorize pages and
  "connecte" therefore also get AuthAside today.)

### 1.2 `AuthAside`: `src/components/site/auth-aside.tsx` (191 lines, client, `usePathname`)
- `signUp = pathname === '/inscription'`. Messages `site.auth.*` (aside, points.{sources,private,tools}, steps.{create,
  connect,ask}.{title,text}, signUpTitle, signInTitle, signInTitleAccent, moreTools, noBilling, example) and
  `site.common.briefing`; data from `useSiteContent()` (`./content`): `demos[0]`, `taglines.pitch`, `briefing`.
- Sign-in: heading with gradient word (`site-gradient`), pitch, `DemoAnswerCard` + `DemoSourceRow` + `Briefing` card
  (Tilt, ParticleField, site-float), `Points` list. Sign-up: three numbered steps, 8 `ToolLogo`s, "and N more", "No
  billing during the beta" line. < lg: only `Points` under the form.
- All of it is decorative (`aria-hidden`), uses gradients, particles, tilt, mono eyebrows: all banned by the new kit.
  Whole file is replaced by the pile (section 3.1). `site.auth.*` keys become unused except `aside` (label).

### 1.3 `/connexion`: `src/app/(auth)/connexion/page.tsx` (64 lines), test `connexion/page.test.ts`
- `await connection()`; reads `searchParams`: `supprime` (`compte` | `organisation`), `error`, plus the return params.
- `?supprime=compte|organisation`: success Notice (`deleteAccount.doneAccount` "Your account has been deleted." /
  `deleteAccount.doneOrganization` "The organization has been deleted."), above the form (page.tsx:39-43).
- `?error=<anything>`: error Notice, `auth.socialNotLinked` if `/not[_ ]linked/` else `auth.socialFailed` (page.tsx:45-49).
- `returnTo`: `parseAuthorizeParams(query)` (port, etat, empreinte, usages: from `leon login`, `/ordinateur/autoriser`)
  -> `authorizePath(...)`; else `oauthReturnPath(query)` (an assistant, `/oauth/autoriser`) ?? undefined. Rebuilt
  from validated values, never copied from the URL. **The test asserts `AuthForm.props.returnTo` and `OtherSignIn`
  props: keep both components' names and prop names.**
- Renders `<AuthForm page="connexion" canResetPassword={emailEnabled} returnTo alternatives={<OtherSignIn
  providers={Object.keys(socialProviders)} sso={await anyVerifiedSso()} returnTo />} />`.
- Metadata title `auth.signIn`.

### 1.4 `AuthForm`: `src/components/verre/auth/auth-form.tsx` (401 lines, client) - ONE component for 3 pages
Props: `page: 'connexion'|'inscription'|'invitation'`, `invitation?: {token, organizationName}`,
`canResetPassword`, `returnTo`, `alternatives: ReactNode` (rendered above the form, hidden in the 2FA step).
`FIELDS` (lines 35-77) and `COPY` (79-105) drive it; `useActionState(copy.action, {})`.

| page | title / submit key | fields (name, label key, autocomplete) | action | footer link |
|---|---|---|---|---|
| connexion | `signIn` / `signIn` | email (`email`), password (`password`, current-password) | `signInAction` | `noAccount` + `createWorkspace` -> `/inscription` |
| inscription | `createWorkspace` / `createWorkspaceSubmit` | name, email, password, confirmation (`confirmPassword`), organizationName (`companyName`, hint `companyHint`) | `signUpAction` | `haveAccount` + `signIn` -> `/connexion` |
| invitation | `joinWorkspace` / `joinWorkspace` | name, email (hint `inviteEmailHint`), password, confirmation | `joinAction` | none (signing in does not join) |

Behaviours that must survive:
- Hidden `token` (invitation) and `retour` (returnTo) fields (lines 218-219).
- Invitation subtitle `invitedTo` ("You've been invited to the “{name}” workspace."), line 203-207. (This is a sentence
  naming the workspace: keep, it is the product's consent text for who you join.)
- Show/Hide password button: `showPassword`/`hidePassword` (aria), `show`/`hide` (text); `aria-controls=pwId`;
  confirmation field has no toggle. Sign-up: live rules under password `passwordMinLength` (check when >= 8) and under
  confirmation `passwordsMatch` (when typed). The mark glyphs are text "✓ / ○".
- Refusals per field: `state.errors[field]` via `<Field error>` (aria-invalid, focus the first invalid field in an effect,
  line 159-171). Form-level refusal `errors.form` in an animated error Notice (`role=alert`): wrong credentials focuses
  the password (emptied) and **shakes** it (`useAnimate`, `isInstant()` respects reduced-motion); `signedUpNotIn`
  adds a small "Sign in" button -> `/connexion` inside the Notice (line 353-357).
- Success view `state.message` (only `verifySent`, when `emailEnabled`): replaces the form with title + success Notice +
  footer link (lines 174-194).
- 2FA step (`state.twoFactor` from `signInAction`): second form `verifyTwoFactorAction`; prompt `twoFactorAppPrompt` or
  `twoFactorBackupPrompt`; field `authCodeLabel` / `backupCodeLabel` (name `code`, numeric `one-time-code` maxLength 6 /
  text maxLength 11); toggle button `lostPhone` / `useApp`; error `errors.code` (field) and `errors.form`; submit `verify`;
  the alternatives, the other fields, the forgot link and the footer link are hidden. **The prototype has no 2FA step.**
- Pending: button `loading`, label `sending` ("Please wait…") + a `role=status` sr-only line.
- `forgotLink` ("Forgot your password?") -> `/mot-de-passe-oublie`, only when `canResetPassword` (= `emailEnabled`).
- `CONTROL_FIX`: 16.5px text on coarse pointers (iOS zoom). Keep an equivalent (fields >= 16px on phones) in the new CSS.

### 1.5 `OtherSignIn`: `src/components/verre/auth/other-sign-in.tsx` (114 lines, client)
Props `providers: ('google'|'microsoft')[]`, `sso: boolean`, `token?`, `returnTo?`. Returns `null` when no provider and no SSO.
- One tiny `<form action={socialSignInAction}>` per provider with hidden `provider`, `token`, `retour`; button label
  `continueGoogle` / `continueMicrosoft` (`useFormStatus` loading). No icon today.
- `sso` true: button `continueSso` ("Company SSO") which unfolds a form (`ssoSignInAction`): field `ssoEmail` ("Work
  email"), help `ssoHelp`, error `errors.email ?? errors.form`, submit `ssoSubmit` ("Continue"), hidden token/retour;
  `defaultValue=state.values.email`, autofocus.
- Divider line `orWithEmail` ("or with your email").
- Shown on /connexion (providers + sso + returnTo), /inscription (providers + sso; no returnTo), /invitation/[token]
  (providers, `sso={false}`, `token`).

### 1.6 `/inscription`: `inscription/page.tsx` (28 lines)
`connection()`, `AuthForm page="inscription"` + `OtherSignIn` (providers, sso). Title `auth.createWorkspace`.
A Google/Microsoft/SSO account created here has no workspace: it lands on `/bienvenue` (newcomer mode, section 1.12).

### 1.7 `/mot-de-passe-oublie`: page.tsx (35 lines) + `RequestPasswordResetForm` (`password-reset-form.tsx:15-46`)
- `emailEnabled` false: title `forgotTitle` + sentence `emailNotSetUp` + link `backToSignIn` -> `/connexion`.
- true: title, intro sentence `forgotIntro` ("We'll email you a link…") (explains the screen: dropped), form
  `requestPasswordResetAction`: field email (autofocus) error `invalidEmail`; `errors.form` Notice (`emailSendingOff` /
  `tooManyAttempts`); on success `state.message` = `resetSent` ("If this address matches an account, we've just sent a
  reset link.", the careful sentence, never reveals an account) in a success Notice and the submit button disappears;
  link `backToSignIn` always shown. Submit `sendLink`. Title `forgotTitle`.

### 1.8 `/reinitialiser`: page.tsx (35 lines) + `ResetPasswordForm` (`password-reset-form.tsx:48-81`)
- Reached from the e-mail link: `?token=` valid -> form, else (also `?error=`) sentence `resetLinkExpired` + link
  `requestNewLink` -> `/mot-de-passe-oublie`.
- Form `resetPasswordAction`: hidden `token`; field `newPassword` (help `passwordHint`, error `passwordLength`), field
  `confirmPassword` (error `passwordsMismatch`); `errors.form` = `resetLinkInvalid`; success `resetDone` ("Your password has
  been changed. You can now sign in.") + link `signIn` -> `/connexion`; submit `changePassword`. Title `newPassword`;
  metadata `resetMeta`. No rate limit message here (none in the action).

### 1.9 `/invitation/[token]`: page.tsx (75 lines)
`findInvitation(token)` (server: unused / expired / author no longer admin => null).
- Valid + signed in but no workspace (came back from Google/Microsoft): title `joinWorkspace`, sentence `joinAs`
  ("You're joining the “{name}” workspace with the account {email}."), one form `joinWithSessionAction` (hidden `token`) with
  one full-width primary button `joinWorkspace`. (Signed in WITH a workspace: `AuthForm` is shown, and joinAction
  refuses an existing account by email taken.)
- Valid + not signed in: `AuthForm page="invitation"` with `OtherSignIn providers sso={false} token`.
- Invalid: title `expiredTitle` ("Link expired"), `expiredText`, secondary full-width button `signIn` -> `/connexion`.
- Metadata: `joinWorkspaceMeta`, `referrer: 'no-referrer'`, `robots noindex` (the secret is in the URL: keep).
- Redirects (actions.ts): `joinWithSessionAction` -> no session `/connexion`; already in a workspace `/`; joined ->
  `/bienvenue` (member onboarding) else back to `/invitation/<token>`.

### 1.10 `/oauth/autoriser`: page.tsx (124 lines), actions.ts (45 lines), page.test.ts + actions.test.ts
Where an assistant (claude.ai, ChatGPT, Claude Code) sends the browser. Server logic (keep all):
- `client_id` that is an https document (`isDocumentClientId`) and no session => `/connexion?<validated return>`; malformed => "invalid" view.
- `parseAuthorizeRequest(query)`: `{retour}` => redirect to the client's verified return URL with error; `{erreur}` =>
  "invalid" view (`invalidTitle` + `invalidClient` | `invalidReturn`); no session => `/connexion?<fields>`; no workspace
  => `/bienvenue`.
- Consent view: title `title` ("Connect an assistant"); sentence `question` ({client} name, {space} organization);
  `declaredName` ("Name declared by the application: Leon hasn't checked it.") when the client is NOT a document
  client; bold line `returnToLocal` or `returnTo {host}` (the one thing Leon verified: must stay prominent);
  label `can` + list `canSearch/canRead/canBriefing/canRemember`; warning Notice `warning` ("If you aren't connecting an
  assistant yourself, refuse."); form `authorizeOAuthAction` with hidden OAuth fields (`oauthFields`) + hidden `space`
  (= `ctx.tenantId`, compared server-side) + two submit buttons `name="decision"` `value="allow"` ("Authorize", primary)
  and `value="deny"` ("Refuse", secondary).
- Action: any decision other than `allow` = refusal (`errorRedirect(access_denied)`); session lost => page again;
  `space` mismatch => page again; else `codeRedirect`. Metadata `referrer: 'same-origin'` (NOT no-referrer: a native form
  posts `Origin: null` otherwise), noindex. **A plain `<form action>` with real `<button type=submit name=decision>`s must stay: it must work before hydration.**

### 1.11 `/ordinateur/autoriser` and `/ordinateur/connecte`
`ordinateur/autoriser/page.tsx` (132 lines), `actions.ts` (37), tests. Where `leon login` sends the browser.
- Params invalid => view `invalidTitle` + `invalidText`, no form. No session => `/connexion?<authorizeQuery>`. No workspace => `/bienvenue`.
- View: title `title` ("Connect this computer"); sentence `question {space}`; warning Notice `warning` ("If you didn't run the
  command yourself, or ask Claude Code to run it, cancel."); form `authorizeComputerAction`: hidden `port`, `etat`,
  `empreinte`; when `params.usages` (from `leon setup`): `<fieldset>` with `<legend>` `usages.title`, `usages.hint`
  ("These boxes are yours… An agent that ran the command for you must never tick…"), hidden `usages` (comma list), and
  per usage one native checkbox `name="usage"` `value=<usage>` **checked by default** (native so it submits before hydration;
  "a box that did not submit would become a kept refusal"), `<label>` `usages.<u>.title` and 3 bullets
  `usages.<u>.p1|p2|p3` rendered with `t.rich(..., {code})` (`<code>` spans; tested word for word, read from the terminal's
  `LECTURE_LINES`). Only usage today: `lecture`. Buttons `decision=allow` ("Authorize") and `decision=cancel` ("Cancel").
- Action: not `allow` => `returnUrl(params,'refus')` (the CLI's local port); else signs `computerCode` with `usages` shown
  and ticked and redirects to the CLI's port.
- `/ordinateur/connecte` (page.tsx 26 lines): where the CLI sends the browser back: `?refus=1` => title
  `computer.connected.refusedTitle` ("Connection cancelled") + `refused` ("Nothing was authorized."); else `title`
  ("Computer connected") + `done` ("All set. You can close this tab…"). No form, no session needed.

### 1.12 Server actions behind every control (all in `src/app/(auth)/actions.ts`, 360 lines)
| control | action | success | refusals (message key, where) |
|---|---|---|---|
| Sign in | `signInAction` (88) | `redirect(pathAfterSignIn(retour))` (`/` or the authorize page) | field email `invalidEmail`, password `passwordRequired`; form `tooManyAttempts`, `verifyFirst` (unverified; a fresh link was sent), `wrongCredentials`; `{twoFactor:true}` opens the code step |
| 2FA code | `verifyTwoFactorAction` (121) | same redirect | `code: codeFormat`; `form: codeWrong` |
| Forgot | `requestPasswordResetAction` (144) | `message: resetSent` always | `form: emailSendingOff`, `tooManyAttempts`; `email: invalidEmail` |
| Reset | `resetPasswordAction` (178) | `message: resetDone` | `password: passwordLength`, `confirmation: passwordsMismatch`, `form: resetLinkInvalid` |
| Create workspace | `signUpAction` (206) | `emailEnabled`: `message: verifySent`; else signs in, `redirect('/')` (-> `/bienvenue`) | `name: nameRequired`, `email: invalidEmail/emailTaken`, `password: passwordLength`, `confirmation: passwordsMismatch`, `organizationName: companyInvalid`, `form: tooManyAttempts/signUpFailed/signedUpNotIn` |
| Join (invitation) | `joinAction` (238) | same as sign-up | + `form: inviteInvalid` |
| Google / Microsoft | `socialSignInAction` (298, void) | redirect to provider; back = `callbackURL`/`newUserCallbackURL` = `/invitation/<token>` or `pathAfterSignIn(retour)` / `/bienvenue`; error back to `/connexion?error=` | (page shows `socialFailed`/`socialNotLinked`) |
| One Tap | `oneTapAction(idToken)` (310) | `/` | `/connexion?error=account_not_linked|one_tap` |
| Company SSO | `ssoSignInAction` (327) | redirect to the IdP | `email: invalidEmail/ssoNotFound`, `form: tooManyAttempts` |
| Join with session | `joinWithSessionAction` (352, void) | `/bienvenue` | see 1.9 |
| Authorize assistant | `authorizeOAuthAction` | redirect with code / `access_denied` | see 1.10 |
| Authorize computer | `authorizeComputerAction` | redirect to local port | see 1.11 |
| Sign out | `signOutAction` (`src/app/(app)/actions.ts:13`) | `/connexion` | (onboarding layout button) |

Fields' values (except password and confirmation) are returned in `state.values` and re-filled via `defaultValue`.

### 1.13 Google One Tap: `src/components/site/google-one-tap.tsx` (63 lines, client, renders `null`)
Mounted ONLY by `SiteShell` (site-shell.tsx:31). Loads `https://accounts.google.com/gsi/client`, shows the Google
"Continue as…" prompt top right when `/api/auth/get-session` says no session; credential => `oneTapAction`.
**If the auth layout stops using `SiteShell`, One Tap disappears from /connexion and /inscription unless it is mounted
by the new layout** (see risks). It also still appears on the public site pages via `SiteShell`.

### 1.14 Other pieces in `src/components/verre/auth/`
- `standalone-card.tsx` (42 lines): `StandaloneCard` + `StandaloneMessage` for 404 / root error (`src/app/not-found.tsx`,
  `shell/standalone.tsx`). Not an auth page; belongs to the shell/system-page builder. Do not break it.
- `theme-toggle.tsx` (22): used only by `src/app/not-found.tsx`. The new look is light only (prototype has no dark): not mine.
- `password-reset-form.tsx`: see 1.7-1.8.

### 1.15 Onboarding (needs a session; `src/app/(onboarding)/`)
`layout.tsx` (34 lines): `StandaloneShell` (Aurora + `<main id="contenu">`), a 1100px column, header with `Brand` and a
ghost button `onboarding.signOut` -> `signOutAction` (the only exit for a user with no workspace), then a `GlassCard signal` holding the step.
Each step page is a server component that redirects by what the person is (all redirects must be kept):
- `/bienvenue` (`bienvenue/page.tsx`, 66 lines): no session -> `/connexion`. No workspace (`getUserContext()` null) ->
  `AboutStep mode="newcomer" spaceRole="owner" organizationName=null placement=null steps=onboardingSteps('soleOwner')`.
  With a workspace: no member row or `onboardedAt !== null` -> `/`. Role from `spaceRole`; steps `member` (two) /
  `soleOwner` (three) / `ownerWithTeam` (one: the fine print: **with only one step the stepper is hidden and the button says
  "Enter Leon"**). `mode = owner|member`; member gets `placement` fixed by an admin. `readyTools` = ids of
  `listCatalog().filter(onboardingReady)`.
- `/bienvenue/outils` (75 lines): no session -> `/connexion`; no workspace -> `/bienvenue`; no member -> `/`; step 1 not done
  -> `/bienvenue`. Builds catalog (locale, `/bienvenue/outils` as return), recommended tools from the department,
  `toolStates(catalog, conns, recommended)`, `canConnect = connectorsKey() !== null`, `consentUrl` (admin consent link from the
  catalog, never from the URL), `nextHref` (`/bienvenue/collaborateurs` for a sole owner else `/bienvenue/pret`), `notice =
  oauthNotice(params, locale)` (`?branche=` / `?erreur=` return from a provider), `connecting = ?etape=brancher || notice`, `chosen`
  from cookie `leon_outils` (httpOnly, per user, 7 days, path `/bienvenue`), `codeCommand = installCommand()`,
  `codeInstructions = claudeCodeInstructions(...)`.
- `/bienvenue/collaborateurs` (40 lines): needs step 1 done and `canInvite(ctx)` (else `/`); `TeammatesStep` with `you`.
- `/bienvenue/pret` (26 lines): needs step 1 done; `DoneStep owner={role==='owner'}`.
- Server actions `bienvenue/actions.ts` (135 lines): `completeAboutStepAction(prev, formData)` (state `{errors: {organizationName|department|job|seniority|size|form: code}}`
  where the CODE is an `onboarding.errors.*` key translated at render so a language change re-translates; newcomer creates the organization only
  when the whole form is valid; owner -> `completeOwnerStep` then `/` if not alone else `/bienvenue/outils`; member -> `completeMemberStep` -> `/bienvenue/outils`;
  `onboardedAt` already set -> `/`; no session -> `/connexion`) and `chooseToolsAction(formData)` (reads checkbox `outils`, sets cookie
  `leon_outils`, redirects `/bienvenue/outils?etape=brancher`). Teammates uses `createInvitationAction` from `src/app/(app)/reglages/actions.ts`; language uses
  `setLocaleAction` from the same file (cookie `leon-locale`).
- `src/lib/onboarding.ts` (128 lines): pure lists, NOT UI. `DEPARTMENTS` (11, each with `jobs[]` ending `other`, and `tools[]`), `SENIORITY_LEVELS` (8; DB value = index+1),
  `COMPANY_SIZES` (`1-10`, `11-50`, `51-200`, `201+`), `GOALS` (6), `isDepartment`, `isJobOf`, `seniorityId`, label-key helpers
  (`departmentLabelKey`, `jobLabelKey`), `onboardingSteps(path)`. Do not touch; the UI keeps using these.

### 1.16 Components of `src/components/verre/onboarding/`
| file | lines | what | state/props |
|---|---|---|---|
| `steps.tsx` | 67 | `OnboardingSteps({steps,current})`: `<ol aria-label=steps.label>`, circled numbers, check when done, `aria-current=step`, sr-only `completed`; null if < 2 steps; < 640px only the current name shows | keys `onboarding.steps.{label,about,tools,teammates,completed}` |
| `about-step.tsx` | 318 | step 1 form + `AboutPreview` | props `mode, spaceRole, userName, organizationName, placement, steps, readyTools`; local state `company, chosen{department,job,seniority}, size, goals`; manual submit (`startTransition(formAction(FormData))`) because React resets Radix Select after an action |
| `placement-fields.tsx` | 125 | `PlacementFields` (department, job (disabled until a department; changing department empties job), seniority selects) + `usePlacementForm` hook (errors as codes `onboarding.inviteErrors.*`, `reject()` flushSync + focus first `[aria-invalid=true]`) | shared with Settings > Team (invite) and member edit: **other area imports it** |
| `preview.tsx` | 122 | `AboutPreview` + `PreviewCard`: "profile" card (initial, name, job, badges seniority/department/role), "Leon will suggest connecting" tool icons (only `readyTools`), "Things you can ask in Chat" (two `asks.<dept>.one|two` questions), closing line `preview.settingUp` | `PreviewCard` also used by tools-step and code-tools-card |
| `tools-step.tsx` | 682 | step 2, two phases (choice form / queue) + right column + `ToolDialog` | see 1.17 |
| `tools-model.ts` | 98 | pure: `ToolState`, `onboardingReady`, `toolStates`, `codeToolsFirst`, `defaultChecked`, `connectQueue`, `TOOLS_COOKIE`, `toolsCookieValue`, `chosenTools`, `nextAfterTools` | tested (`tools-model.test.ts`): do not change |
| `code-tools-card.tsx` | 93 | "Your coding tools": 4 tool names with logos (Claude Code, Codex, Cursor, Antigravity: neutral terminal icon for Codex and Antigravity), "Install with Claude Code" (`CopyButton` of the instructions, only if `instructions !== null`), "Install in a terminal" (`CodeLine` of `curl -fsSL <leon>/install | sh`), links "What gets sent" -> `/reglages#ordinateurs` and "Documentation" -> `/documentation` (new tab, sr-only `common.newTab`) | props `command, instructions`; tested (`code-tools-card.test.ts`) |
| `teammates-step.tsx` | 252 | step 3: one card per teammate (`InviteForm` then the created link with `CopyButton` + `linkNote`), "Add a teammate", `Enter Leon` / `I'll invite people later`, **leave-confirm Dialog when a created link was never copied** (`leaveTitle` plural by count, `leaveDescription`, `stay`, `leave`), right: org preview (you + each draft/created) | props `steps, organizationName, you`; state `teammates[{id, created, copied}]`, `leaving` |
| `invite-form.tsx` | 89 | `InviteForm({onCreated, secondaryAction?})`: optional `name` (help `nameHint`, placeholder), `PlacementFields`, `Create link` disabled until department+job+seniority; `createInvitationAction({name,...placement})`; shared with Settings > Team | **other area imports it** (Settings team) |
| `done-step.tsx` | 40 | step 4 "You're in": check disc, title `done.title`, lead `done.lead`, button `done.openChat` -> `/discussions`; right panel with `ownerReady` ("Setting up your workspace") or `memberReady` ("Your workspace is ready") | prop `owner` |

### 1.17 `ToolsStep` states and controls (tools-step.tsx)
Props: `states, viewerId, now, canConnect, consentUrl, nextHref, steps, notice, connecting, chosen, codeCommand, codeInstructions`.
- **Phase "choice"** (`!inQueue`, a real `<form action={chooseToolsAction}>`): title `tools.title`, lead `tools.lead` (explainer), `ReturnNotice`
  (from `connexions/return-notice.tsx`: the provider's return, success/error, plus the admin consent link), `CodeToolsCard` at the top if
  `codeToolsFirst(states)` (GitHub or GitLab recommended) else at the bottom; fieldset `readyTitle` with `ChoiceTile`s: free tool = `<label>`
  with sr-only checkbox `name="outils"`, logo (36px), label, badge `recommended`, note `private` / `shared`; picked = accent border; tool already mine =
  read-only with check and `connected`; mine but broken = no check, note `reconnectNeeded` in warning colour; team-connected = `connectedBy {name}` with check.
  If none ready: sentence `noneReady`. `SoonList`: section `soonTitle` with up to 8 greyed names (recommended first) + `soonMore {count}` + sentence `soonText`.
  Footer: if `toConnect > 0`: submit `connectCount {count}` (plural) + link `skip` -> `nextHref`; else primary link `nextLabel` (`teammates.enter` when next is `/bienvenue/pret`, else `continue`).
  Defaults: checked = cookie choice or recommended+free+ready (`defaultChecked`).
- **Phase "queue"** (`connecting && queue.length > 0`; else back to choice): back link `edit` ("Change my selection") -> `/bienvenue/outils`, title `connectTitle`,
  lead `connectLead`, `ReturnNotice`, progress text `progress {done,total}` + `role=progressbar` (animated bar), list of `QueueItem` (numbered circle that turns into a check, logo,
  label, status `connected` / `reconnectNeeded` / `toConnect`; button `reconnect` (opens the tool dialog) or `connect` (opens the form below the row, `userOpened`, focuses `[data-autofocus]`);
  the open row unfolds `AddConnection entry onAdded returnTo="/bienvenue/outils"` plus `connectorsUnavailable` sentence when `!canConnect`, plus `item.warning` with warning icon; sentences `privateTool` / `sharedTool` from `connections.*`).
  Only one row open: `current` = asked one if still free else first free. After all done: success Notice `allDone` + primary link; else link `later`. On `onAdded`: toast `connections.connectedToast`, `router.refresh()`.
- **Right column** (always): choice phase `selectionTitle` (list of the queue with status) or `none`; queue phase `howTitle` + `how.one|two|three`; `alreadyTitle` list of tools connected by a teammate (`connectedBy`), with `ownConnected` check or button `connectOwn` (opens `ToolDialog` for my own account) + `ownHint`; always `nextTitle` + `nextText`.
- `ToolDialog` (from `connexions/tool-dialog.tsx`): reconnect my broken connection or connect my own account to a team tool; on close always `router.refresh()`; focus management refs (`opener`, `mainBox`, `focusPending`).
- Cross-area dependencies: `ReturnNotice`, `AddConnection`, `ToolDialog` (connexions builder), `toast`, `rise`, `ToolIcon`, `PROVIDER_LABELS`.

---------------------------------------------------------------------------------------------------------------------

## 2. The prototype of this area (what it shows exactly)

Files: `P/signin.html` (86 lines), `signup.html` (88), `forgot.html` (74), `auth.css` (102), `auth.js` (124); they load `../css/tokens.css`,
`../css/ui.css`, `app.css`, then `auth.css`; scripts `app.js` (helpers: `Leon.validate`, `fieldError`, `busy`, `param`) then `auth.js`. `body.auth`, NO sidebar/shell.
- Skeleton (all 3): `a.skip`, `header.auth__bar` (64px: only the brand mark + "Leon", left), `main.auth__desk#main` = CSS grid `440px | minmax(0,480px)`, centred, gap `clamp(56px,9vw,144px)`;
  left: `.auth__sheet` (32px padding, `--sheet`, 1px `--line`, `--r-l`, `--sh-2`) holding a `section.view` with `<h1>` and the form, then `p.auth__alt` on the desk under the sheet ("Don't have an account?" + `.linkbtn`);
  right: `aside.auth__pile` = the home page's pile of 3 originals (`.doc.sheet.c1/c2/c3`, flags 1-3 `.flag--left`, the top one `is-sweep` open at its passage with a `<mark class="hl hl-1">`, the others only a title), sheets lie straight (rotate none), `animation: arrive` once on the top sheet; caption `p.fict` "Fictional example".
- **signin.html**: h1 "Sign in" (no sub-title). `.alts` (grid gap 8): `Continue with Google`, `Continue with Microsoft` (`.btn.btn--line.wide`, 18px inline logo svg), `Company SSO` (`#sso-open` anchor `#sso`) which unfolds `form.sso#sso` (`:target`, grey `--n-50` block: label "Work email", `.hint` "Leon sends you to your company's sign-in.", `Continue`); then `p.or` "or with your email" (left aligned, hairline to the right); form `.auth__form`: Email (value prefilled demo), Password with `.labelrow` ("Forgot your password?" `.linkbtn` at the right of the label) and `.pw` (a "Show"/"Hide" `.btn--quiet.btn--xs` at the right inside the field, inserted by JS: hidden without script), ink `.btn.wide` "Sign in". Auth buttons are 40px (the door is a step larger than the app's 36), 44px under 900px.
  Refusal: under the PASSWORD, `p.field-error[role=alert]` "Incorrect email or password." (`?state=error` or a password containing "wrong"); the password is emptied and focused. Validation `Leon.validate` writes "Email is missing."/"This is not an email address." under `[data-req]` fields. Busy: `Signing in…`; social: `Opening Google…`; SSO: `Opening your sign-in…` / `Checking…` then refusal text `auth.ssoNotFound` under the field (the `.hint` hides when a refusal shows).
- **signup.html**: h1 "Create a workspace" (`?invite=1`: "Join Kestrel Studio", no company field, no "Sign in" link, no social: it actually keeps them but their href goes Home; submit "Join the workspace"). Same `.alts` (no SSO), `or`, form: "Company name" (single), a `.pair` (Name | Email), a `.pair` (Password | Confirm password), then `ul.rules` (two marks "At least 8 characters", "Passwords match" that fill with the tick; hidden when a refusal is shown on those two), ink "Create workspace". Refusals under fields use the product's words (company 2-100, email taken, 8-128, don't match).
- **forgot.html**: h1 "Forgot your password?", form: Email + ink "Send reset link"; on send the SAME sheet swaps (`:target #sent`) to `h1 > .mark.is-on` "Check your email" + p "If this address matches an account, we've just sent a reset link." + `.btn--line.wide` "Back to sign in"; the "Back to sign in" `.auth__alt` under the sheet hides.
- Under 1100px grid 420|440; under 900px one column (pile below, 48px gap, 44px controls, `.labelrow .linkbtn` 44px target); under 600px `.pair` becomes one column and sheet padding 24/20.
- Not in the prototype: 2FA step, `verifySent` view, `?supprime=` and `?error=` banners, the invitation page ("expired", "join as"), reset page, authorize pages, language choice, One Tap, `Notice` blocks (the prototype has NO banner kit piece: form-level refusals are always a `.field-error` line), dark theme, the onboarding.

---------------------------------------------------------------------------------------------------------------------

## 3. Mapping prototype -> real, and the work

### 3.1 Shared frame: new `(auth)/layout.tsx`
- Replace `SiteShell` + `GlassCard` + `AuthAside` by: skip link, `header.auth__bar` (brand = existing `Brand` from `components/verre/shell/brand.tsx`, linked to `/`), `main.auth__desk#main` (class names as in P, ported to a real stylesheet next to the layout or into `globals.css`; tokens come from the shared token port), the sheet `.auth__sheet` around `{children}`, `p.auth__alt` is per page (inside page JSX), and the pile (right).
- Pile: new `src/components/auth/auth-pile.tsx` (replaces `components/site/auth-aside.tsx`; delete that file only when the public site has no other user: check `rg AuthAside` = layout only) rendering the 3 `.doc.sheet` markup of `P/signin.html:58-76` (static, `aria-hidden` on the two lower sheets, top one `aria-label`), plus `.fict` "Fictional example" (new i18n key e.g. `auth.pileCaption`; texts of the sheets ("ACME monthly check-in" etc.) either as messages `auth.pile.*` in en + fr, or reuse `useSiteContent().demos` if the public-site builder ports the same pile: coordinate, same content as the new public Home page `P/../index.html`). Logos `granola`, `hubspot`, `linear` from `public/logos` (check they exist; real repo uses `/logos/<id>.svg`).
- Show the pile only where it is decoration, decided by pathname allow-list inside the client `AuthPile` (as `AuthAside` already does with `usePathname`): connexion, inscription, mot-de-passe-oublie, reinitialiser, invitation. NOT on `oauth/autoriser`, `ordinateur/autoriser`, `ordinateur/connecte`: these are consent decisions, the sheet alone, centred on the desk, `max-width` 560 for the usages text (own modifier `.auth__sheet--wide`). (Builder's call; say so in the PR.)
- **Must carry over from the old layout** (otherwise lost): (1) `GoogleOneTap` (mount `{socialProviders.google && <GoogleOneTap clientId=.../>}` in the layout); (2) a language choice: the old footer bar was the only place on sign-in pages: put the existing `LanguageSwitch` form (site-footer.tsx:15-38, `setLocaleAction`) as a quiet text control at the right of `.auth__bar` ("English / Français", `lang=` attributes, `aria-current`), no new sentence; (3) the `MotionSwitch` ("stop animations") goes away with the Aurora (the new look has `prefers-reduced-motion` handled globally); (4) the footer tagline/(c) line disappears.
- Fonts/tokens: the real app loads Manrope + Inter (src/app/layout.tsx); the prototype is Schibsted Grotesk + STIX Two Text on white. Root font/token swap is the shared-foundation builder's job; this area only consumes `--sheet --line --r-l --sh-2 --ink --ink-2 --danger --ok --desk` etc. Root `<html data-theme="dark">` default must not be what the auth pages render in: new look is light.

### 3.2 `/connexion` <- `signin.html`
- Keep `connexion/page.tsx` logic and the props passed (tests). Title block: `<h1>` = `auth.signIn`.
- `?supprime=` success banner and `?error=` error banner are not in P. They are page-level messages, not field refusals: render as one quiet line above the first control, inside the sheet, under the h1: a `<p role="status">` (success: ink, with the `mark is-on` highlighter on the first words? no: plain 14px `--ink` for success, `--danger` 500 for error, no icon box, no tinted rectangle). A new tiny component `AuthMessage({tone:'ok'|'error', live})` in the auth folder replaces every `Notice` use of this area (reuse everywhere below). Text unchanged (`deleteAccount.*`, `auth.socialNotLinked/socialFailed`). The long `socialNotLinked` is allowed (it states what to do).
- `AuthForm` (page `connexion`): drop `GlassCard`-era classes; fields use the kit markup (`.label`, `.field` 40px, `p.field-error[role=alert]` under the field) in place of `Field/Input` from `verre/ui/form.tsx`, OR restyle `Field/Input` tokens (smaller change; Field is shared with Settings: coordinate with the foundation builder, do not fork). Email + password; `.labelrow` puts `forgotLink` at the right of the password label (it is under the form today; only when `canResetPassword`).
- Show/Hide: P puts `.btn--quiet.btn--xs` inside the field (28px) on the right; same React state `visible`; keep aria labels. Also keep on sign-up's password only.
- `OtherSignIn` (above the form, hidden in 2FA): render `.alts`: provider buttons `.btn.btn--line.wide` with the official 18px marks of `P/signin.html:33-34` (the real product has none today: add Google and Microsoft SVGs inline) ; SSO button `Company SSO` with the building icon (P:35); when opened the form becomes the grey `.sso` block with `.hint` (= `ssoHelp`) hiding when a refusal shows; Escape closes it (P `auth.js:70-75`; the real button is not an anchor/`:target`, keep the `ssoOpen` state). Divider `.or` = `orWithEmail`. Each provider remains its own `<form action={socialSignInAction}>` with hidden `provider/token/retour`.
- 2FA step: no prototype. Same sheet, same h1 (`auth.signIn` kept), prompt (`twoFactorAppPrompt`/`BackupPrompt`: one-line `.hint`, they say what code to enter; the backup version is a real warning about single use, keep both), one field `.field` (autofocus, same inputmode rules), `lostPhone`/`useApp` as `.linkbtn` under the field, `errors.form` as `field-error` under the field (use `codeWrong` under the code field), ink `.btn.wide` "Verify". The refusal line is a `p.field-error` under the code field for both `errors.code` and `errors.form`.
- Form-level refusals (`tooManyAttempts`, `verifyFirst`, `wrongCredentials`): P puts the credentials refusal under the password. Do that for `wrongCredentials` (message goes to the password field's error slot; shake and focus kept via `useAnimate`, motion tokens `--fast`). `tooManyAttempts` and `verifyFirst` go in one `p.field-error` line directly above the ink button (no tinted box), `role=alert`; `signedUpNotIn` keeps its "Sign in" action as `.btn--line.btn--xs` next to the text.
- Pending: ink button becomes `Please wait…` (`auth.sending`; the prototype says "Signing in…": real key is generic, keep the real one) and `aria-busy`; the `.btn[disabled]` look of the kit; sr-only `role=status` kept.
- Footer: `p.auth__alt` under the sheet on the desk: `noAccount` + `.linkbtn` `createWorkspace`.
- Tests to keep green: `connexion/page.test.ts`, `auth/actions.test.ts` (no UI).

### 3.3 `/inscription` <- `signup.html`
- Same `AuthForm` (page `inscription`). Field order and layout of P: company (full), then `.pair` Name | Email, `.pair` Password | Confirm password. The real order is name, email, password, confirmation, company: **the DOM order may change but `name=` attributes stay; focus-first-invalid uses `[aria-invalid=true]`, autofocus goes to the first VISIBLE field (company in P, name in real: keep name first to match `autoFocus` index 0 or move autoFocus to company; builder's choice, say which)**. `companyHint` ("Creates your team's workspace.") is an explainer: drop it visually (key stays).
- Rules `ul.rules` (two marks) replace the "✓ / ○ + text" lines (`passwordMinLength`, `passwordsMatch` keys); hidden when password/confirmation is `aria-invalid` (`.auth__form:has(...)`, P `auth.css:51`); in the real form the second mark shows only once the confirmation has text today: P shows both always: follow P.
- Footer `haveAccount` + `signIn`. `OtherSignIn` as 3.2 but providers + sso without `returnTo`.
- `verifySent` success view (`state.message`): P has the "Check your email" pattern for forgot: reuse it: same sheet, `h1 > span.mark.is-on` "Check your email"? the real title key is `createWorkspace`: keep the h1 `createWorkspace` and show the message as `<p role="status">` (14-15px ink) + a `.btn--line.wide` "Sign in" -> `/connexion` (replaces the footer link; hide `auth__alt`). No tinted Notice.
- The post-signup path is onboarding (section 3.9).

### 3.4 `/invitation/[token]` (no prototype page; P has `signup.html?invite=1` which is the model)
- Valid + not signed in: `AuthForm page="invitation"`: h1 `joinWorkspace`, then the sentence `invitedTo` as the one allowed paragraph (consent text: names the workspace), as P's "Join Kestrel Studio" title says it (P puts the name IN the title: the real key `joinWorkspace` is "Join the workspace" and `invitedTo` carries the name: keep both, the sentence under the h1 in `--ink-2` 14px). Fields name, email (hint `inviteEmailHint` -> keep as `.hint`: it states a rule), password, confirmation + the two rules; submit ink `joinWorkspace`; `OtherSignIn providers sso=false token`. No `auth__alt` (no "Sign in").
- Valid + signed in without workspace: h1 `joinWorkspace`, `joinAs` sentence (name + email: who joins what, keep), one ink `.btn.wide` `joinWorkspace` in the `joinWithSessionAction` form. Pile shown.
- Invalid ("expired"): h1 `expiredTitle`, `expiredText` (the product's sentence: keep), `.btn.btn--line.wide` `signIn` (not ink: nothing to confirm, but it is the only action, so it may be the ink pill: use ink, one per view). Same sheet, pile shown.
- Keep metadata (`referrer: 'no-referrer'`, noindex).

### 3.5 `/mot-de-passe-oublie` <- `forgot.html`
- h1 `forgotTitle`. DROP `forgotIntro` (explains the screen; P has none). `emailEnabled` false: h1 + the sentence `emailNotSetUp` (it is a real state, say what is wrong: keep) + `.btn--line.wide` `backToSignIn`.
- Form: Email field (autofocus, `invalidEmail` under it) + ink `sendLink`; `errors.form` (`emailSendingOff`, `tooManyAttempts`) as `p.field-error` above the button.
- Success: P swaps the same sheet to `h1 > .mark.is-on` "Check your email" (new key `auth.checkEmailTitle`, en/fr) + `p[role=status]` = `resetSent` + `.btn--line.wide` `backToSignIn`. Real state is `state.message` from `useActionState` (no `:target`). Hide the `.auth__alt` "Back to sign in" while this view is shown (P `auth.css:72`); otherwise the `backToSignIn` link lives in `.auth__alt` (replaces the link inside the form).

### 3.6 `/reinitialiser` (no prototype): same sheet pattern as forgot
- h1 `newPassword`. With token: two fields (`newPassword` with `passwordHint` as `.hint`? it is a rule: keep as the two rules marks like sign-up, or keep `.hint`; use `.rules` for consistency with sign-up: marks `passwordMinLength` + `passwordsMatch`), ink `changePassword`; `errors.form` `resetLinkInvalid` as `p.field-error` above the button.
- Success `resetDone`: same "view that says it is done" as forgot: h1 stays `newPassword`? Better `h1 > .mark.is-on` with a new short key `auth.resetDoneTitle` ("Password changed") + `p[role=status]` `resetDone` + `.btn.wide` `signIn` (ink).
- No token / expired: h1 `newPassword`, `resetLinkExpired` + `.btn.btn--line.wide` `requestNewLink` -> `/mot-de-passe-oublie` (today it is a sentence ending with a link and a stray "."; the full stop is a literal in the JSX: remove).
- Pile shown.

### 3.7 `/oauth/autoriser` (no prototype)
Sheet alone (no pile), `.auth__sheet--wide`. Same server component, same form, same hidden fields; only markup and classes change.
- h1 `title` ("Connect an assistant").
- The client is "a thing": a `card` (88px, static, not a button) at the top: logo = initial `av` of `request.client.name` (no logo available), name = client name, caption = `returnToLocal` or `returnTo {host}` with the host in 600 weight (it is the only thing Leon verified: keep it visible and prominent; if the caption is too long, wrap: allow 2 lines). The `question` sentence is a long consent question: keep it as the one paragraph under the h1 (it names the workspace: security text, not a screen explainer) and shorten nothing (key unchanged); `declaredName` is a `.hint` under the card (it is a warning about trust) when the client is not a document client.
- Capabilities: label `can` (13px `--ink-2`) then the four items as `Leon.facts`-style rows (check icon + text, hairlines) or a plain list, one line each (no card per item).
- Warning `warning`: the kit has no Notice: show as a plain 14px `--ink` 500 sentence (NOT quiet grey: it is an anti-phishing instruction) directly above the buttons; no tinted box, no icon.
- Buttons stay `<button type=submit name="decision" value="allow|deny">` in the same `<form action={authorizeOAuthAction}>`: `allow` = the ink pill (`.btn.wide`), `deny` = `.btn.btn--line.wide`. DOM order: Authorize first (tests/a11y order today). Pending: `useFormStatus` is not used today (server form): optional; do not make it a client form unless pending state is added (no: keep server form).
- States: invalid client / invalid return view: h1 `invalidTitle` + `invalidClient|invalidReturn` sentence, no buttons (nothing to do: say what to do in the sentence, it already does). Redirect-only states have no UI.

### 3.8 `/ordinateur/autoriser` and `/ordinateur/connecte` (no prototype)
- Authorize: sheet alone, wide. h1 `title`; `question` sentence (names the workspace: keep); `warning` as in 3.7; the usages fieldset: kit has no checkbox: write one in the page's CSS with tokens: native `<input type=checkbox name="usage" value=... defaultChecked>` kept (not a custom button), `accent-color: var(--ink)`, 18px, label `usages.<u>.title` 500 14px, the three bullets always visible below (the consent text must be visible at the moment of decision: it is the exception to "details in the side panel"; 13px `--ink-2`, `t.rich` with `<code>` in `--mono` (real code: mono allowed)); the `usages.hint` ("An agent that ran the command... must never tick") stays as `.hint` above the list (legal/safety instruction). Hidden `usages`, `port`, `etat`, `empreinte` unchanged. Buttons: `allow` ink `.btn.wide`, `cancel` `.btn--line.wide`.
- Invalid view: h1 `invalidTitle` + `invalidText`.
- Connected: h1 `title` / `refusedTitle` with the highlighter on a success title only: `h1 > span.mark.is-on` for `title` ("Computer connected"); for refused: plain h1. Paragraph `done` / `refused` under it. No buttons, no pile (the tab is meant to be closed). Metadata unchanged.

### 3.9 Onboarding: new look with the same kit (no prototype)
General frame (`(onboarding)/layout.tsx`): drop `StandaloneShell` + `GlassCard`. Use the same `.auth__bar` (brand left, `Sign out` as `.btn.btn--quiet` right, form `signOutAction`), then the page on the desk (`--desk` background, flat) with sheets. The step content sits on `.paper`/`.auth__sheet` sheets, not in one big card (rule: a `.paper` never inside another). The layout must mount the same toast provider and the **side panel** used by the shell (the confirmation of "leave without copying" and the tool connection forms go there): if the shell builder exposes a `SidePanelProvider`, wrap it here. Stepper `OnboardingSteps`: keep markup/behaviour (`aria-current=step`, sr-only `completed`, mobile shows only the current name), restyle: 24px numbered circles -> ink-filled current, `--line-strong` future, check in `--ok`-free ink on done (no colour needed); connector hairline `--line`. It is not a rectangle, not a pill; one more ink element (current number): acceptable since it is not a button (say so).
Remove every "lead" explainer: `onboarding.lead`, `tools.lead`, `tools.connectLead`, `teammates.lead`? Exceptions that state product facts and stay: `teammates.lead` ("they'll see them, but can't change them") -> keep as one `.hint` (it is the rule about what invitees can edit); `tools.private` / `tools.shared` become the captions "Only you" / "Team" (P wording, same meaning); `locked`/`notSet` for a member keep (they say why a field is not editable).

**Step 1 About** (`about-step.tsx`, same props/state/submit): two columns: left `.auth__sheet` (520) with the form, right the preview (below). Title: `title` (owner/newcomer) / `memberTitle {organization}`; no lead.
- Language: group of two `.chip` (`role=group`, `aria-pressed`), same `chooseLanguage` (`setLocaleAction` + `router.refresh()`), `lang=` on each. Keep.
- Company (newcomer only): `.field` + label `company`, error `errors.company` under it; the name is shown in the preview as you type.
- Department / Role / Seniority: replace Radix `Select` in `PlacementFields` by the kit's native `select.field` (P `app.css:85`) with a first empty option `choose`; job `disabled` until a department (then the browser disables the select: this is a state, not a "disabled button at rest"; fine); keep `usePlacementForm`, the `onChange(next, field)` contract and the department-empties-job rule. `seniorityHint` ("Same scale in every company") becomes the `.hint`. **`PlacementFields` and `usePlacementForm` are imported by Settings > Team (invite and member edit): change them once and tell the Settings builder.** If the foundation builder restyles the shared Radix `Select` instead, nothing changes here. Manual submit (no `action=`) stays because Radix resets; with native selects the form could use `action`, but do not change the submit path.
- Company size and Goals: `.chip` groups (size: single; goals: multiple, `aria-pressed`, `goalsHint` "Pick all that apply" as the `.hint`). **Taste flag:** kit `.chip[aria-pressed=true]` is an ink fill; six pressed goals would break "one ink pill per view" next to the ink Continue. Specify a sibling `.chip--pick` (pressed = 1px `--ink` border + a check, no fill) for these two groups, written in the area's own sheet. Hidden inputs `department|job|seniority|size|goals` unchanged. Refusals (`errors.*` codes): `p.field-error` under the group; invalid group focus via `data-invalid` on the first chip as today.
- Member mode: replace the grey glass card (job, level badge, department badge) by one `statusrow`-style quiet row (kit `.facts` rows: "Role", "Seniority", "Department") with the lock line `locked {organization}` as `.hint`; or `notSet`.
- `errors.form`: one `p.field-error` above the button.
- Button: ink `.btn.wide` `continue` (or `teammates.enter` when only one step). `loading={pending}`.
- Preview (`preview.tsx`, same props `organization, userName, role, department, job, seniority, readyTools`): sheets lying straight on the desk like the pile, no uppercase-spaced titles: (1) a `card` (88px, static): `av` initials of `userName`, name = `userName`, caption = the job label if chosen else the role label (`preview.owner|admin|member`); org name shown in the section head `profileIn {organization}` -> as a plain `h2`; seniority and department badges are dropped from the preview (they are in the form beside it) OR kept as one caption `Senior · Product` (builder: caption has max one string; prefer `job · seniority`). (2) section `preview.connect` ("Leon will suggest connecting") with a flag `.tag` counting the tools and static `tile`s (52px) with `ToolIcon` logos (the `readyTools` of that department only); (3) section `preview.ask` with the two questions as the kit's ask tiles (static, no hover, no chevron). (4) the closing line `preview.settingUp` ("Setting up your workspace") as `.reading`-style line with the highlighter passing once. Under 1024px the preview goes below the form (today also).

**Step 2 Tools** (`tools-step.tsx`, same props, same model functions, same cookie): single wide column, no right-hand panel; `.page`-like width (max ~880), title only.
- Choice phase: `h1 tools.title`. `ReturnNotice` (connexions area): its provider-return message and admin-consent link must keep working: render with the same `AuthMessage` line + link, or the connexions builder's component if it ports it; a TODO for coordination.
- Two sections with flags: "Recommended" (`tools.recommended`, `.tag` count) = ready free tools in `recommended`, and the rest ("Ready to connect": `readyTitle`, `.tag` count). Each tool = `tile` (52px, `data-*`): the whole rectangle is the `<label>` of the real checkbox `name="outils"` (kept sr-only; native keyboard), caption "Only you" if `privateRaw` else "Team" (replaces `private`/`shared` sentences; keys stay), picked = 1px `--ink` border + check icon at right (not an ink fill); recommended badge disappears (section carries it). Already mine: static tile, caption "Connected" with check; team: caption `connectedBy {name}` with check; broken: `err` tile (red dot on the logo, caption `reconnectNeeded` in `--danger`) and clicking opens the tool panel to reconnect (was `connect(id)`).
- Coming soon: section head `soonTitle`, static muted tiles (no hover, same 52px), `soonMore {count}` as plain text after the last; DROP `soonText` and `noneReady` is a real state: keep as the empty state `<div class="empty"><h3>` with the sentence (one short line), no button.
- `CodeToolsCard` (`code-tools-card.tsx`): it is "a thing with instructions", so it becomes a `.paper` sheet with `h2 tools.code.title` ("Your coding tools"): four `tile`s (static) Claude Code, Codex, Cursor, Antigravity with their logos (real `public/logos` where present; terminal icon for Codex, Antigravity: keep the rule "never hand-drawn logos"); under it two blocks: "Install with Claude Code" (`CopyButton` ink? NO: `.btn--line`) with its `withClaudeLead` sentence kept (it tells the user what to do and that Claude never ticks the boxes: security text), and "Install in a terminal" with `CodeLine` (real mono output block: the kit's terminal panel look `--term`, `--mono` is allowed for real code), links "What gets sent" and "Documentation" as `.linkbtn` (documentation keeps `target=_blank` + sr-only `newTab`). `lead` ("Open a terminal ... Your browser will open...") kept (it is the instruction). Position rule `codeToolsFirst` unchanged. Hidden when `codeCommand === null`; the Claude block only when `instructions !== null`. Tests `code-tools-card.test.ts` must keep passing (it pins text).
- Footer: `toConnect > 0`: ink `.btn` `connectCount {count}` (submit of the form) + `.btn--quiet` link `skip`; else ink link `nextLabel`. (one ink pill per view)
- Queue phase: back link `edit` as `.btn--quiet` with the arrow icon; h1 `connectTitle`; drop `connectLead`; section head "Connected" style flag: `.tag` showing `done/total` with `aria-label` = `progress {done,total}` (replaces the text + animated progress bar; the bar and `role=progressbar` are dropped: record in the PR); list of `card`s (88px) in queue order: logo, name, caption = `connected` | `reconnectNeeded` | `toConnect`, `err` for broken; the card is a button: "Connect" opens that tool's connection form in the **side panel** (the unfolding row under the card is forbidden by the kit): panel body = `AddConnection` (same props `entry onAdded returnTo="/bienvenue/outils"`) preceded by the `privateTool|sharedTool` sentence as the panel's `.hint`, `item.warning` as a `.hint`, or `connectorsUnavailable` when `!canConnect`; `onAdded` = toast + `router.refresh()` + panel closes, and the next free tool becomes the one opened (the `current` logic stays). Reconnect and "Connect my account" use the same panel (`ToolDialog` is replaced by the panel the connexions builder ships; this area imports it: dependency). Order of work: connexions builder first.
- End of queue: `allDone` as the highlighter title `h2 > span.mark.is-on` + ink link `nextLabel`; else `.btn--quiet` `later`.
- "Already connected for your workspace" (`alreadyTitle`) becomes a section after the queue (both phases) with `tile`s: caption `connectedBy {name}`, at the right a 28px outline pill `connectOwn` (the kit's `pill` option; the whole tile opens the panel) or the check when mine (`ownConnected`); `ownHint` goes into the panel as `.hint`. `howTitle/how.*`, `selectionTitle` + `none`, `nextTitle/nextText` : DROPPED (explainers / duplicates of the picked state).
- `?etape=brancher`, `notice` handling, the cookie, `focus` management (`mainBox`, `opener`, `focusPending` for the Radix dialog) can be simplified once the dialog is a side panel whose provider returns focus itself (kit: `back:` option).

**Step 3 Teammates** (`teammates-step.tsx`, same props/state): left: one `.paper` per teammate (the form, or after creation the link), right: org-chart preview.
- h1 `teammates.title`; `lead` as one `.hint` (rule that invitees cannot edit), not a paragraph.
- `InviteForm` (`invite-form.tsx`): label `name` (+ `nameHint` as placeholder/hint), `PlacementFields` (see step 1), `Create link` = `.btn.btn--line` (NOT ink: the page's ink pill is `Enter Leon`), disabled until the three are chosen (state, not at rest: kit allows `disabled` only while incomplete; show it as `.btn[disabled]`). `errors.form` as `p.field-error`. It is also used in Settings > Team: same note as `PlacementFields`.
- Created: card shows name (or "No name" `noName`), `describe()` string, the link in a `.field` read-only/`select-all` + `data-copy` Copy button (the product's `CopyButton` restyled to `.btn--line.btn--xs`), `linkNote` ("Send it yourself. It works once and expires in 7 days." a fact about the link: keep as `.hint`). Autofocus on the copy button stays.
- `Add a teammate`: `.btn.btn--quiet` with the plus icon (new empty card at the bottom).
- Bottom: ink `.btn.wide` `enter`, `.btn--quiet` `skip` (links to `/bienvenue/pret`). If a created link was never copied (`uncopied > 0`): intercept the click and open a confirmation **in the side panel** (`Leon.panel.confirm` equivalent: title `leaveTitle {count}` plural, text `leaveDescription`, yes = `leave` (links to `/bienvenue/pret`), no = `stay`), replacing the Radix `Dialog`.
- Preview: kit pieces: one `card` (88px, static) "You" = `av` + name + caption `describe(you.placement)` + pill `you`; indented under it with a left hairline each teammate as `tile` (52px): `av` initials or `?`, name or `noName`, caption `describe()`, pill `linkCreated` (outline) for created; draft = same tile at 45% opacity with caption `draft`? (a draft has no content yet: show name "—" and no caption, no pill: builder's call). Section head = `organizationName` as `h2`. `previewLabel` stays as the section's aria-label.

**Step 4 Done** (`done-step.tsx`, `prop owner`): single sheet on the desk, no right panel (it only said "Setting up your workspace"/"Your workspace is ready"): h1 `done.title` ("You're in") with the highlighter (`.mark.is-on`, "Leon marks done"), lead `done.lead` ("Leon is reading your first sources. Ask your first question in Chat.") stays as the one sentence (it is the next action), the ink `.btn` `done.openChat` -> `/discussions`. `ownerReady`/`memberReady` become the `.hint` under the button or are dropped from the layout (they read as a status; the owner one says the workspace is being set up: keep as a quiet `.reading` line for owners, nothing for members). Remove the check disc.

### 3.10 Table: prototype piece -> real counterpart -> work

| Prototype piece | Real counterpart | Work |
|---|---|---|
| `body.auth` + `.auth__bar` + `.auth__desk` | `(auth)/layout.tsx`, `(onboarding)/layout.tsx` | rewrite both layouts (no SiteShell/GlassCard/Aurora); mount One Tap, language switch, toasts, panel provider |
| `.auth__sheet` | `GlassCard variant=raised signal` in the layout | one sheet component/class, light, `--sh-2` |
| `.auth__pile` (3 `.doc.sheet`) | `components/site/auth-aside.tsx` | new `AuthPile` (static, aria-hidden, pathname allow-list); delete AuthAside when unused |
| `h1` only (no sub) | `AuthForm` title + `forgotIntro`, `onboarding.lead`... | drop explainers, keep consent / rule sentences |
| `.alts` (Google, Microsoft, SSO) | `OtherSignIn` | style as `.btn--line.wide`, add the two inline brand marks, `.sso` block, `.or` divider; same forms/hidden fields |
| `.field` / `.label` / `.field-error` | `Field` / `Input` (`verre/ui/form.tsx`), `Notice` for forms | kit markup or restyled `Field`; no `Notice` anywhere in this area: new `AuthMessage` |
| `.pw` Show/Hide inside field | button inside `.relative` (auth-form.tsx:299-308) | same state; `.btn--quiet.btn--xs`, 28px |
| `.rules` (two marks) | "✓/○ + text" lines (auth-form.tsx:325-339) | SVG circle + tick, hide on refusal; keys unchanged |
| `.labelrow` with "Forgot your password?" | link under the form | move into label row; only when `canResetPassword` |
| `.btn.wide` ink (40px; 44px under 900) | `Button variant=primary size=lg` | one per view; `.btn--line.wide` for the rest |
| `.auth__alt` | `motion.p` footer with border-top | desk text under the sheet; hidden on done views |
| `forgot.html #sent` ("Check your email" + `.mark.is-on`) | `state.message` branch + success Notice | same sheet swap; new key `auth.checkEmailTitle` (en, fr) |
| `?state=error` password refusal | `errors.form === wrongCredentials` | message into password field's error slot; keep shake |
| `signup.html?invite=1` | `/invitation/[token]` page + `AuthForm page=invitation` | same form, no company field (already), no `auth__alt` |
| `.fict` caption | none | `auth.pileCaption` key (en/fr) |
| (none) 2FA, verify sent, banners, invitation expired/join-as, reset, authorize x2, connected | see 3.2-3.8 | designed with the same kit, no new component classes beyond `AuthMessage`, `.auth__sheet--wide`, checkbox row, `.chip--pick` |
| (none) onboarding | section 3.9 | cards/tiles/section flags/side panel/chips/native selects |

---------------------------------------------------------------------------------------------------------------------

## 4. i18n keys of this area (messages/en.json + fr.json; both files must stay in sync)

Used and kept as is: `auth.*` (every key listed in 1.3-1.12 plus `signIn, createWorkspace, createWorkspaceSubmit, joinWorkspace, joinWorkspaceMeta,
noAccount, haveAccount, invitedTo, email, password, name, confirmPassword, companyName, showPassword, hidePassword, show, hide, passwordMinLength,
passwordsMatch, sending, twoFactor*, authCodeLabel, backupCodeLabel, useApp, lostPhone, verify, forgotTitle, forgotLink, emailNotSetUp, backToSignIn,
sendLink, resetMeta, newPassword, changePassword, resetLinkExpired, requestNewLink, expiredTitle, expiredText, error messages, verifySent, continue*,
sso*, orWithEmail, socialNotLinked, socialFailed, joinAs`), `deleteAccount.doneAccount|doneOrganization`, `oauth.authorize.*`, `computer.authorize.*`,
`computer.connected.*`, `onboarding.*`, `claudeCode.*` (ask, copied, docs, withClaude, withClaudeLead, inTerminal, instructions), `common.newTab`,
`connections.{privateTool,sharedTool,connectorsUnavailable,connectedToast}`, `preferences.{english,french}`, `shell.signOut`? (`onboarding.signOut` is used).
Becomes unused after the port (leave in the file, remove only if a lint for dead keys exists): `auth.forgotIntro`, `auth.companyHint`, `auth.passwordHint` (if rules replace it),
`site.auth.*` (except what AuthPile reuses), `onboarding.lead`, `onboarding.tools.{lead,connectLead,soonText,howTitle,how.*,selectionTitle,none,nextTitle,nextText,progress}`.
New keys to add (en + fr): `auth.checkEmailTitle`, `auth.resetDoneTitle`, `auth.pileCaption` (+ pile sheet texts if not reused from the public site's content), optional `tools.team`/`tools.onlyYou` captions
(`onboarding.tools.private` -> "Only you", `.shared` -> "Team": reword the existing keys' values instead, fr too).
Prototype wording to respect: "Team" / "Only you", sentence case, no exclamation, no emoji, "Continue", "Done", "Not now", "Keep it".

---------------------------------------------------------------------------------------------------------------------

## 5. Every state to be drawn (checklist for the builder)

Sign-in: rest; field refusals (email, password); `wrongCredentials` (password emptied, focused, shaken); `tooManyAttempts`; `verifyFirst`; pending ("Please wait…");
2FA app code; 2FA backup code; 2FA refusals (`codeFormat`, `codeWrong`); provider buttons present/absent per `socialProviders` (none and no SSO: block and divider vanish);
SSO closed / open / refused (`ssoNotFound`, `invalidEmail`) / pending; `?supprime=compte|organisation`; `?error=` (`socialNotLinked`, `socialFailed`); with `retour` hidden fields (authorize round trip);
`canResetPassword` false (no link). Sign-up: rest; each field refusal; `emailTaken`; `signUpFailed`; `signedUpNotIn` (+ Sign in action); `tooManyAttempts`; `verifySent`; rules marks; pending.
Invitation: valid (form), valid + signed in (join-as), expired. Forgot: rest, refusals, `emailSendingOff`, `tooManyAttempts`, sent (`resetSent`), e-mail disabled (`emailNotSetUp`).
Reset: with token, mismatch / length refusals, `resetLinkInvalid`, done, no token. OAuth authorize: consent (document client vs declared name), loopback vs host, invalid client, invalid return.
Computer authorize: with and without `usages`, one checkbox unticked, invalid params. Connected: done, refused.
Onboarding: step 1 as newcomer / owner / member (placement fixed / not set) / admin; 3, 2 or 1 stepper entries; field and group refusals; `form` refusal; pending; language switch re-translates the codes.
Step 2: choice (none ready, some ready, recommended, mine, team, broken, soon list), provider return success / error / admin-consent link, queue (open row, connected, broken, `!canConnect`, tool `warning`, all done, later), code tools present/absent, `instructions` null.
Step 3: empty card, created link (copied / not copied), leave confirm (plural), preview with drafts. Step 4: owner / member.
Dark theme: not designed in the prototype; the root default (`data-theme="dark"` in `src/app/layout.tsx`) must not leak into these pages. Reduced motion: shake, sweep, highlighter off (`isInstant()`).

---------------------------------------------------------------------------------------------------------------------

## 6. Gaps (both directions)

Prototype -> real (the real product does more): 2FA code step; `verifySent`; `?supprime=` / `?error=` banners; One Tap; language choice on the public auth pages;
`returnTo`/`retour` for the CLI and assistant round trips; invitation join-as and expired states; the reset page; the two authorize pages and "connected"; the whole onboarding;
`emailEnabled=false` branches; per-field and form-level refusals with rate limit; SSO appears only when a workspace has verified one; the invitation page has no "Sign in".
Real -> prototype (the prototype does more or differently): brand marks of Google/Microsoft (P has them, real has none); the labelrow forgot link; Show/Hide inside the field; the always-visible rules; the pile;
the prototype's `Signing in…` / `Creating…` busy words (real keeps `Please wait…` unless new keys are added); the prototype prefills demo values (never in the real thing); the prototype's "Join Kestrel Studio" title (real = title + `invitedTo`).
Kit lacks: a checkbox; a banner/notice (deliberately: use a text line); a stepper; a segmented/multi chip (`.chip--pick`); a static (non-interactive) card/tile variant; a "code" block for the install command (use the terminal panel look of the public site, `--term`); a file/side panel React component (shell builder).

## 7. Risks

1. **One Tap and language switch live in `SiteShell`/footer bar**: dropping `SiteShell` from the auth layout silently removes both. Mount them in the new layout (sections 1.13, 3.1).
2. **Tests pin the pages' props and some copy**: `connexion/page.test.ts` (AuthForm/OtherSignIn element types and props), `oauth/autoriser/page.test.ts`, `ordinateur/autoriser/page.test.ts` (usage text mot pour mot, hidden fields), `bienvenue/*/page.test.ts` (mocked components `AboutStep`, `ToolsStep`...: keep export names and props), `tools-model.test.ts`, `code-tools-card.test.ts`, `tools-step.test.ts`. Keep file names and exports.
3. **Authorize pages are security decisions**: keep the host line, the `declaredName` hint, the warning and the checkbox texts clearly visible (do not "quiet" them away), keep plain `<form action>` + `<button name=decision>` working without JS, keep `referrer: 'same-origin'`, keep `space` hidden field. A tinted-box-free design must not reduce their contrast below the app's text.
4. **Shared components**: `PlacementFields`, `usePlacementForm`, `InviteForm` are used by Settings > Team; `AddConnection`, `ToolDialog`, `ReturnNotice` belong to Connections; `PreviewCard`, `Field/Input/Select`, `Button`, `Notice`, `Pill`, `Dialog`, `CopyButton`, `CodeLine`, `toast` are shared UI. Do not fork them: restyle once in the foundation or coordinate. Order: foundation tokens/UI -> connexions side panel -> this area's step 2.
5. **Radix Select vs native `select`**: the manual submit and the `data-invalid`/`aria-invalid` focus logic depend on the control. If you swap to native, re-test: focus on the first invalid control, changing department empties role, job disabled without a department, hidden inputs still carry the values.
6. **Form reset on server actions (React 19)**: `AuthForm` uses `action={...}` (form resets are masked by `values`/`defaultValue`); do not add `useState`-controlled password fields on connexion (sign-up needs them for the rules; connexion deliberately has none). Onboarding forms use manual submit for the same reason.
7. **Focus and a11y that exist today**: first-invalid-field focus, shake with `isInstant()`, `aria-live` rules, `role=alert` refusals, `role=status`, `aria-current=step`, sr-only labels (`completed`, `newTab`), 16px fields on touch (iOS zoom), 44px targets under 900px. Do not lose them to "match the prototype".
8. **Light-only prototype vs dark default**: `src/app/layout.tsx` sets `data-theme="dark"` and a THEME_SCRIPT; the auth pages must render in the new light look. Decide with the foundation builder whether dark is dropped globally.
9. **Pile content is fictional**: it needs the visible "Fictional example" caption and must stay `aria-hidden` (decorative; the top sheet has a label). Do not use real customer names. It adds three images (`/logos/*.svg`): check they exist and that nothing loads from the prototype's `../../shared/logos`.
10. **Onboarding cookie `leon_outils`** (httpOnly, path `/bienvenue`) and the provider-return flow (`?branche=`/`?erreur=` back to `/bienvenue/outils`, `returnTo="/bienvenue/outils"`) must survive the move from the Radix dialog to a side panel; test the round trip with a real OAuth provider or at least the return URL.
11. **Hidden-field/`retour` chains**: `/connexion` -> `/ordinateur/autoriser` and `/oauth/autoriser` rebuild their return from validated parameters: any component rewrite that drops `returnTo` from `AuthForm` or `OtherSignIn` breaks `leon login` and assistant connection.
12. **fr.json**: every new key and every reworded value must exist in both languages (`next-intl` typed from fr.json: the build fails on a missing key).
13. Taste calls flagged for David, not decided here: pile on the invitation/reset pages (proposed yes) and not on the authorize pages (proposed no); dropping the right-hand preview on onboarding steps 2-4; goals/size chips as `.chip--pick`; keeping consent sentences despite "no sentence that explains a screen".
