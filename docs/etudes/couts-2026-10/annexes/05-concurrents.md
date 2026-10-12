# Annexe 5 : prix des concurrents et produits voisins

Rapport de recherche brut (en anglais), 29 produits, pages officielles relevées le 12/10/2026 sauf mention « 3rd-party » ou « via search ». Utilisé dans l'onglet `Concurrents`.

| Product | Category | Plan | Price | Unit | Min / contract | Key inclusions / limits | Target | Source |
|---|---|---|---|---|---|---|---|---|
| Supermemory | Memory API | Free/Pro/Max/Scale/Ent | $0 / $19 / $100 / $399 / custom | org/mo (incl. $5/$20/$130/$600 credits) | Ent = committed spend | Overage $0.005/1K tokens and /1K queries. Gmail connector from Max | devs → teams | supermemory.ai/pricing |
| Mem0 | Memory API | Hobby/Starter/Pro/Ent | $0 / $19 / $249 / custom | org/mo | – | 10k/50k/500k adds, 1k/5k/50k retrievals per month | devs | mem0.ai/pricing |
| Zep | Memory API | Free/Flex/Flex Plus/Ent | free / $125 / $375 / custom | org/mo | – | 10k/50k/200k credits; 1 credit per 350-byte episode | devs | getzep.com/pricing |
| Letta | Agent memory | Pro / API / Teams Pro / Ent | $20 / $20 + $0.10/agent + LLM at cost / $20 / custom | user or org/mo | – | Quotas not published | devs | docs.letta.com/letta-code/pricing |
| Basic Memory | Shared KB via MCP | Team / Business | $15 ($12–13 at volume) / $30 | seat/mo | Business annual | Shared knowledge graph; SSO, audit logs on Business | indiv → SMB | basicmemory.com/pricing |
| Conxt | Cross-LLM memory | Pro / Dev / Team | $9 / $29 / $39 | seat/mo | Free during beta | Chrome extension captures ChatGPT, Claude, Gemini; MCP recall in Cursor/Claude Code; team vault | devs, small teams | conxt.dev |
| Pieces | Dev memory | Pro / Enterprise | $18.99 / $22.99 | user/mo | 7-day trial | On-device memory, unlimited MCP | dev → org | pieces.app/pricing |
| In Parallel (EU, AWS Frankfurt) | Org context via MCP | Professional / Business / Enterprise | €29 (€23.20 annual) / €69 (€55.20) / €40k/yr min | user/mo | Ent 50+ users | Meeting notes; MCP on all plans; 5 integrations on Business | SMB → mid | in-parallel.com/pricing |
| Sentra, OpenMemory (Mem0) | Org / MCP memory | – | Not published | – | – | Permissioned graph via API/MCP; auto context for coding agents | – | sentra.app; mem0.ai/openmemory |
| Limitless / Rewind | Personal memory | – | Discontinued (Meta acquisition 2025-12-05, EU service cut) | – | – | – | – | techinformed.com (3rd-party) |
| Dust (FR) | Work AI | Pro / Max / Ent | €24 (€30 monthly) / €120 (€150) / custom | user/mo | Business up to 100 | 8k / 40k credits/seat; Business: max 3 data-source connectors, 5 remote MCP | SMB | dust.tt/home/pricing |
| Notion | Work AI | Business / Ent | €19.50 / custom | member/mo | – | Agent, meeting notes, Enterprise Search; Custom Agents $10 per 1,000 credits | SMB → Ent | notion.com/pricing |
| Slack | Work AI | Business+ / Enterprise+ | €15 (€18 monthly) / sales | user/mo | – | Cross-app search only on Enterprise+ | SMB → Ent | slack.com/pricing |
| Atlassian Rovo | Work AI | Bundled | No separate price | – | – | 25/70/150 credits/user/mo pooled; overage $0.01/credit | SMB → Ent | atlassian.com/software/rovo/pricing |
| M365 Copilot Business | Work AI | Add-on | $18 promo / $21 list (annual); $25.20 monthly | user/mo | ≤300 users | Copilot Chat free | SMB | microsoft.com/en-us/microsoft-365-copilot/pricing |
| Google Workspace | Work AI | Starter / Standard / Plus | €6.80 / €13.60 / €21.10 | user/mo | Annual | Gemini in Gmail/Docs/Drive from Standard | SMB | workspace.google.com/pricing |
| Gemini Enterprise | Agents + connectors | Business / Standard / Plus | from $21 / sales | seat/mo | Business 1–500 | Full connector ecosystem | SMB → Ent | cloud.google.com (via search) |
| ChatGPT Business | LLM suite | Standard / Premium | $20 / $100 annual ($25 / $125 monthly) | user/mo | min 2 seats | Company knowledge web-only, permission-aware | SMB | help.openai.com (via search) |
| Claude Team / Enterprise | LLM suite | Team Standard / Premium; Ent self-serve | $20 / $100 annual ($25 / $125 monthly); Ent $20 + API-rate usage | seat/mo | Team 2–150 | Connectors, memory, enterprise search | SMB → Ent | claude.com/pricing |
| Mistral Le Chat (FR) | LLM suite | Team / Ent | $24.99 / sales | user/mo | – | Connectors and custom MCP (beta) | SMB | mistral.ai/pricing |
| Langdock (DE) | LLM suite | Business / Max | €25 / €99 | user/mo | ≤1,000 users | Workflows add-on from €539/workspace/mo | SMB → mid | langdock.com/pricing |
| Unblocked | Dev context | Platform / Ent | $29 annual ($35 monthly) / sales | user/mo | 21-day trial | MCP to Claude, Cursor, Copilot | dev teams | getunblocked.com/pricing |
| Sourcegraph | Dev context | Enterprise | from $16k | per year | annual | Pooled AI credits | Ent | sourcegraph.com/pricing |
| Glean | Enterprise search | – | Not published; Vendr via 3rd party: $29.9k–$208.9k/yr, median $98.9k | – | – | Seat + credits | Ent | glean.com/pricing; getmacha.com |
| Guru, Moveworks, Swimm, Mio (Paris) | KB / Ent AI | – | Contact sales | – | – | – | mid → Ent | official pages |

## Takeaways

- **Price bands**: memory APIs $19–399/org/month then metered; per-seat team memory / context $15–39 (In Parallel €29–69); work-AI suites cluster at **€20–30/user** (power seats €99–150); enterprise search sales-led ($16k–100k+/yr).
- **Metering**: hybrid seat + credits is now the norm (Dust, Rovo, Notion, In Parallel, Claude Enterprise); memory APIs are pure usage.
- **Lazy vs proactive**: almost every product exposes memory as a tool the LLM must decide to call. Only Conxt ("memory loads before prompts") and OpenMemory claim proactive injection — both dev-only.
- **Capturing employees' LLM chats** is nearly unaddressed: only Conxt (beta Chrome extension). Vendor-native memory is siloed per vendor.
- **SMB gap**: cross-app search is gated behind Enterprise tiers (Slack Enterprise+, Glean, Guru, Moveworks); Dust Business allows only 3 connectors.
- **EU angle**: only In Parallel states EU-only hosting.
- **Pricing implication**: Leon sits on top of a €20–30 LLM seat the customer already pays → €15–35/seat with credits for heavy ingestion or injection.

Caveats: ChatGPT Business and Gemini Enterprise prices come from search results quoting official pages. "$" without currency assumed USD. Notion doesn't state whether €19.50 is annual or monthly.
