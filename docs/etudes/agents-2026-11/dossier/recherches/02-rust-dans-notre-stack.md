# 02 : Rust dans notre stack (Next.js 16, Node 24, Postgres 17, Railway)

État des lieux au 19 novembre 2026. Note de recherche pour le dossier de conception « agents ».

> PREMIER JET EN COURS. Les versions ci-dessous sont vérifiées sur crates.io et npm le 19 novembre 2026. Les sections suivantes sont complétées au fil de la recherche.

## Comment lire cette note

- **officiel** : documentation ou page de l'éditeur, ou registre (crates.io, npm).
- **tiers** : blog, presse, comparatif.
- **déduit** : conclusion tirée par moi de plusieurs faits.
- **à vérifier** : écrit de mémoire, pas confirmé par une source trouvée pendant cette recherche.

Les versions viennent de l'API de crates.io (`https://crates.io/api/v1/crates/NOM`) et du registre npm (`https://registry.npmjs.org/NOM`), interrogés le 19 novembre 2026. Nature : officiel.

## 1. Versions vérifiées le 19 novembre 2026

### 1.1 Crates Rust

| Besoin | Crate | Version stable | Publiée le | Rust minimum | Téléchargements (90 j) |
|---|---|---|---|---|---|
| Serveur HTTP | axum | 0.8.9 | 2026-04-14 | 1.80 | 171,8 M |
| Middleware | tower | 0.5.3 | 2026-01-12 | 1.64 | 252,4 M |
| Middleware HTTP | tower-http | 0.7.1 | 2026-08-31 | 1.65 | 231,5 M |
| Runtime async | tokio | 1.54.1 | 2026-10-21 | 1.85 | 319,4 M |
| HTTP bas niveau | hyper | 1.12.0 | 2026-10-06 | 1.63 | 296,7 M |
| HMAC | hmac | 0.13.0 | 2026-03-29 | 1.85 | 244,4 M |
| SHA-2 | sha2 | 0.11.1 | 2026-10-12 | 1.88 | 402,5 M |
| Temps constant | subtle | 2.6.1 | 2024-06-24 | n.c. | 247,2 M |
| Postgres (async, vérifié à la compilation) | sqlx | 0.9.1 | 2026-11-18 | 1.94 | 60,5 M |
| Postgres (bas niveau) | tokio-postgres | 0.7.18 | 2026-06-12 | 1.85 | 28,5 M |
| Pool | deadpool-postgres | 0.14.2 | 2026-08-26 | 1.85 | 9,4 M |
| Pool (base) | deadpool | 0.13.1 | 2026-08-26 | 1.85 | 55,3 M |
| File Postgres | pgmq (client) | 0.33.7 (0.34.0-alpha.7 en cours) | 2026-05-20 | n.c. | 59 k |
| File Postgres | apalis | 1.2.0 | 2026-11-14 | n.c. | 487 k |
| File Postgres | apalis-postgres | 1.1.1 | 2026-11-18 | n.c. | 178 k |
| File Postgres | underway | 0.2.0 | 2025-07-16 | n.c. | 3 k |
| File Postgres | graphile_worker | 0.14.2 | 2026-11-10 | n.c. | 58 k |
| File Postgres | sqlxmq | 0.6.0 | 2025-05-25 | n.c. | 30 k |
| Client pg-boss en Rust | pgboss | 0.1.0-rc5 (pas de stable) | 2025-12-17 | n.c. | 88 |
| HTTP sortant | reqwest | 0.13.5 | 2026-09-08 | 1.85 | 276,2 M |
| Middleware reqwest | reqwest-middleware | 0.5.2 | 2026-05-19 | n.c. | 25,4 M |
| Reprises | reqwest-retry | 0.9.1 | 2026-02-05 | n.c. | 14,0 M |
| Limite de débit | governor | 0.10.4 | 2025-12-16 | n.c. | 24,4 M |
| Limite de débit (tower) | tower_governor | 0.8.0 | 2025-08-14 | n.c. | 2,2 M |
| Découpage de texte | text-splitter | 0.33.3 | 2026-11-16 | 1.90 | 821 k |
| Jetons (Hugging Face) | tokenizers | 0.23.2 (1.0.0-rc.4 en cours) | 2026-09-03 | n.c. | 20,8 M |
| Jetons (OpenAI) | tiktoken-rs | 0.12.1 | 2026-09-24 | 1.85 | 11,6 M |
| Expressions régulières | regex | 1.13.2 | 2026-11-18 | 1.65 | 341,9 M |
| Multi-motifs | aho-corasick | 1.1.5 | 2026-08-03 | 1.60 | 357,8 M |
| Plein texte | tantivy | 0.27.0 | 2026-10-17 | 1.88 | 5,6 M |
| Vecteurs Postgres | pgvector | 0.4.2 | 2026-05-22 | 1.60 | 6,2 M |
| Vecteurs Qdrant | qdrant-client | 1.20.0 | 2026-10-22 | n.c. | 3,1 M |
| PDF (texte) | pdf-extract | 0.12.1 | 2026-09-16 | n.c. | 4,4 M |
| PDF (structure) | lopdf | 0.47.0 | 2026-11-04 | 1.88 | 15,2 M |
| PDF (liaison PDFium) | pdfium-render | 0.9.5 | 2026-11-01 | 1.61 | 2,1 M |
| PDF (pur Rust) | pdf_oxide | 0.3.78 | 2026-09-08 | 1.88 | 1,0 M |
| Excel, ODS | calamine | 0.38.0 | 2026-11-02 | 1.88 | 7,7 M |
| DOCX | docx-rs | 0.4.22 | 2026-07-21 | n.c. | 789 k |
| Multi-formats | kreuzberg | 4.10.4 | 2026-09-21 | 1.91 | 139 k |
| Multi-formats (Tika) | extractous | 0.3.0 | 2024-12-21 | n.c. | 3,7 k |
| Bac à sable Wasm | wasmtime | 50.0.3 (LTS 36.0.23 publiée le même jour) | 2026-11-19 | 1.97 | 13,4 M |
| WASI | wasmtime-wasi | 50.0.3 | 2026-11-19 | 1.97 | 4,8 M |
| Greffons Wasm | extism | 1.41.0 | 2026-10-09 | n.c. | 239 k |
| MCP (SDK officiel) | rmcp | 3.11.0 | 2026-11-17 | 1.88 | 30,8 M |
| LLM multi-fournisseurs | rig-core | 0.46.0 | 2026-10-31 | 1.97 | 2,3 M |
| LLM multi-fournisseurs | genai | 0.7.5 | 2026-11-14 | n.c. | 317 k |
| Anthropic (communautaire) | anthropic-ai-sdk | 0.2.27 | 2026-01-11 | 1.85 | 6,4 k |
| Anthropic (communautaire) | async-anthropic | 0.6.0 | 2025-05-03 | n.c. | 5,3 k |
| Traces | tracing | 0.1.44 | 2025-12-18 | 1.65 | 284,9 M |
| Traces | tracing-subscriber | 0.3.23 | 2026-03-13 | 1.65 | 202,7 M |
| Pont OTel | tracing-opentelemetry | 0.34.0 | 2026-09-23 | 1.75 | 67,4 M |
| OpenTelemetry | opentelemetry, opentelemetry_sdk, opentelemetry-otlp | 0.33.1 | 2026-10-09 | 1.75 | 93,4 M |
| Sentry | sentry, sentry-tracing | 0.49.6 | 2026-11-16 | 1.89 | 20,4 M |
| Types vers TS | ts-rs | 12.0.1 | 2026-01-31 | 1.78 | 11,3 M |
| Types vers TS | specta | 2.0.0-rc.28 (stable : 1.0.5 de 2023) | 2026-11-05 | n.c. | 3,1 M |
| JSON Schema | schemars | 1.2.3 | 2026-10-12 | 1.74 | 261,2 M |
| Validation JSON Schema | jsonschema | 0.61.2 | 2026-11-12 | 1.85 | 44,0 M |
| Protobuf | prost | 0.14.6 | 2026-11-12 | 1.85 | 181,2 M |
| gRPC | tonic | 0.14.9 | 2026-10-29 | 1.88 | 118,2 M |
| Types vers TS (1Password) | typeshare | 1.0.5 | 2026-01-02 | n.c. | 1,9 M |
| OpenAPI | utoipa | 6.0.0 | 2026-09-22 | 1.88 | 23,9 M |
| Module Node natif | napi | 3.16.2 | 2026-11-11 | 1.88 | 17,9 M |
| Module Node natif | napi-derive | 3.7.1 | 2026-11-11 | 1.88 | 17,8 M |
| Module Node natif | napi-build | 2.6.0 | 2026-10-01 | 1.88 | 19,4 M |
| Wasm vers JS | wasm-bindgen | 0.2.130 | 2026-10-30 | 1.81 | 185,7 M |
| Sérialisation | serde / serde_json | 1.0.229 / 1.0.154 | 2026-07-18 / 2026-10-11 | 1.56 / 1.71 | 447 M / 450 M |
| Erreurs | thiserror / anyhow | 2.0.21 / 1.0.104 | 2026-09-23 / 2026-07-18 | 1.77 / 1.68 | 551 M / 303 M |
| Identifiants | uuid | 1.29.3 | 2026-11-17 | 1.89 | 269,9 M |
| Dates | chrono / time | 0.4.45 / 0.3.55 | 2026-06-04 / 2026-08-01 | 1.62 / 1.88 | 250 M / 257 M |
| Secrets en mémoire | secrecy | 0.10.3 | 2024-10-09 | 1.60 | 61,5 M |
| Encodage | hex / base64 | 0.4.3 / 0.23.1 | 2021-03-03 / 2026-08-04 | n.c. / 1.71 | 219 M / 554 M |
| TLS | rustls | 0.23.46 | 2026-10-14 | 1.71 | 295,4 M |
| Outil de build | cargo-chef | 0.1.78 | 2026-08-12 | n.c. | 1,4 M |
| Cache de compilation | sccache | 0.19.0 | 2026-10-24 | 1.91 | 144 k |

« n.c. » : le champ `rust_version` n'est pas renseigné sur crates.io.

### 1.2 Paquets npm

| Paquet | Version `latest` | Publiée le | Node requis |
|---|---|---|---|
| @napi-rs/cli | 3.10.12 | 2026-11-03 | ^20.17.0, ^22.13.0 ou >= 23.5.0 |
| @napi-rs/wasm-runtime | 1.2.7 | 2026-11-03 | ^20.19.0, ^22.13.0 ou >= 23.5.0 |
| pg-boss | 12.38.2 | 2026-11-10 | >= 22.12.0 |
| next | 16.4.6 | 2026-11-09 | >= 20.9.0 |
| hono | 4.13.19 | 2026-11-16 | >= 16.9.0 |
| drizzle-orm | 0.45.4 | 2026-10-08 | n.c. |
| @anthropic-ai/sdk | 1.11.0 | 2026-11-19 | n.c. |
| @modelcontextprotocol/sdk | 1.32.2 | 2026-10-23 | >= 18 |
| wasm-pack | 0.15.1 | 2026-10-30 | >= 16 |
| json-schema-to-typescript | 16.0.0 | 2026-08-28 | >= 16 |
| zod | 4.6.7 | 2026-10-12 | n.c. |

## Notes brutes de recherche (provisoire, sera réécrit en sections)

- Rust stable : 1.100.0, sorti le 12 novembre 2026 (tiers : https://endoflife.date/rust ; https://en.wikipedia.org/wiki/Rust_(programming_language)). Attention aux scripts qui comparent « 1.100 » et « 1.99 » comme du texte (tiers : https://github.com/CyberNative-AI/what-breaks-next/releases/tag/2026-11-12-rust-1-100).
- sqlx 0.9.0 sorti le 2026-05-06, 0.9.1 le 2026-11-18. Nouveautés PgListener : `next_buffered()`, reconnexion immédiate dans `try_recv`, `impl Acquire`. Cassures : `sqlx.toml` par crate, trait `Migrate`, macros Postgres (nullabilité). 0.9.1 : `PGHOSTADDR` ne remplace plus `host` (officiel : https://docs.rs/crate/sqlx/latest/source/CHANGELOG.md ; https://github.com/launchbadge/sqlx/blob/main/CHANGELOG.md).
- napi-rs v3 : cible `wasm32-wasip1-threads` en repli WebAssembly (officiel : https://napi.rs/blog/announce-v3 ; https://napi.rs/docs/concepts/webassembly).
- Next.js 16 + Turbopack + sortie `standalone` : bogues signalés avec `serverExternalPackages` (paquets absents de `.next/standalone/node_modules`) en 16.1.x et 16.2.0 (officiel, tickets : https://github.com/vercel/next.js/issues/88844 ; https://github.com/vercel/next.js/issues/91654).
- pg-boss : la doc dit qu'on peut écrire dans les tables internes depuis un autre client ou un trigger (`INSERT` ou `COPY`), seul `name` est obligatoire, la file doit exister (`SELECT pgboss.create_queue(name, options)`) (officiel : https://pgboss.io/sql/job-table ; https://github.com/timgit/pg-boss/releases/tag/10.0.0).
- Railway : réseau privé `<service>.railway.internal`, IPv4 et IPv6 pour les environnements créés après le 16 octobre 2025, écouter sur `::` (officiel : https://docs.railway.com/private-networking). Tarifs : 10 $ par Go de RAM et par mois, 20 $ par vCPU et par mois (officiel : https://docs.railway.com/pricing/plans).
- Railway : « Config as Code » (`railway.toml`, `railway.json`) est déprécié, lu jusqu'au 2026-12-01 pour les services existants ; remplaçant : `.railway/railway.ts` appliqué par `railway config apply` (officiel : https://docs.railway.com/reference/config-as-code).
- rmcp : SDK Rust officiel de MCP, version 3.x, implémente la spécification MCP 2026-07-28, transport `transport-streamable-http-server`, service Tower à monter sur axum (officiel : https://github.com/modelcontextprotocol/rust-sdk).
- Anthropic : pas de SDK Rust officiel. Appel HTTP direct : `POST https://api.anthropic.com/v1/messages`, en-têtes `x-api-key`, `anthropic-version: 2026-10-21`, `content-type: application/json`. Comptage : `POST /v1/messages/count_tokens`. Ne pas utiliser tiktoken pour Claude.
- wasmtime : 36 est une version LTS (jusqu'en août 2027) ; WASI 0.3 activé par défaut à partir de wasmtime 46 (officiel : https://wasi.dev/roadmap ; https://github.com/bytecodealliance/wasmtime/releases).
- apalis 1.0.0 sorti en octobre 2026 (officiel : https://apalis.dev/blog/introducing-v1-2026-10-16) ; `apalis-postgres` dépend de sqlx 0.9.
- graphile_worker (Rust) : « mostly compatible » avec la version Node, même schéma, `graphile_worker.add_job` en SQL (officiel : https://docs.rs/graphile_worker).
- pgmq : installation « SQL seul » possible sans extension (utile sur RDS) (officiel : https://github.com/pgmq/pgmq/blob/main/INSTALLATION.md).

(Suite de la note en cours de rédaction.)
