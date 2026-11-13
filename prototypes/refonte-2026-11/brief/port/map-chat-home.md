# Port map: chat-home (Home, search, answers, discussions)

Root of every real path below: `/Users/david/Downloads/Business/code/leon/.claude/worktrees/leon-interface-redesign-715484/`.
Prototype folder: `prototypes/refonte-2026-11/papier/app/` (called `proto/` below). Read-only analysis, nothing edited.

Vocabulary: "real" = today's React code. "Verre" = the rejected look. The real code is in French identifiers
(`charge`, `flux`, `repos`, `indisponible`...); the state names below are the real ones.

---------------------------------------------------------------------------------------------------------------

## 0. The five things to know before touching anything

1. **The real Home is the Search page.** `src/app/(app)/page.tsx` renders the search bar, filters, results and the
   streamed "Leon's answer" card. There is no briefing, no greeting, no recent discussions on it. The new Home
   (greeting + morning briefing + "Try asking") is a NEW screen; it has no component to transform.
2. **The morning briefing is not shown to anyone signed in.** It exists only behind an API token
   (`GET /api/v1/briefing`, `src/server/api/briefing-routes.ts:16`, read by the Claude Code start hook / `leon
   briefing`) and the MCP tool `briefing` (`src/server/mcp/tools/briefing-tool.ts`). No page, no session route, no
   server action reads it. And it is **per project (a GitHub repo), written for code sessions**, not a cross-tool
   digest like the prototype's (Gmail, Notion, Linear, Intercom, Granola). See section 4.
3. **Search and discussion are two separate products today**, with different routes, cost, data and limits (section 5).
   The prototype's single "Chat" screen is the discussion; the search results list has no place in it.
4. **A real answer is Markdown text with inline `[n]` markers and a per-message citation list, not a list of
   sentence objects.** The prototype's `segments: [{text, cites}]` must be derived from it (section 6).
5. **A real citation carries no tool, no author, no date, no visibility.** Only `{n, sourceId, passageId, title,
   url}` (`src/lib/discussion-events.ts:31`). The prototype's source tile needs logo + "Only you". Needs a small
   server addition (section 6.3).

---------------------------------------------------------------------------------------------------------------

## 1. Real files of the area (all opened in full)

### Routes (`src/app/(app)/`)
| File | Lines | What it does |
|---|---|---|
| `page.tsx` | 74 | `/` = Search. Server component. `requireUserContext()`, `fromSearchParams(q,page)`, `runSearch(ctx,q,page)` (only if `q`), `answer = hits>0 && page===1 && getLlm(env)!==null`. No `q`: `PageHeader`+`SearchBar home`+`Welcome`. With `q`: sr-only h1, `SearchBar`, `SearchFilters`, `SearchResults`. Props to `SearchResults`: `q,page,pages,results,terms,count,unknownPeople,failed,answer` (key = q+page so preview resets). |
| `actions.ts` | 39 | `signOutAction`; `previewPassageAction(passageId)` -> `{ok:true,preview:PreviewView}` or `{ok:false,reason:'introuvable'|'erreur'}` (uuid check, `fetchPassageContext({...ctx,equipe:true})`, message of a failure never leaves). SHARED by search preview and discussion preview. |
| `discussions/page.tsx` | 114 | `/discussions` = new question + list. `listDiscussions`, `readOnboardingMember`, `readAboutSuggestion` (failure swallowed: card is optional). `examples` = `onboarding.asks.<department>.one/two` ONLY when the user has 0 discussions and a department. `modelAvailable = getLlm(env)!==null` -> `Notice warning` `discussions.modelUnavailable`, form `disabled`. Renders `AboutSuggestionCard`, `PageHeader` (title, subtitle, "Only you can see your discussions"), `NewDiscussionForm`, then `Section "Your discussions"` with `DiscussionRows` or `EmptyState` (links to `/`). |
| `discussions/[id]/page.tsx` | 39 | `/discussions/:id`. `getDiscussion(ctx,id)`; `notFound()` if invisible/unknown/someone else's. Passes `discussionId,title,initialMessages[{id,role,content,citations,actions}],modelAvailable,appOrigin=new URL(env.BETTER_AUTH_URL).origin` to `DiscussionThread`. Key = id. |
| `discussions/actions.ts` | 184 | Server actions, see section 2. |
| `layout.tsx` / `template.tsx` / `loading.tsx` | | Shell, page fade (motion), `PageSkeleton`. |

### Discussion components (`src/components/discussion/`, framework-neutral logic + `action-card`)
| File | Lines | Role |
|---|---|---|
| `discussion-thread.tsx` | 447 | THE client state machine (section 3). Imports Verre pieces: `Composer`, `LeonCard`, `UserBubble`, `PreviewPane/PreviewSheet/useCitationPreview`, `Notice`, `Button`, `PageHeader`, `useThinking`, motion `rise`, `useMinWidth(root,920)`. |
| `new-discussion-form.tsx` | 138 | New question: `useActionState(newDiscussionAction)`, textarea `#nouvelle-question` (maxLength 4000, autoGrow, Enter sends, Shift+Enter newline, IME-safe), counter shown from 90 % of 4000, error `role=alert` `#nouvelle-question-note`, example `Pill`s (fill the field, do not send), disabled when no model. |
| `action-card.tsx` | 176 | A GitHub action proposed by Leon: sentence `kinds.<name>` with params, `<dl>` of details (DETAILS list lines 18-35), body blockquote, diff `<pre>` (+ green / - red), warnings (`rerunWarning`, `defaultBranchWarning`, `workflowWarning`), two buttons "confirm.<name>" / "Cancel" calling `decideActionAction`, status line `role=status` (waiting, running, done + "Open" link, `errors.<code>`, cancelled, expired, `lost`). Statuses: `proposee`, `en-cours`, `faite`, `echouee`, `annulee`, `expiree`. |
| `read-reply.ts` | 117 | `readReply(discussionId,message,onProgress)`: `fetch POST /api/v1/discussions/:id/messages`, `accept: text/event-stream`, parses events; returns `ReplyOutcome` (`finie`, `sans-modele` 204, `en-cours`, `coupee`, `indisponible{questionGardee}`, `occupe` 429, `session` 401, `origine` 403). Helpers `questionNotWritten`, `retryQuestion`. Pure, tested (`read-reply.test.ts`). KEEP UNCHANGED. |
| `message-segments.ts` | 30 | `messageSegments(text,citedSet)` and `toolActivity(name)` -> `chercher|lire|activite|depots_github|lire_github|ecrire_github|autre`. Pure, tested. |

### Search components (`src/components/search/`, `src/components/verre/recherche/`)
| File | Lines | Role |
|---|---|---|
| `search/url-state.ts` | 185 | `/?q=&page=` <-> state (`fromSearchParams`, `searchHref`), filter parsing/rewriting (`filterTokens`, `withFilter`, `withoutFilter`, `hasFilter`, `canonicalKey`), `SEARCH_INPUT_ID='barre-de-recherche'`. Pure, tested (240-line test). KEEP. |
| `search/search-filters.tsx` | 222 | `buildActiveChips`, `buildMenus` (tool / type / period), `SearchFilters`: removable chips (`Pill asChild` link), unrecognised filter chip in warning with tooltip, 3 menus + person. Server component, tested (292 lines). |
| `search/filter-menu.tsx` | 138 | Client: `FilterMenu` (DropdownMenu checkbox items -> `router.push(href)`), `FilterPerson` (inline input, Escape closes, focus returns). |
| `search/view-model.ts` | 211 | `ResultView`, `ResultPassageView`, `PreviewView`, `toResultViews`, `toPreviewView`, `queryTerms`, `countLabel` ("12 sources" / "About 140 sources"), `pageCount`, `unknownPeopleMessage`, `toolOptions`, `NATURE_LABELS` (fr). Tested (254 lines). |
| `search/run-search.ts` | 25 | `searchPassages({...ctx,equipe:true},{query,page,embedder})`; failure -> `null` ("Search failed" notice). |
| `search/answer-text.ts` | 17 | `answerSegments`, `resultAnchorId(sourceId)` = `resultat-<id>`. |
| `search/highlighted-text.tsx` | 44 | `highlightTerms(text,terms)` (stem-based) for preview turns. Tested. |
| `search/examples.ts` | 40 | `EXAMPLES`/`SYNTAX` (fr + en): 4 example searches and 6 filter syntax rows for `Welcome`. |
| `verre/recherche/search-bar.tsx` | 122 | `<search>` form `action="/"`, `router.push(searchHref)` in a transition, `/` focuses it, clear X, `Beam` while pending, submit. |
| `verre/recherche/welcome.tsx` | 109 | No-query home: 4 example searches (links), collapsible filter syntax. |
| `verre/recherche/search-results.tsx` | 208 | Results column + sticky preview pane (>=900 px container) or bottom sheet; `lit`/`hovered` cross-highlight between answer `[n]` and result n; empty ("No results" / "shortPage" + back link), failed, unknownPeople notice, pagination (`PAGE_SIZE 10`, `PAGE_MAX 50`), Escape closes pane. |
| `verre/recherche/results.tsx` | 141 | `ResultCard`: origin chip, `[n]`, title button (opens preview), up to 3 passages with `<mark>` snippets (author, date), "Open in <tool>" link. |
| `verre/recherche/answer.tsx` | 215 | `AnswerCard` (search page): `useAnswer(url)` reads `GET /api/v1/recherche/reponse?q=&r=` SSE; states `charge`, `flux`, `fini`, `indisponible`, `masque` (204 no model or 429 >3 in progress => card disappears silently). `ANSWER_NOT_ENOUGH` marker. `CitationChip` per `[n]` linked to result anchor. After `fini`: note `answer.sourceNote` + **"Continue in discussion"** (`continueInDiscussionAction(q, resultIds)` -> redirect). |
| `verre/recherche/preview.tsx` | 225 | `PreviewPane`/`PreviewSheet` for search: header (tool chip, `[n]`, title, "Open in <tool>"), turns with `Matching passage` flag, `<mark>` of the typed terms, states `charge` (3 skeletons), `introuvable`, `erreur`, `pret`. |

### Discussion presentation (Verre, to be transformed): `src/components/verre/discussions/`
`messages.tsx` (290: `UserBubble`, `LeonCard`, `SourceRows`, `CitedSources` collapsible "N sources cited", the seed results of the first question), `preview.tsx` (267: `useCitationPreview`, `PreviewPane`, `PreviewSheet`; same `previewPassageAction`), `composer.tsx` (89: sticky bottom form, Enter/Shift+Enter, hint lines), `list.tsx` (102: `DiscussionRows`, delete with `AlertDialog`, `deleteDiscussionAction`, optimistic removal with rollback, toasts `deleteSuccess`/`deleteFailed`), `about-suggestion-card.tsx` (174).
Shared Verre pieces used by all of the above (`src/components/verre/ui/`): `CitationChip`, `SourceChip`, `SourceLink`, `ToolIcon` (logo from `public/logos/<kind>.svg`, same files as the prototype's `shared/logos`), `Highlighted` (renders the Postgres highlight marks as `<mark>`), `CitedText`, `CitedMarkdown` (`ui/text.tsx:102`: markdown -> React, `[n]` through `renderCite`, caret `tail` while streaming), `Notice`, `Skeleton`, `Sheet`, `AlertDialog`, `Beam` (aurora around the bar), `useThinking` (`shell/thinking.tsx`).

### Pure libs (all tested or used by tested code, KEEP)
- `src/lib/answer-events.ts` (58): `ANSWER_PATH='/api/v1/recherche/reponse'`, `answerUrl(q,ids)`, `ANSWER_NOT_ENOUGH='Les résultats ne suffisent pas pour répondre.'` (French marker the prompt must write word for word), `parseAnswerResults`, events `texte|fin|indisponible`.
- `src/lib/discussion-events.ts` (145): `DISCUSSIONS_PATH`, `DISCUSSION_TIMEOUT_MS=180000`, `DISCUSSION_MESSAGE_MAX_CHARS=4000`, `DiscussionCitation`, events `texte|outil|citations|actions|fin|indisponible|en-cours`, French fixed phrases stored in DB (`DISCUSSION_REFUSAL`, `DISCUSSION_LIMIT_NOTE`, `DISCUSSION_EMPTY`), `finalReplyText`, `replyParts(content)` -> `{main, fixed:'refusal'|'empty'|null, limit}`.
- `src/lib/markdown.ts` (135): `markdownBlocks` (p, h, list nested, code, hr) + `markdownInline` (code, strong, em). No links, no tables (`shortcut:` line 4).
- `src/lib/references.ts` (39): `referenceSegments(text, keep)`, never matches `argv[0]`-style brackets.
- `src/lib/highlight.ts` (39): ``/`` marks, `splitHighlights`, `stripHighlightMarks`.
- `src/lib/actions.ts` (151): `ActionView`, statuses, `actionName`, `actionWarnings`, 14 GitHub action kinds.

### Server (read-only for this port, except the additions in section 8)
`src/server/api/session-routes.ts` (149), `src/server/answer/{answer,answer-prompt,passage-texts}.ts`, `src/server/discussion/{agent,discussions,tools,discussion-prompt,github-actions,proposed-actions}.ts`, `src/server/search/{search,context,parse-query}.ts`, `src/server/llm/{get-llm,fake-llm,llm}.ts`, `src/server/briefing/{briefings,briefing-prompt,gather,about,about-suggestion,queue,worker}.ts`.
Shell pieces that route a question: `src/components/verre/shell/command-palette.tsx` (free text -> `go('/?q=...')` line ~140; "New discussion" action -> `/discussions`), `shell/nav.ts` (`NAV`: `/` labelKey `search`, `/discussions` labelKey `discussions`; en label already "Chat").

---------------------------------------------------------------------------------------------------------------

## 2. How a question becomes an answer today

### A. Search page (`/?q=...`): free, instant list; the model is optional
1. Bar submit -> `router.push('/?q=...&page=n')` (`searchHref`; q cut at `QUERY_MAX_CHARS=300`, control and highlight chars stripped).
2. Server render: `searchPassages` under the user's rights **plus the private of people under them** (`{...ctx, equipe:true}`): full text, or hybrid with vectors (`mode: 'plein-texte' | 'hybride'`; `getEmbedder(env)` may be null; vector distance cap 0.6, 3 s embed timeout). Filters live INSIDE the query text: `de:`/`from:`, `outil:`/`tool:`, `type:`, `depuis:`/`since:` (7j/7d, 2s, 3m), `avant:`/`before:`, quotes for exact phrases, `-word`, `or`. Chips and menus just rewrite the query (no hidden state).
3. 10 sources per page, up to 3 passages each, snippet with highlight marks, total = candidates kept ("About N").
4. If `hits>0 && page===1 && getLlm(env)!==null`: `AnswerCard` mounts and GETs `/api/v1/recherche/reponse?q=...&r=<ids of the 10 shown>` (cookie session, same-origin check). Server `answerStream`: search again under the same rights, keep only the shown ids, prompt of at most 8 passages / 6000 chars / 120 words, `streamText`, references filtered to given numbers, 15 s timeout, per-process cache 10 min per (tenant,user,normalized query) tied to the same passage set, at most 3 in flight per user. `[n]` = rank n of the result list (anchor `resultat-<id>`).
5. "Continue in discussion" -> `continueInDiscussionAction(q, resultIds)` creates the discussion with the query as first question and `seeds` (the shown results, as citations 1..10), then `redirect('/discussions/<id>')`, where the thread auto-starts the reply.

### B. Discussion (`/discussions` then `/discussions/:id`): agent, stored, costly
1. `/discussions`: `newDiscussionAction(prev, formData)` validates (`QuestionSchema`: CRLF->LF, trim, 1..4000) -> `createDiscussion(ctx,{question})` (title = first question on one line, cut at 200; acl = [user]) -> `redirect('/discussions/<id>')`. Errors: `questionTooLong`, `createFailed` (both shown under the field).
2. `DiscussionThread` mounts. If `modelAvailable && messages.length===1 && first.role==='user'` -> `autoStart`: re-reads the discussion with `readDiscussionMessagesAction` (the page may be a stale back-button copy) and only then `run(question)`.
3. `run(message)`: adds the question locally (unless the last message is the same unanswered question: "repeated"), sets `THINKING`, calls `readReply` = POST `/api/v1/discussions/:id/messages` `{message}` (64 KiB body limit, zod 1..4000). The ROUTE writes the question and the answer; the page writes nothing.
4. Route: `findDiscussion` (404 if not yours), `replyStream` (`agent.ts`). Agent: tools `chercher` (search with filters), `lire` (passage with neighbours or a whole source), `activite` (what moved since a date), `depots_github`, `lire_github` (live GitHub with the person's own account, no `[n]`), and write tools `*_github` that **only propose** an action. Limits: 8 tool steps, 40,000 chars read, 180 s, max 2 replies in flight per user, one at a time per discussion (a second ask gets `en-cours`). Citations: `[n]` -> numbering (seed results take 1..k first) -> `citations[]` of the referenced numbers only; `saveReply` writes content + citations; a citation to a source the author can no longer see is dropped at read time (`visibleSourceIds`).
5. SSE events: `texte` (delta), `outil` (tool name, drives the activity label), `actions` (proposed GitHub actions), `citations`, `fin{reason: fini|limite|refus}`, or `indisponible{questionGardee}`, or `en-cours`. A `: ping` comment every 15 s. If the reader leaves the route keeps reading and saves the answer ("keepReading").
6. Page end states: `finie` -> message appended, `fresh` id (reference chips bloom), `router.refresh()`.

### C. Differences that matter for the port
| | Search answer card | Discussion |
|---|---|---|
| route | GET `/api/v1/recherche/reponse` | POST `/api/v1/discussions/:id/messages` |
| tools | none (fixed passages) | search/read/activity/GitHub |
| numbering | `[n]` = result rank of the page | `[n]` = numbering of THIS reply only (resets each answer) |
| stored | no | yes (acl [user]), title, messages, citations, actions |
| concurrency cap | 3 per user (card vanishes on 429/204) | 2 per user (visible "tooMany") |
| no model | card silently absent, search works | form disabled + warning |
| citation target | result card in the list | `previewPassageAction(passageId)` in a pane/sheet |

### D. The fake model: `LEON_LLM=factice` (`src/server/llm/get-llm.ts`, `fake-llm.ts:64-108`)
`getLlm` returns the demo model BEFORE looking at the Anthropic key; `env.ts` refuses it in production. Deterministic, no network, no cost. In a discussion it calls the `chercher` tool once with the last question, then streams three chunks: "Réponse du modèle factice (essai sans clé) : la mémoire contient des éléments sur votre question, voir le premier résultat [1]." (French only). `[1]` is kept only if the search found something (otherwise the reference filter drops it and the sentence stays uncited). If the tool fails the text becomes `DEMO_SEARCH_FAILED` (no `[1]`). The search answer card gets the same sentence from `streamText`. Builders must run the dev server with `LEON_LLM=factice` (plus seeded data) to see answers; with neither it and no `ANTHROPIC_API_KEY`, `modelAvailable=false` everywhere (the `sans-modele` branch).

---------------------------------------------------------------------------------------------------------------

## 3. Every state of the real thread (must all survive; i18n namespace `thread`, `discussionView`, `discussions`)

`DiscussionThread` `Reply` union (lines 34-47) and the notice it draws (lines 281-327):

| State | When | Text key | Action |
|---|---|---|---|
| `repos` | idle | none | none |
| `flux` | reply streaming (`text`, `citations`, `activity`) | live card: before first word the activity label `discussionView.activity.{chercher,lire,activite,depots_github,lire_github,ecrire_github,autre}` ("Leon is searching memory...", "...reading a source...", "...checking recent activity...", "...checking GitHub...", "...reading GitHub...", "...preparing a GitHub action...", "...working..."); then the text with `[n]` kept as plain text and a caret | none |
| `attente` | Leon is already replying here (`en-cours`) or the stream was cut (`coupee`): the page polls `readDiscussionMessagesAction` every 2 s up to 190 s | `thread.resuming` "Leon is finishing an earlier reply..." | none; ends as `repos`, `indisponible` (cut: question back in the composer) or `non-envoyee` |
| `non-envoyee` | the question typed while another reply ran was not written | `thread.alreadyReplying` | question goes back into the field |
| `indisponible` | model/search/db failure, or network | `thread.answerFailedKept` (server says the question is saved) / `answerFailed` (no promise) / `answerFailedDraft` (question restored in the composer) | "Try again" (`thread.retry`) unless `retry===null` |
| `occupe` | 429, two replies already running | `thread.tooMany` | "Try again" |
| `session` | 401 | `thread.sessionExpired` | link "Sign in again" -> `/connexion` (`thread.signInAgain`) |
| `origine` | 403, page opened at another address than `BETTER_AUTH_URL` | `thread.wrongOrigin {origin}` | link "Open at this address" -> `<origin>/discussions/<id>` |
| `sans-modele` | no model (204 or `modelAvailable=false`) | `discussions.modelUnavailable` (warning tone) | composer disabled, placeholder `discussions.disabledPlaceholder` |
| `waiting` (derived) | last message is the user's and state is `repos` (page left mid-reply) | `thread.waitingForReply` | "Request the answer" (`thread.requestReply`) re-asks |

Also: `ask()` is ignored while `busy`; `autoStart` once only (`started` ref, React StrictMode safe); question not written -> removed from the list and put back in the draft if the draft is empty; `router.refresh()` after each finished answer; sr-only live region announces the activity then the whole answer (`spoken()` strips `[n]`, `**`, backticks, `#`; fixed phrases are translated); thinking indicator (`useThinking`) while busy; scroll-into-view of the end on new message (smooth unless reduced motion); preview pane takes focus, Escape closes and returns focus to the opener; under 920 px the preview is a bottom sheet.
Fixed replies stored in French in the DB and translated at display (`replyParts`): refusal `discussionView.refusal`, empty `discussionView.empty` ("I don't know: I found nothing to answer with."), limit note `discussionView.limitNote` shown as a note under the text.
Per-message extras: `UserBubble` shows, on the FIRST question only, the search results it started from as a collapsible `discussionView.searchSeeds` ("From N search results") with source rows; `LeonCard` shows `citedSources` ("N sources cited") open on the latest answer, collapsed on older ones; each row = number, title (opens preview), "Open the original" external link; `ActionCard`s sit under the message that follows the proposal.
Composer: Enter sends, Shift+Enter newline, never during IME composition, 4000 chars, `aria-disabled` + same arrow while busy (focus stays), hint `discussions.keyboardHint` + `privacyHint` (hidden on coarse pointers).

---------------------------------------------------------------------------------------------------------------

## 4. The morning briefing: what is produced, what is exposed

- Produced by `src/server/briefing/briefings.ts` `refreshBriefing(ctx, project, {llm})` (worker `worker.ts`, queue `queue.ts`, signals mark it stale). One model call, `step:'point'`, max 8000 tokens, 120 s. Stored in table `briefings` keyed (tenant, user, **project**) with `markdown`, `sourceIds[]`, `preparedAt`, `stale`, `lastReadAt`, `acl=[user]`.
- **Project = a GitHub repo key** (`github.com/owner/repo`). `projectIsKnown` requires one of the user's code sessions (Claude Code, Codex, Cursor, Antigravity...) in that project, or a GitHub item of that repo they can see. Material = their sessions, changes, mentions (`gather.ts`, `BRIEFING_DAYS`). Nothing for a person with no code sessions (sales, support, design): they never have a briefing.
- Text: at most 250 words, three fixed English sections `## What you did`, `## What changed`, `## What is still open` (`BRIEFING_SECTIONS`), `[n]` markers filtered to provided numbers. `renderBriefing` wraps it: project + date header lines, a data-guard line, `<point-du-matin>` ... `</point-du-matin>`, then `Sources:` with lines `- [n] Tool · "title" · date · url`. No source ids in the markdown.
- Empty material -> `renderEmptyBriefing` (says nothing new). Daily cap 20 model-written briefings per person (`BRIEFING_DAILY_CAP`); beyond it the old one stays. A source the person can no longer see -> briefing unreadable (`null`) and recomputed. No model -> `BRIEFING_NO_MODEL_MARKDOWN`; nothing ready -> `BRIEFING_PENDING_MARKDOWN` (both English strings in `briefings.ts:34-38`).
- Exposed: (a) `GET /api/v1/briefing?project=` with an API token (`requireApiToken`), (b) MCP tool `briefing`, (c) Claude Code start hook. `briefingResponse(ctx, project, {modelReady, client, session})` returns `{markdown, projet, preparedAt}` and logs reads to the read journal (one line per source, `tool:'briefing'`, `client`). `latestBriefingProject(ctx)` returns the project last read, else last prepared.
- **Screens that show it to the signed-in person: none.** Only mentions: Settings "About you" text ("what the morning briefing knows", `src/components/verre/reglages/about.tsx`), the About suggestion card ("Your morning briefing reads this"), the public site copy.

So for a Home briefing a builder must (new, small): server-side in `page.tsx` call `latestBriefingProject(ctx)` then `readBriefing(ctx, project, {refresh:false})` (or `briefingResponse` with `client:'web'`, check the allowed `client` values in `memory/read-log.ts`), then parse the markdown (strip header, guard line and tags, split `## ` sections, bullet lines, `[n]`, `Sources:` lines) into the prototype's three groups. Gaps: n -> sourceId is not stored (`sourceIds` is deduped in the prompt's numbering order, probably index n-1, unverified: check `createNumbering` in `briefing-prompt.ts` ~line 100-125 before relying on it, or persist references); a briefing source has no passage id (the panel needs `previewPassageAction(passageId)`: look up the source's first passage like `resolveSeeds` in `discussions.ts:84-116`); section titles are English constants (map to i18n keys for fr or print as written).

---------------------------------------------------------------------------------------------------------------

## 5. Search + discussion merged: what it means

### What the prototype does
`chat.js`: asking ALWAYS opens a discussion. The first question is the title and the first entry of "Recent"; no results list, no filters, no pages, no model-less mode. A typed question anywhere (`Leon.ask` -> `chat.html?q=`), a suggestion, a Home tile or a command-bar "Ask" all land there.

### Consequence for real routes and data
- `/` stops being search. Becomes Home. `/discussions` becomes the Chat screen: its "new" state (title "New discussion", big field, three tiles) and `/discussions/:id` (title = question, exchanges, dock). Existing URLs `/discussions/:id` stay valid. `NAV` (`shell/nav.ts`): entry 1 Home (`/`, end), entry 2 Chat (`/discussions`).
- Every question becomes a stored row (`discussions`, `discussion_messages`) and costs an agent run. Today quick lookups cost nothing and store nothing.

### What would be LOST by a full merge
1. **Search with no model**: without `LEON_LLM`/`ANTHROPIC_API_KEY`, discussions are disabled; the whole product's retrieval UI would be gone. Real deployments without a key, and every `getLlm(env)===null` case, need search.
2. **Filters and syntax** (`de: outil: type: depuis: avant:`, chips, menus, unrecognised-filter warning, `unknownPeople` notice), **pagination to 50 pages**, source counts, the "Matching passage"/term marks, result passages with author and date, ranking visibility.
3. **The cheap path**: instant, 3 concurrent, 10-minute cache, 120 words, vs a slow agent limited to 2 concurrent.
4. **Deep links and entry points** that hit `/?q=`: command palette free text, `searchHref` users, the "Continue in discussion" bridge, `EmptyState` link on `/discussions`, MCP/guide docs naming "Search" (`NAV.label 'Recherche'` is cited by guides, see `src/test/contracts/guides-docs.test.ts`; check before renaming).
5. **The list of all past discussions** (`DiscussionRows`, up to 100, with per-row delete). The prototype's "Recent" shows 5 and has no list page.

### Smallest honest way (recommended)
Keep both data paths and both server routes untouched; change only what the person sees and where the ask bar sends them.
1. Ask bar / command bar: free text offers TWO lines. "Ask Leon <text>" creates a discussion (a client call to a server action that does what `newDiscussionAction` does, never a GET that creates rows) and goes to `/discussions/<id>`. "Search <text>" goes to `/?q=<text>` (today's behaviour). Without a model, only "Search" is offered.
2. `/` without `q` = new Home. `/?q=` keeps working as a secondary, re-skinned results screen (cards -> the kit's 88px card/tile with passages in the panel, chips -> `.chips`, answer card -> `.paper` with highlighter, "Continue in discussion" kept as the screen's one ink pill replacement). No new work on its data; it only changes dress. This is the fallback for filters, no model and deep links.
3. Chat = `/discussions` (new) + `/discussions/:id` (thread), exactly the prototype.
4. Founder decision to raise: whether the secondary results screen is wanted at all. If NOT, `/?q=` must at least redirect to a new discussion when a model exists, and the no-model case needs a stated fallback.

---------------------------------------------------------------------------------------------------------------

## 6. Prototype -> real mapping

### 6.1 Prototype pieces (all in `proto/`)
- `index.html` + `home.js` + `home.css`: header "Good morning, Julie." (always "Good morning", `NOTES.md:446`), section "Morning briefing" = one `.paper.brief` with 3 columns (`h3` + `ul > li > button.brow[data-n]`), each line = words under `.hl.hl-c` split `.hl--a`/`.hl--b` (the last word, full stop and number never part: `.nw`), then `.num.cN`; hover sweeps the stroke; click -> `Leon.panel.source(SRC[n])` (passage only, "Open in <Tool>" is `data-ext`); the line stays marked (`is-open`) while its panel is open. Section "Try asking": `L.asksHTML` = three tiles (`L.tile`, 52px) each `data-ask` -> `chat.html?d=<id>`. Foot `.fict`.
- `chat.html` + `chat.js` + `chat.css`: `<div class="page chat is-new">`; `header.head` = `h1#chat-title` + `button#del` (quiet, "Delete", hidden until a discussion exists); `div#thread` of `section.ex` (each: `h2.ex__q` for follow-ups only, `article.paper.ans`, then `L.sourcesHTML` tiles); `form.dock#ask-form` (sticky, `.composer` = textarea `#q` + ink button "Ask" with up arrow, `p.field-error#q-e`); `.try` section = the three tiles, shown only in `.is-new`. In `is-new` the dock is static under the title with a 120px box.
- States in `chat.js`: `reading()` (`.ans--reading`, role=status, `<p class="reading"><span class="mark">Leon is searching memory...` then `...reading a source...`, each lasting half of `L.WORK`), `fill()` (answer arrives once with `L.arrive` sweep, sources tiles rise after 600 ms, `Copy` quiet button top right of the sheet), `failed()` (`.ans--fail`, `<i class="dot">` + "Leon couldn't answer right now. Your question is saved." + `Try again` `btn--line`), refusal under the field via `L.fieldError(field, ...)`: empty "Enter a question.", over 4000 "Enter a question of no more than 4,000 characters.", busy "Leon was already replying in this discussion. Your question is back in the composer.". "I don't know" (`answer.unknown`): sentence without stroke, the closest source keeps its number only; plus "Connect a tool" link when there are no sources. Delete: `L.panel.open` (facts: Visible to, Started, Questions, Sources cited) then `L.panel.confirm` ("Delete this discussion?" / "The discussion and all its messages will be deleted. This can't be undone." / Delete / Keep it), then opens the next recent one, toast "Discussion deleted.", hides "Recent" when empty. Same question asked again replaces the older "Recent" entry (no title twice). History: `pushState` between recent entries, `popstate` works. Sidebar "Recent" (5 entries, `chat.html?d=`).
- `app.js` templates: `L.answerHTML(answer)` (line 115: per segment `.seg[data-n] > mark.hl.hl-c.hl--a + .nw > mark.hl--b + .cite.cN buttons`; uncited segment -> `.seg--none` + `.nosrc` "no source"; `unknown` -> `span.plain`), `L.sourcesHTML(sources)` (line 128: `L.tile({num, logo, name:title, sub: visibility==='private'?'Only you':'', hl, attrs data-n})`), `L.wire(el, answer)` (line 421: click on `[data-n]` -> `panel.source`), `panel.source(s, back)` (line 415: panel with the original opened at its passage, "Visible to", foot "Open in <Tool>" or "Open in Documents" for an upload + "Done"), `L.copyText(answer)` (line 139: text with ` [n]` then `[n] Tool · title · author, date`), `L.arrive`, `L.asksHTML` (line 132), `L.col` (colour n = 1..4 cycling, line 36), `L.answerFor` (keyword match; real = the model).

### 6.2 Piece by piece

| Prototype piece | Real counterpart | Work |
|---|---|---|
| Home `h1` greeting | none | New server component. Name from the session user (`requireUserContext()` / auth session); morning/afternoon/evening by the user's timezone (profile `timezone` exists in Settings; `NOTES.md:446` says the prototype is always "Good morning"). New i18n keys en+fr. |
| Home briefing `.paper.brief` | section 4 | New: server read of the latest briefing + markdown parser -> 3 groups. Hide the whole section (no placeholder, no sentence) when the person has none, when no model, or when `BRIEFING_PENDING/NO_MODEL`. Reuse `markdown.ts` for splitting, `referenceSegments` for `[n]`. |
| Briefing line `button.brow` -> panel | `previewPassageAction(passageId)` + panel | Each line opens the source in the side panel at its passage. Needs n -> sourceId -> first passage id (gaps in 4). |
| "Try asking" 3 tiles (Home and new Chat) | `onboarding.asks.<department>.one/two` (2 per department, `messages/*.json`) + `readOnboardingMember(ctx).department`; `isDepartment` | Real data gives 2, not 3, and only for members with a department; today shown only for a user with 0 discussions. Add a third true question (e.g. about recent activity, the agent's `activite` tool) and a no-department fallback. Tile click = create the discussion and ask (prototype), via a `<form action>` / client call to a server action, NOT a link. New keys en+fr. |
| Sidebar "Recent" | `listDiscussions(ctx)` (`discussions.ts:145`, up to 100, `{id,title,createdAt,updatedAt}`) | New in the shell layout (not in this area's files): show the 5 (or more) most recent, mark the open one, revalidate after create/delete (`revalidatePath('/discussions')` only covers that path; use layout revalidation or `router.refresh()`). Dedupe by title is a prototype nicety: the real list has no dedupe (two same questions = two rows). Recommend NOT deduping (they are different stored discussions). |
| Chat `h1` = question | `PageHeader title={discussion.title}` (first question, <=200) | Title = `title` prop. New state title "New discussion" (new key). Drop the breadcrumb "Discussions" back link, the "Only you can see this discussion · Leon only reads what you have permission to see" meta line (prototype: no sentence under the title; the same fact goes in the delete panel "Visible to"). |
| Chat header "Delete" | `deleteDiscussionAction(id)` (today only on list rows) | New control on the thread; confirm in the panel like the prototype (title, text from `discussions.deleteDescription`, buttons `discussions.delete` / "Keep it"); after success go to next recent or `/discussions`; toast `discussions.deleteSuccess`; failure toast `discussions.deleteFailed`. Panel facts: "Visible to: Only you" (always true), "Started" (needs `createdAt`: add to the page props, it is in `DiscussionSummary`), "Questions" (count of user messages), "Sources cited" (distinct `sourceId`s over messages). |
| `section.ex` per question | `messages[]` (user/assistant pairs) | Group each user message with the assistant message after it. The first question is the title and is NOT repeated (`cur.ex.length ? h2.ex__q : ''`); follow-ups get `h2.ex__q`. A trailing user message with no reply = `waiting` state. |
| `article.paper.ans` + `L.answerHTML` | `LeonCard` + `CitedMarkdown` | Rebuild the renderer (section 6.3). |
| Sources tiles `L.sourcesHTML` | `CitedSources` + `SourceRows` | Tiles in a grid, number in its colour + logo + title (+ "Only you"). Click -> panel (below). Needs `kind` (6.4). The "external link" icon per row goes to the panel foot "Open in <Tool>" (it is `url`, `href` already `safeUrl`-filtered). |
| Original in the side panel `panel.source` | `useCitationPreview` + `previewPassageAction` + `PreviewPane/PreviewSheet` | Replace the sticky 400px pane and bottom sheet by the one 520px side panel (the kit's). Keep: 3 loading skeletons, `introuvable` -> `discussionView.passageUnavailable`, `erreur` -> `previewFailed`, turns with speaker/time, the hit turn marked and scrolled into view (`data-hit`, `Turns` effect: `scrollTop += hit.top - box.top - 72`), request race guard (`latest` ref), focus returns to the opener on close. The matching turn gets the highlighter instead of the accent box. Foot: "Open in <kindLabel>" (`discussionView.openIn`) / "Open original" with `url`. |
| `Copy` button | none | New, client only: build text like `L.copyText` (answer with ` [n]`, then `[n] <Tool> · <title>` list). Not in the real product today (prototype `NOTES.md:448`): confirm it is wanted. |
| `form.dock` + `.composer` | `Composer` (`verre/discussions/composer.tsx`) and `NewDiscussionForm` | Merge the two into one dock: in new state it is the big 120px box under the title, in a thread it is sticky at the bottom. Keep Enter/Shift+Enter/IME, autoGrow (prototype caps at 196px; real maxRows 8 / 10), 4000 limit, the 90 % counter if wanted, `aria-disabled` while busy. Placeholder: new "How can Leon help?" (`discussions.newQuestion`), follow-up "Ask another question..." (`discussions.newQuestionPlaceholder`; the prototype says "Ask a follow-up..."). Drop `keyboardHint`/`privacyHint` lines (sentences) unless required for touch/a11y. |
| Field errors | `NewDiscussionState.error` (`questionTooLong`, `createFailed`), thread notices | Show under the field in `.field-error`. Prototype's "Enter a question." has no real key (real: send disabled when empty, no message). The "busy" refusal exists (`thread.alreadyReplying`). |
| `reading()` mark | `activityLabel(reply.activity)` (`discussionView.activity.*`) + `.reading .mark` | Real label changes with the tool the agent calls (7 labels), not 2 timed steps. Before the first event show only the indicator (comment line 54). |
| Answer "arrives once" + sweep | `flux` then `finie` | Stream as plain text with caret (no stroke, no numbers: citations arrive at the end, `renderCite={(n)=>`[${n}]`}` already does that), then at `fin` swap to the finished sheet and play `L.arrive` once (the `fresh` flag exists). `prefers-reduced-motion`: complete at once. |
| `failed()` row + Try again | `thread` notices (table section 3) | Restyle ALL ten states with the prototype's `.fail` row (dot + sentence + `btn--line`). They are not one state. |
| `?state=error`, `?d=`, `?q=` | none | Prototype-only routing. Real: `/discussions/:id` only. No `?q=` GET that creates rows. |
| Command bar "Ask Leon <q>" | `command-palette.tsx` free-text option (-> `/?q=`) | Add an "Ask" option; keep "Search" (section 5). The prototype also finds tools, people, documents, discussions: the real palette lists sections + 5 actions only (no recents: the comment line 36 says the server keeps none). Out of this area; mention to the shell builder. |
| "Connect a tool" under "I don't know" | `discussionView.empty` / answers starting "Je ne sais pas / I don't know" | The real "I don't know" is free text from the model (system prompt: say it, then say what was searched and read). Detect only the stored fixed phrase (`replyParts.fixed==='empty'`), render as the prototype's `unknown` style, and add the "Connect a tool" link to `/connexions` there. A model-written "I don't know" cannot be detected reliably: do not pretend to. |

### 6.3 Rendering an answer under the highlighter (the main transformation)
Today `LeonCard` = `CitedMarkdown` (blocks: p, h, list, code, hr; inline: strong, em, code) with one `CitationChip` per `[n]` (keep = n in citations). Reply markers are glued to the word before and the punctuation after (`citedRuns`, `ui/text.tsx:20-62`).
Needed: a sentence-level step INSIDE each paragraph and each list item (keep the markdown structure the model writes; the prototype only shows flat sentences):
1. Split the inline text at the end of each `[n]` chain (or at `.`/`!`/`?` followed by space and a capital); the chunk before the chain, up to the previous boundary, is the sentence of source `cites[0]` (first number, as `answerHTML` does with `seg.cites[0]`).
2. Wrap it in `mark.hl.hl-c` where `c = ((n-1) % 4) + 1`, split in `hl--a` (all but the last word) and `hl--b` (last word + stop + number) so the number never wraps alone; render each `n` as `button.cite.cN` with `aria-label` = `discussionView.sourceLabel`; the sentence itself clickable (`data-n`) opens the source (focus returns to its number).
3. A sentence with no `[n]` in a normal answer: the prototype prints "no source". In a real answer, intros, transitions and the limit note are legitimately uncited: limit the tag to claim sentences (non-empty plain paragraph/list-item text of 4+ words, not the fixed phrases). Founder decision (honesty vs noise).
4. The factice answer is ONE uncited-or-cited sentence ending `[1].`: must still render (test with it).
5. `fixed` replies (refusal, empty) -> `unknown` style (no stroke); `limit` -> a quiet note under the sheet (it is not a screen-explaining sentence: it says what happened).
6. Live (streaming) text: no stroke, no number, caret; `[n]` as plain text until `fin`.
7. Answer text is untrusted: never HTML (`CitedMarkdown` already guarantees it; keep it).
8. Search-page answer card: same renderer, with `keep: n in 1..results.length` and click = open that result's first passage in the panel (today it scrolls/lights the result card and opens the preview).
Colour by number is per message, because numbering restarts every reply; the prototype's colour 1-4 cycles the same way.

### 6.4 Source tiles need data the citation does not carry
`DiscussionCitation` = `{n, sourceId, passageId, title, url}`. Tile needs: tool (logo + label), "Only you" caption. Options, smallest first:
- Extend the existing read query `visibleSourceIds` (`discussions.ts:182-195`, already one query per discussion read) to select `kind` and the acl (private = acl is only the author), return them with each citation at read time (not stored, so old rows get them too). Streaming `citations` event (end of reply) has no kind: the page could call `router.refresh()` (already done after each answer) or add the field in `numbering.citations`.
- Verify `sources.acl` / `owner_user_id` columns (`src/server/db/schema/memory.ts:13-25`) before promising "Only you".
- Fallback while missing: generic icon (`ToolIcon kind='other'`), no caption.
Logos: `public/logos/*.svg` has the same 50 files as `prototypes/refonte-2026-11/shared/logos/` (airtable ... zendesk, pdf, word, excel, powerpoint). Kinds the product knows but the prototype lacks a logo for (`leon_fil`, `other`, code assistants other than `claude-code`/`cursor`): `ToolIcon` already has fallbacks.

---------------------------------------------------------------------------------------------------------------

## 7. What real Home can truthfully show

| Block | Real source | Truth |
|---|---|---|
| Greeting | session user name + local time | Real. No explaining sentence. |
| Morning briefing | `latestBriefingProject` + `readBriefing` (section 4) | Real only for people with code sessions / GitHub items, with a model, after a first prepared briefing; first visit may enqueue a model call (bounded: known project only, 20/day cap). Show nothing otherwise. NOT cross-tool; NOT a 5-line digest of Gmail/Notion/Linear as in the prototype (those tools are not in the briefing material; check `gather.ts` before promising any). Max 250 words in 3 sections; lines are bullets written by the model. If the person has several projects only the latest is available without a new read. |
| Recent discussions | `listDiscussions(ctx)` | Real, titles only (title + `updatedAt`). Prototype puts them in the sidebar, not on Home. |
| Suggested questions | `onboarding.asks.<department>` (2) | Real for members with a department; extend to 3 + fallback (6.2). Do not invent customer names (the prototype's ACME/Verlant are fictional). |
| About-you proposal | `readAboutSuggestion(ctx)` (one-time, `closeAboutSuggestion`) | Real, currently on `/discussions`. Must survive (6.5). |
| Search examples (`EXAMPLES`) / filter syntax | `examples.ts` | Real, move with the secondary search screen (section 5), not on Home. |
No counts, no dates, no "synced" lines on the Home tiles (founder rule).

### 6.5 Real features the prototype does not show: how they should look
- **About-you card** (`AboutSuggestionCard`, `saveAboutSuggestionAction`, `dismissAboutSuggestionAction`, errors `tooLong`/`empty`/`failed`, `aboutSuggestion.*`, `max = ABOUT_MAX_CHARS`, "Based on" tool icons from `kinds`, saved state, links to Settings > Profile): ONE card (88px) on Home above the briefing, name "Here's what Leon learned about you" (`aboutSuggestion.title`), no caption; click opens the side panel with the textarea (counter `value.length / max` is a detail, in the panel), the "Based on" row, `Save` (the Home's one ink pill) and `Not now` (quiet), saved = `.done` block with the highlighter "Saved" (`aboutSuggestion.saved`). Drop `lead`, `hint`, `basedOnNote`, `whereNext` sentences from the card; keep `basedOnNote` ("Only from your own sources...") inside the panel as the one privacy line. Dismiss focus target `#nouvelle-question` (today) must change to the new field/Home. Do not call `revalidatePath` in save (comment lines 154-157 explains why).
- **Model unavailable**: a `.fail`-style row above the dock with `discussions.modelUnavailable`; field disabled, placeholder `disabledPlaceholder`; Home "Try asking" tiles disabled/hidden when `getLlm(env)===null`.
- **Action cards** (GitHub proposals): a `.paper` under the assistant message, title sentence (`kinds.<name>`) = one name, details (repo, branch, values, diff) go in the side panel ("Details"), the two buttons stay on the card: confirm = the view's ink pill only if no other (the Chat dock's "Ask" is the ink pill: make confirm `btn--line`; destructive kinds (`supprimer_*`, `fusionner_pr`) keep a visible warning); status line, "Open" link after done, `errors.*` per failure, `lost`, `expired`. Nothing may be simplified away: they act on GitHub.
- **Search seeds on the first question** ("From N search results"): a quiet tile group under the title (`discussionView.searchSeeds`), opens the same panel.
- **Fixed replies and limit note**: above (6.3).
- **Counter of characters** at 90 % of 4000: keep as a quiet number at the field's right, only when near the limit.

---------------------------------------------------------------------------------------------------------------

## 8. Server additions (small, only if the founder keeps the feature)
1. `createDiscussion` already accepts a question; no change for "tile asks". Add a client-callable path if the palette creates from outside a form (a server action `askAction(question)` -> create -> `redirect`), reusing `QuestionSchema` and `create()` in `discussions/actions.ts:37-53`.
2. Citation read: add `kind` and `visibility` (section 6.4).
3. Thread page: pass `createdAt` for the delete panel.
4. Home: briefing read for the signed-in person (section 4), `listDiscussions` for the sidebar (layout).
5. No change to the two SSE routes, `read-reply.ts`, `answer-events.ts`, `discussion-events.ts`, `agent.ts`, `answer.ts`, prompts.

## 9. i18n
Namespaces touched: `search`, `welcome`, `filters`, `searchResults`, `answer`, `discussions`, `thread`, `discussionView` (+ `.action.*`), `aboutSuggestion`, `navigation` (en: Search, Chat...), `onboarding.asks.*`, `common`. Every string exists in `messages/en.json` and `messages/fr.json`; new keys (greeting, "New discussion", "Morning briefing", briefing sections, "Copy", "Copied", third example question, delete panel facts, "Connect a tool") need BOTH. Several current keys are sentences the founder bans (`discussions.subtitle`, `search.homeSubtitle`, `answer.sourceNote`, `thread.privacyHint`): stop rendering them, do not delete (accessibility text, tests). The prototype's wording differs from the product in two places (`NOTES.md:448`): keep the product's.

## 10. Tests that guard this area (keep green; none renders the Verre components)
Pure/db tests: `src/components/search/{answer-text,highlighted-text,run-search,search-filters,url-state,view-model}.test.ts`, `result-views.db.test.ts`; `src/components/discussion/{read-reply,message-segments}.test.ts`; `src/app/(app)/discussions/actions.test.ts`; `src/server/answer/*.test.ts`, `src/server/discussion/*.test.ts`, `src/server/briefing/*.test.ts`, `src/server/api/briefing-routes.db.test.ts`, `src/test/contracts/search-limits.test.ts` (forbids copying `PAGE_SIZE` etc.), `guides-docs.test.ts` (names section labels). There is no component or e2e test for any screen: write one test per new pure function (sentence splitter, briefing parser).

## 11. Risks
1. Dropping the search page loses the only no-model retrieval UI and every filter (section 5). Do not delete `/?q=` without a founder decision.
2. Briefing: scoped to code projects. A Home that promises a daily digest for everyone is untrue for non-developers; the empty case must be silent.
3. Source tile "Only you" and tool logo are not in the citation data (6.4); showing them without the server change would be invented.
4. Sentence-level highlighter on model Markdown: lists, bold, code, `[1][3]` chains, `argv[0]` code that must stay text; split bugs would attach a number to the wrong sentence (a trust bug in a product whose point is sources). Unit-test with the factice sentence, a list answer, a chain `[1][3]`, an uncited intro and code.
5. Every tile/ask now creates a stored discussion and a model call (cost; 2 concurrent cap; `tooMany` 429): a tile clicked twice must not create two (use the action's `pending`).
6. Streaming state machine (`DiscussionThread`) is subtle (autostart guard, stale back-button page, `en-cours` polling, restoring the draft). Transform only the JSX and CSS classes; do not reorganise the state or the effects.
7. `useThinking`/`Beam` (aurora around the bar) belong to Verre; the new look has "three strokes" on the ask bar. Remove the dependency without breaking `setThinking` callers (`search-bar`, `answer`, `new-discussion-form`, `discussion-thread`).
8. Briefing "read" side effects: `readBriefing` updates `lastReadAt` (drives the morning refresh) and `briefingResponse` writes read-journal rows; a Home visit would count as a read (and can enqueue a model call). Decide `refresh:false` for page views vs real reads.
9. Recent list freshness: a new discussion created from the palette or a tile must appear in the sidebar immediately (revalidation), and a deleted one must leave it.
10. French fixed phrases in the DB (`DISCUSSION_EMPTY` etc.) are matched by exact text; never reword them in the DB, translate at display only.
11. `LEON_LLM=factice` answers are French-only, one sentence: the English UI will look odd in dev; not a bug.
