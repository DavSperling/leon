# Rust chez les concurrents : qui s'en sert, et pour quoi

État au 19 novembre 2026. Note de recherche pour le dossier de conception « agents ».

> DEUXIÈME JET en cours d'écriture. Les sections se remplissent au fil des recherches.

## Légende

- **officiel** : page, blog, dépôt ou documentation de l'éditeur.
- **tiers** : presse, blog, comparatif, résumé automatique (DeepWiki, Repowise).
- **déduit** : conclusion tirée de plusieurs indices, sans source directe.
- **à vérifier** : vient de la mémoire du rédacteur, pas d'une source trouvée pendant cette recherche.
- **non trouvé** : cherché, rien de fiable.

## Réponse courte (provisoire)

L'affirmation « tous les concurrents utilisent Rust » est fausse telle quelle. Elle devient vraie si on la reformule : « presque tous ont du Rust quelque part, mais presque jamais dans la logique métier ».

## Notes brutes (à mettre en forme)

### Dust
- `core` : service en Rust, backend de `front`. Sources de données, indexation, recherche (Qdrant + Elasticsearch), appels modèles, OAuth. officiel : https://dust.tt/blog/behind-the-curtains-how-we-conducted-our-first-major-architecture-transition-with-no-downtime ; tiers : https://deepwiki.com/dust-tt/dust/14-core-rust-service
- `front` : Next.js + workers Temporal (TypeScript). `connectors` : Node.js + Temporal. tiers : https://deepwiki.com/dust-tt/dust ; officiel Temporal : https://temporal.io/blog/how-dust-builds-agentic-ai-temporal
- Répartition : TypeScript 88,3 %, Rust 10,5 % (fork daté d'environ août 2025, https://github.com/itjee-dwict/dust-tt) ; Repowise (2026) : TypeScript 84 %, Rust 2 % (https://repowise.dev/repo/dust-tt/dust). Les deux se contredisent sur la part de Rust : elle baisse.

### Glean
- Offre backend : Go, Python, Java, C++ ; GCP (App Engine, Kubernetes, Cloud Tasks). Pas de Rust trouvé. tiers : https://peerlist.io/company/glean/careers/software-engineer-backend/jobh7bjologlkrb7af9bmjgo9eqmd8 ; officiel Google : https://cloud.google.com/blog/products/data-analytics/glean-uses-bigquery-and-google-ai-to-enhance-enterprise-search

### Langdock
- Monorepo Bazel TypeScript, React, Next.js, Node.js, Postgres + Prisma, Redis + BullMQ ; services Go en croissance, Protobuf/gRPC. Pas de Rust. officiel (offre) : https://jobs.ashbyhq.com/langdock/ba8e2d17-818f-4ffb-b5ee-05d97b59a596 ; https://www.arbeitnow.com/jobs/companies/langdock/senior-platform-engineer-berlin-481653

### Moteurs
- Qdrant : Rust, choisi contre Go. officiel : https://qdrant.tech/blog/why-rust/
- Meilisearch : Rust (milli, charabia). officiel : https://github.com/meilisearch/meilisearch
- turbopuffer : « cluster of Rust binaries » sur stockage objet. officiel : https://turbopuffer.com/docs/architecture
- LanceDB / Lance : Rust, parti de C++. officiel : https://docs.lancedb.com/faq/faq-oss
- Neon : pageserver et safekeeper en Rust. officiel : https://github.com/neondatabase/neon

### Exécution durable
- Temporal : serveur Go ; `sdk-core` en Rust partagé par les SDK TypeScript (Neon), Python (PyO3), .NET, Ruby. tiers : https://www.infoq.com/news/2025/11/temporal-rust-polygot-sdk/
- Restate : serveur = binaire unique en Rust. officiel : https://docs.restate.dev/foundations/key-concepts

### Outils d'agents
- Codex CLI : réécrit de TypeScript vers Rust (annonce juin 2025). tiers : https://www.devclass.com/ai-ml/2025/06/02/nodejs-frustrating-and-inefficient-openai-rewrites-ai-coding-tool-in-rust/1619589
- Claude Code : reste en TypeScript, livré en binaire natif Bun depuis v2.1.113. tiers : https://x.com/bunjavascript/status/2045300183479865602
- Bun 1.4 (20 août 2026) : cœur porté de Zig vers Rust. tiers : https://www.i-programmer.info/news/98-languages/19132-bun-14-rewritten-in-rust.html
- Cursor : logique métier en TypeScript, parties critiques en Rust, orchestrateur Anyrun en Rust. tiers : https://newsletter.pragmaticengineer.com/p/cursor

### Divers
- Linear : TypeScript partout, Node côté serveur. tiers : https://newsletter.pragmaticengineer.com/p/linear
- Figma : serveur multijoueur réécrit en Rust (2018). officiel : https://www.figma.com/blog/rust-in-production-at-figma/
- Discord : Read States Go vers Rust (2020) ; clients en cours de réécriture en Rust (nov. 2026). officiel : https://discord.com/blog/why-discord-is-switching-from-go-to-rust
- Cloudflare : FL2 en Rust (Pingora, Oxy), -10 ms médian, moins de la moitié du CPU. tiers : https://www.infoq.com/news/2025/10/cloudflare-rust-proxy
- n8n : TypeScript ; task runners JS et Python. tiers : https://deepwiki.com/n8n-io/n8n/7.4-task-runners-and-sandboxed-execution
- Nango : TypeScript. Composio : SDK Python et TypeScript, backend fermé. Pipedream : Node.js, Python, Go, Bash pour le code des clients. tiers : https://oomol.com/blog/openconnector-comparison

## Ce que je recommande

(à compléter)

## Ce que je n'ai pas trouvé

(à compléter)
