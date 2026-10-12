# Annexe 3 : volumes par profil et accès aux sources

Rapport de recherche brut (en anglais), relevé le 12/10/2026. Utilisé dans l'onglet `Volumes`. Les cellules marquées « A » sont des hypothèses de l'agent faute de benchmark public : à remplacer par des mesures de pilote.

Conventions: 1.33 tokens/word; Claude 4.7+ tokenizer ≈ +30%; French ≈ +15–30% (weak sources).

## Part A — volume (k tokens/day, Low / Median / High)

| Source | Dev | Office | Field | Basis |
|---|---|---|---|---|
| Email (human-written, noise removed) | 4/6/11 A | 7/13/22 | 2/10/20 A | 117 received/day (Microsoft 365 telemetry, 2025); >90% of non-spam consumer mail is machine-generated → assume 50–60% noise; 110 words/email (A) |
| Slack/Teams | 2/5/15 A | 2/5/15 | 0.5/1.5/4 A | 153 Teams messages received/weekday; ~40 sent/day; 20 words/message (A). Company-level ingest = messages posted, deduplicated |
| Meetings (if transcribed) | 6/12/18 A | 23/35/45 | 0/12/30 A | 11–22 meetings/week (vendor surveys); 120–150 words/min → ~12k tokens/hour |
| Docs/CRM/tickets | 1/3/8 A | 1/3/10 A | 0.5/2/5 A | No benchmark |
| LLM chat | 1/3/10 A | 1.4/4.7/20 A | 0/0.5/3 A | ChatGPT ≈ 3.7 messages/day/user (NBER 2025); 470 tokens/exchange (A) |
| Coding agent (raw transcript) | 200 / 800–1,300 / 1,800 | — | — | Derived from Anthropic's published Claude Code average of $13/dev/active day (90% under $30) |
| **Total excl. coding transcript** | **14/29/62** | **34/61/112** | **3/26/62** | |

In the cost model, Slack is reduced to messages *posted* (~1.5k/day) and excluded in V1; meetings are excluded by default; coding sessions use the **measured** filtered value (~35k/day, see `Mesure_dev`).

## Part B — access

| Source | Access | Constraint | Cost | Plan |
|---|---|---|---|---|
| Gmail | OAuth restricted scope, or domain-wide delegation | OAuth verification + annual CASA assessment by a Google-approved lab (letter valid 12 months). Internal / domain-wide installs exempt | CASA Tier 2 ≈ $540–1,800/yr (TAC), $3k+ elsewhere; 1–3 weeks | Any |
| Outlook / Teams | Microsoft Graph; Teams export is a protected API | Teams APIs unmetered since 2025-08-25 (was $0.00075/message) | $0 | M365 |
| Slack (rate limits) | conversations.history / replies | New non-Marketplace installs since 2025-05-29: 1 req/min, 15 objects/call ⇒ ≤ 21.6k messages/day/workspace. Marketplace or customer-built internal apps: Tier 3. Marketplace submission needs ≥10 active installs (since Jul 2026); review up to ~10 weeks | $0 | Any |
| Slack (API Terms, 2025-10-10) | — | No LLM training on API data, no bulk export without agreement, minimal retention, no persistent copies/indexes of Data Access / RTS API data | — | — |
| Notion / HubSpot / Pipedrive / monday / Linear | REST / GraphQL | Notion ~3 req/s; HubSpot 110 req/10 s; Pipedrive daily token budget; monday 5M complexity points/min; Linear 5k req/h/user | $0 | Any |
| ChatGPT | Compliance API | Scopes granted by OpenAI; logs kept 30 days, no backfill | included | Enterprise/Edu |
| Claude | Compliance API | Chats, files, projects + Claude Code / Cowork transcripts for Enterprise logins; 600 req/min | included | Enterprise |
| Gemini app | Google Vault export | Does not cover Gemini inside Gmail/Docs | included | Editions with Vault |
| Microsoft 365 Copilot | Graph getAllEnterpriseInteractions | Copilot licence per user; no delta sync | not metered | Copilot add-on |
| GitHub Copilot / Cursor | Metrics / Admin API | Usage and token counts only, no content | — | Business/Ent |
| Local agent on the machine | Claude Code `~/.claude/projects/*.jsonl` (deleted after 30 days by default); Codex CLI `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; Cursor `state.vscdb` SQLite (undocumented, can exceed 30 GB) | Needs an endpoint install; formats change without notice | engineering | None |
| Unified-API vendors | Merge $650/mo (10 accounts); Nango $50/mo (20 connections); Unified.to $750–3k/mo; Paragon on quote | Don't remove CASA or Slack Marketplace obligations | | |

## Top 5 risks

1. **Slack**: terms ban persistent indexes of Data Access / RTS data and bulk export; non-Marketplace apps capped at ~21.6k messages/day/workspace. Possible route: customer-built internal app + Events API, after legal review.
2. **LLM chat capture**: clean APIs only on Enterprise plans; otherwise local files (fragile); personal accounts not capturable through APIs.
3. **Dev seat cost**: raw coding transcripts are 25–45× all other sources combined; tool output must be filtered before any LLM.
4. **Approvals set the launch date**: Google CASA, Slack Marketplace review, Microsoft protected-API request take weeks to months.
5. **Coverage and privacy**: 57–60% of Teams meetings are ad hoc; field work is in person. EU consent / labour law not researched → legal review.

## Sources (accessed 2026-10-12)

microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday · radicati.com · labs.yahoo.com WSDM'18 paper · fellow.app, voxbooster.com, laxis.com (meeting stats) · voices.com (speech rate) · code.claude.com/docs/en/costs · platform.claude.com/docs/en/about-claude/pricing · nber.org/papers/w34255 · openai.com/index/the-state-of-enterprise-ai-2025-report · developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification · developers.google.com/workspace/gmail/api/reference/quota · learn.microsoft.com/en-us/graph/metered-api-list · docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps · slack.com/terms-of-service/api · docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement · docs.slack.dev/apis/web-api/real-time-search-api · developers.notion.com/reference/request-limits · developers.hubspot.com · developers.pipedrive.com · developer.monday.com · linear.app/developers/rate-limiting · platform.claude.com/docs/en/manage-claude/compliance-api · workspaceupdates.googleblog.com (Vault + Gemini) · learn.microsoft.com (aiInteractionHistory) · docs.github.com (Copilot metrics) · cursor.com/docs/api · forum.cursor.com (state.vscdb size) · merge.dev/pricing · nango.dev/pricing · unified.to/pricing · docs.useparagon.com
