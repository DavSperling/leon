# Rust chez les concurrents : qui s'en sert, et pour quoi

État au 19 novembre 2026. Note de recherche pour le dossier de conception « agents ».

## Légende

- **officiel** : page, blog, dépôt ou documentation de l'éditeur.
- **tiers** : presse, blog, comparatif, résumé automatique (DeepWiki, Repowise, PGXN).
- **déduit** : conclusion tirée de plusieurs indices, sans source directe.
- **à vérifier** : vient de la mémoire du rédacteur, pas d'une source trouvée.
- **non trouvé** : cherché, rien de fiable.

## Réponse courte

L'affirmation « tous les concurrents utilisent Rust » est **fausse telle quelle**. Elle devient vraie sous cette forme : « beaucoup ont du Rust quelque part, presque jamais dans la logique métier ni dans les connecteurs ».

- Les produits « mémoire d'entreprise + agents » proches du nôtre (Glean, Langdock, Sana, Onyx, Notion, n8n, Nango, Linear) n'ont **pas** de Rust trouvé dans leur logique métier.
- Seul Dust a un vrai service Rust (`core`), et sa part de Rust baisse dans les mesures disponibles.
- Rust est massif chez les **fournisseurs de briques** : moteurs de vecteurs et de recherche (Qdrant, Meilisearch, turbopuffer, Lance, Tantivy), bases (Neon), exécution durable (Restate, cœur des SDK Temporal), proxys (Cloudflare), clients lourds (Zed, Discord en cours).
- Chez les éditeurs d'**outils d'agents** (Codex CLI, Copilot runtime, Prime Agent), la tendance 2025-2026 est bien la réécriture vers Rust. Mais ce sont des programmes lancés sur la machine de l'utilisateur, où le démarrage et la mémoire comptent. Notre produit est un service serveur.

## Tableau par éditeur

| Éditeur | Langages connus | Où est le Rust | Nature | Fiabilité |
|---|---|---|---|---|
| Dust | TypeScript (front, connectors), Rust (core) | `core` : sources de données, indexation, recherche, appels modèles, OAuth | logique métier + recherche | officiel + tiers |
| Glean | Go, Python, Java, C++ | aucun trouvé | | tiers (offre) |
| Notion | non confirmé | aucun confirmé ; recherche vectorielle sur turbopuffer (Rust, fournisseur) | | tiers |
| Onyx | Python 63 %, TypeScript 31 %, Go 2 % | aucun ; Vespa ou OpenSearch | | tiers |
| Langdock | TypeScript (monorepo Bazel), Go en hausse | aucun | | officiel (offre) |
| Sana | TypeScript (Node), Kotlin (JVM), Python | aucun | | tiers (offre) |
| Sentra | non trouvé | non trouvé | | |
| Qdrant | Rust | tout le moteur | moteur de vecteurs | officiel |
| Meilisearch | Rust | tout (milli, charabia) | moteur de recherche | officiel |
| turbopuffer | Rust | « cluster de binaires Rust » sur stockage objet | moteur de vecteurs | officiel |
| LanceDB / Lance | Rust (parti de C++) | format et moteur | base vectorielle | officiel |
| Neon | Rust + C (Postgres) | pageserver, safekeeper | base de données | officiel |
| ParadeDB | Rust | extension `pg_search` (Tantivy + pgrx) | recherche dans Postgres | tiers |
| Temporal | Go (serveur) ; Rust (sdk-core) | cœur partagé des SDK TypeScript, Python, .NET, Ruby | exécution durable | officiel + tiers |
| Restate | Rust (serveur) | binaire unique, RocksDB embarqué | exécution durable | officiel |
| n8n | TypeScript ; runners JS et Python | aucun | | tiers |
| Nango | TypeScript | aucun trouvé | | tiers |
| Composio | Python + TypeScript (SDK) | backend fermé, non trouvé | | tiers |
| Pipedream | Node.js ; code client en Node, Python, Go, Bash | non trouvé | | tiers |
| Zapier, Lindy, Fyxer, Granola, Attio | non trouvé | non trouvé | | |
| Linear | TypeScript partout | aucun | | tiers |
| Cursor | TypeScript (métier), Rust (indexation, Anyrun), Python (ML) | indexation, orchestrateur d'agents cloud | client lourd + exécution isolée | tiers (Pragmatic Engineer) |
| Zed | Rust | éditeur + GPUI | client lourd | tiers |
| Codex CLI | Rust (réécrit depuis TypeScript) | tout le binaire | client lourd, sandbox | officiel + tiers |
| Claude Code | TypeScript ; runtime Bun porté en Rust | uniquement sous le runtime | client lourd | tiers |
| Cloudflare | Rust (FL2, Pingora, Oxy) | passerelle réseau | proxy | tiers |
| Figma | Rust (serveur multijoueur, 2018) | synchronisation temps réel | moteur de synchronisation | officiel |
| Discord | Go puis Rust (Read States, 2020) ; clients en cours de réécriture en Rust (nov. 2026) | service de lecture, clients | service + client lourd | officiel (2020), tiers (2026) |
| Vercel, Supabase | non trouvé dans cette passe | à vérifier : Turbopack et Turborepo (Rust), edge-runtime Supabase (Rust) | | à vérifier |
| GitHub Copilot runtime | TypeScript vers Rust (2026) | tout le runtime | runtime embarqué | officiel |

## Détail des faits utiles

### Dust

- `core` est un service Rust, backend de `front`. Il gère les sources de données, l'indexation, la recherche (Qdrant + Elasticsearch), les appels aux modèles, OAuth. officiel : https://dust.tt/blog/behind-the-curtains-how-we-conducted-our-first-major-architecture-transition-with-no-downtime ; tiers : https://deepwiki.com/dust-tt/dust/14-core-rust-service
- `front` : Next.js + workers Temporal, en TypeScript. `connectors` : Node.js + Temporal. officiel Temporal : https://temporal.io/blog/how-dust-builds-agentic-ai-temporal ; tiers : https://deepwiki.com/dust-tt/dust
- Part de Rust, deux sources qui se contredisent : TypeScript 88,3 % / Rust 10,5 % (fork d'environ août 2025, https://github.com/itjee-dwict/dust-tt) ; TypeScript 84 % / Rust 2 % (Repowise, 2026, https://repowise.dev/repo/dust-tt/dust). Lecture déduite : la part de Rust est faible et semble baisser. Méthodes de mesure différentes, à ne pas comparer trop vite.
- Offre de janvier 2026 : TypeScript, React, Rust, Kubernetes, Qdrant, PostgreSQL. Équipe d'environ 20 ingénieurs. officiel : https://dust.tt/blog/engineering-hiring-process-at-dust
- ZenML (tiers) : « Rust pour les services internes plutôt que Python ». https://www.zenml.io/llmops-database/building-a-horizontal-enterprise-agent-platform-with-infrastructure-first-approach
- Retour d'expérience ou regret publié sur Rust : non trouvé. Réécriture annoncée en 2026 : non trouvée.
- Ce qui reste en TypeScript : l'interface, l'API, les workers Temporal, les connecteurs. Les connecteurs et la logique d'agents d'un concurrent direct sont donc en TypeScript.

### Moteurs de recherche, de vecteurs, bases

- Qdrant : Rust, choisi contre Go (contrôle mémoire, pas de ramasse-miettes). officiel : https://qdrant.tech/blog/why-rust/
- Cas GlassDollar (Elasticsearch vers Qdrant, vers 10 M de documents) : gain de vitesse, aucun chiffre en ms dans le résumé. VentureBeat cite -40 % de coût d'infra (tiers). officiel : https://qdrant.tech/blog/case-study-glassdollar/
- Benchmarks contradictoires face à pgvector : Qdrant 11,8 ms p95 contre 34,2 ms pour pgvector 0.7 (blog, méthode floue) ; à l'inverse, l'équipe Glanit est revenue de Qdrant à pgvector (double écriture, p95 34 ms dans Postgres). tiers : https://glanit.com/insights/ai-ml/why-pgvector-replaced-qdrant-llm-feedback-pipeline
- Meilisearch : Rust. officiel : https://github.com/meilisearch/meilisearch
- turbopuffer : « cluster de binaires Rust » sur stockage objet. officiel : https://turbopuffer.com/docs/architecture. Notion s'en sert pour la recherche vectorielle (analyste Zilliz, tiers : https://zilliz.com/blog/notion-vector-search-next-problem).
- LanceDB : Rust, parti de C++. officiel : https://docs.lancedb.com/faq/faq-oss
- Neon : pageserver et safekeeper en Rust. officiel : https://github.com/neondatabase/neon
- ParadeDB `pg_search` : extension Postgres en Rust (Tantivy + pgrx), licence AGPL-3. **Le README indique qu'elle ne s'installe pas sur Amazon RDS** tant que RDS ne la supporte pas (README de la v0.9.1 : à revérifier pour la version actuelle). Notre base est sur RDS. Version stable citée 0.26.x (oct. 2026), pages PGXN incohérentes : à vérifier. tiers : https://github.com/paradedb/paradedb ; https://pgxn.org/dist/pg_search/
- Onyx : Vespa par défaut, OpenSearch en option ; Postgres, Redis, MinIO. tiers : https://dejaviewed.dev/guides/onyx-self-hosted-ai ; https://docs.onyx.app/security/architecture/system_description

### Exécution durable

- Temporal : serveur en Go. `sdk-core` en Rust, base des SDK TypeScript (via Neon), Python (PyO3), .NET, Ruby. Raison officielle : une seule implémentation des machines à états pour tous les langages, Rust jugé plus sûr que C. officiel : https://temporal.io/blog/why-rust-powers-core-sdk ; tiers : https://www.infoq.com/news/2025/11/temporal-rust-polygot-sdk/
- Remarque d'un conférencier QCon : le core passe 90 % de son temps à sérialiser (indicatif, pas un benchmark). tiers : https://www.infoq.com/presentations/rust-polyglot-sdk/
- Pour nous : on écrit nos workflows en TypeScript, le Rust est caché dans le SDK. Pas de Rust à écrire.
- Restate : serveur = binaire Rust unique, RocksDB embarqué, mono-nœud ou cluster. SDK TypeScript, Java, Kotlin, Python, Go, Rust, Ruby. officiel : https://docs.restate.dev/foundations/key-concepts ; Thoughtworks Radar : https://www.thoughtworks.com/en-us/radar/platforms/restate. Pourquoi Rust : non trouvé.

### Outils d'agents et réécritures 2025-2026

| Éditeur | De | Vers | Gains annoncés | Source et nature |
|---|---|---|---|---|
| OpenAI Codex CLI | TypeScript (Node 22+) | Rust, annonce mai-juin 2025 | Raisons officielles : plus besoin de Node, sécurité (sandbox), perf, extensibilité. **Aucun chiffre primaire.** Deux blogs se contredisent (démarrage 800 ms vers moins de 150 ms et mémoire 250 vers moins de 80 Mo, contre démarrage sous 50 ms et -60 à -70 % de mémoire) | officiel https://github.com/openai/codex/discussions/1174 ; tiers https://www.devclass.com/ai-ml/2025/06/02/nodejs-frustrating-and-inefficient-openai-rewrites-ai-coding-tool-in-rust/1619589 |
| GitHub Copilot runtime | TypeScript / Node.js | Rust (plus de 800 000 lignes, environ 14,5 semaines, surtout écrit par des agents, ~120 000 $ de jetons selon la presse) | Démarrage et création de session 5,25 s vers 292 ms (ABI C, en processus) ; lot de 10 clients 1 383 Mo vers 126 Mo (mode en processus) ou 247 Mo (hors processus) ; 3 à 6 fois plus rapide hors processus, 6 à 21 fois en processus | officiel https://github.blog/ai-and-ml/generative-ai/migrating-the-github-copilot-runtime-to-rust-using-copilot/ ; chiffres repris par tiers https://www.theregister.com/devops/2026/09/18/microsoft-agentically-ports-copilot-runtime-to-rust-for-120k/5297549. GitHub : « en aucun cas une affirmation que tout gros programme TypeScript doit passer à Rust ». Chiffres exacts à relire dans le billet officiel |
| Prime Intellect, Prime Agent | TypeScript | Rust | ~14 fois plus rapide jusqu'au premier input, plus de 80 % de mémoire en moins (chiffres de l'éditeur) | https://www.primeintellect.ai/blog/prime-agent-rust |
| Bun (Anthropic) | Zig | Rust, Bun 1.4 (20 août 2026), porté par Claude | ~10 % de démarrage en moins sous Linux (tiers) | tiers https://www.i-programmer.info/news/98-languages/19132-bun-14-rewritten-in-rust.html ; https://www.heise.de/en/news/AI-Porting-Claude-Rewrites-Bun-Codebase-in-Rust-11294318.html |
| Discord (clients) | Electron / React Native | Rust + GPUI (Zed), annoncé nov. 2026 | Version de développement Windows 290 Mo de RAM contre jusqu'à 4 Go ; pas d'annonce officielle complète ni de date | tiers https://www.infoq.com/news/2026/11/discord-rust-rewrite-gpui-zed/ |

Notes :

- Claude Code reste une application TypeScript. Seul le runtime dessous est en Rust. Dates et versions varient selon les sources (v2.1.113 pour le binaire natif Bun, v2.1.181 pour le Bun en Rust) : à vérifier. tiers : https://x.com/bunjavascript/status/2045300183479865602 ; https://gigazine.net/gsc_news/en/20260723-claude-code-bun-in-rust/
- Copilot : Rust empêche le code non sûr en mémoire, pas le mauvais programme écrit proprement. Passer « en processus » gagne en mémoire mais perd en isolation. Le code obtenu reste « TypeScript-shaped ».
- Cursor : logique métier en TypeScript, indexation en Rust via pont Node, orchestrateur Anyrun entièrement en Rust (agents cloud, Firecracker sur EC2). tiers : https://newsletter.pragmaticengineer.com/p/cursor
- Zed : tout en Rust, GPUI avant 1.0 avec ruptures fréquentes. tiers : https://lib.rs/crates/gpui

### Restés en TypeScript ou Python, et pourquoi

| Éditeur | Choix | Raison |
|---|---|---|
| n8n | TypeScript ; runners JS et Python isolés | Les clients écrivent du JS ou du Python ; isolation par processus runner (tiers : https://deepwiki.com/n8n-io/n8n/7.4-task-runners-and-sandboxed-execution). Raison : déduit |
| Nango, Composio, Pipedream | TypeScript, Python, Node | Les connecteurs sont des appels HTTP vers des API tierces : le goulot est le réseau, pas le CPU (déduit). tiers : https://oomol.com/blog/openconnector-comparison |
| Linear | TypeScript | Un seul langage pour client et serveur (déduit). tiers : https://newsletter.pragmaticengineer.com/p/linear |
| Langdock | TypeScript, Go en croissance | officiel (offres) : https://jobs.ashbyhq.com/langdock/ba8e2d17-818f-4ffb-b5ee-05d97b59a596 |
| Onyx, Sana, Glean | Python / TypeScript / Kotlin / Go / Java | Moteur de recherche acheté (Vespa, OpenSearch) ou maison en Go/C++ ; la logique reste en langages de productivité (déduit). Sana : https://sanalabs.com/careers/software-engineer ; Glean : https://peerlist.io/company/glean/careers/software-engineer-backend/jobh7bjologlkrb7af9bmjgo9eqmd8 |
| Claude Code | TypeScript | Logique d'agent en TypeScript, vitesse demandée au runtime |

### Cloudflare, Figma, Discord (services)

- Cloudflare : FL2 en Rust (Pingora, Oxy), -10 ms au médian, moins de la moitié du CPU. tiers : https://www.infoq.com/news/2025/10/cloudflare-rust-proxy
- Figma : serveur multijoueur réécrit en Rust (2018). officiel : https://www.figma.com/blog/rust-in-production-at-figma/
- Discord : Read States de Go vers Rust (2020). Pics de ~500 ms contre ~1 ms constant (source secondaire pour cette valeur). officiel : https://discord.com/blog/why-discord-is-switching-from-go-to-rust
- Ce sont des services à très fort trafic, avec des pics de latence causés par le ramasse-miettes. Notre charge n'est pas de cet ordre (déduit).

## Versions vérifiées le 19 novembre 2026 (registres)

| Paquet | Version | Date |
|---|---|---|
| crates.io `qdrant-client` | 1.20.0 | 22 oct. 2026 |
| crates.io `tantivy` | 0.27.0 | 17 oct. 2026 |
| crates.io `pgrx` | 0.20.0 | 12 nov. 2026 |
| crates.io `temporalio-sdk-core` | 0.11.0 | 9 nov. 2026 |
| crates.io `temporalio-sdk` | 1.2.0 | 9 nov. 2026 |
| crates.io `napi` | 3.16.2 | 11 nov. 2026 |
| crates.io `neon` | 1.1.2 | 2 oct. 2026 |
| crates.io `tokio` | 1.54.1 | 21 oct. 2026 |
| crates.io `axum` | 0.8.9 | 14 avr. 2026 |
| npm `@temporalio/worker` | 1.26.0 | |
| npm `@qdrant/js-client-rest` | 1.20.0 | |
| npm `@napi-rs/cli` | 3.10.12 | |
| npm `bun` | 1.4.5 | |

Source : registres officiels (API crates.io, registry.npmjs.org).

## Ce qui gagne à être en Rust, et ce qui non

| Pièce de notre produit | Rust ? | Raison |
|---|---|---|
| Logique des 42 connecteurs (appels API, OAuth, pagination) | Non | Charge liée au réseau ; aucun concurrent direct ne le fait en Rust (Nango, Composio, Pipedream, Dust `connectors`) |
| Standard (tri des événements) et moteur d'agents | Non | Le temps passe en appels de modèles et d'outils ; l'équipe écrit déjà en TypeScript avec des agents de code |
| Fiches d'agents, actions, poste de contrôle, API, auth | Non | Logique métier qui change vite |
| Files et exécution durable | Non, acheter | pg-boss aujourd'hui ; Temporal ou Restate plus tard (Rust déjà dedans, via le SDK TypeScript) |
| Recherche vectorielle et plein texte | Non pour écrire ; Rust possible en **service acheté** | pgvector sur RDS d'abord ; Qdrant ou turbopuffer si la charge l'exige ; ParadeDB non supporté sur RDS |
| Exécution isolée de code d'agent | Oui, mais à acheter | Rust est le choix des sandboxes (Cursor Anyrun, Codex) ; prendre un service (conteneurs, microVM) plutôt que d'en écrire un |
| Passerelle réseau (proxy sortant, quotas) | Pas au début | Un point d'entrée Hono suffit à 20-200 salariés (déduit) |
| Client lourd (agent local, extension) | Plus tard, si besoin | C'est là que Rust gagne chez Codex, Copilot, Zed, Discord |
| Fonctions CPU chaudes (découpage de documents, empreintes, parsing lourd) | Éventuellement, en module natif | `napi-rs` (`@napi-rs/cli` 3.10.12) permet un module Rust appelé depuis Node, comme Cursor ; seulement après mesure |

## Ce que je recommande

1. **Rester en TypeScript sur toute la logique** : connecteurs, standard, moteur, actions, API, poste de contrôle. Raison : c'est ce que font Dust (front et connectors), Nango, n8n, Linear, Langdock, Sana ; le temps est dans le réseau et dans les modèles ; deux fondateurs et leurs agents n'ont pas de dette Rust à payer.
2. **Ne pas écrire de Rust au lancement.** Prendre Rust « en dépendance » : Temporal (si besoin), Qdrant, turbopuffer, Bun. On profite du Rust sans le maintenir.
3. **Garder pgvector sur RDS** tant que la charge reste modeste. Écarter ParadeDB (non supporté par RDS). Ne passer à un moteur Rust (Qdrant d'abord) que si une mesure le justifie. Le retour Glanit montre le coût de la double écriture.
4. **Exécution de code d'agent : acheter un service isolé** plutôt que de construire. Rust sert aux acteurs dont c'est le métier.
5. **Poser un seuil avant tout Rust interne** : un module natif `napi-rs` n'est justifié que si un profil montre une fonction CPU dominante. Le gain de Copilot (5,25 s vers 292 ms) vient d'un besoin d'embarquement, pas d'une règle générale, et GitHub le dit lui-même.
6. **Se méfier des chiffres de réécriture** : ceux de Codex ne sont pas publiés par OpenAI ; ceux de Prime Agent viennent de l'éditeur ; ceux de Copilot concernent le démarrage d'un runtime local.

## Ce que je n'ai pas trouvé

- Où se trouve Rust chez Glean, Notion, Sentra, Zapier, Lindy, Fyxer, Granola, Attio : aucune source fiable. Notion : seule la dépendance à turbopuffer est citée, par un tiers.
- Vercel et Supabase : rien dans cette passe. Turbopack, Turborepo et edge-runtime en Rust sont à vérifier (mémoire).
- La page officielle Notion sur le mode hors ligne (déc. 2025) : non lue.
- Pourquoi Restate a choisi Rust : non trouvé.
- Regrets ou retours négatifs de Dust sur Rust : non trouvés. Aucune réécriture Dust annoncée.
- Chiffres primaires de Codex CLI après réécriture : non trouvés.
- Part actuelle de Rust dans le dépôt Dust : deux sources contradictoires (10,5 % ancien contre 2 % récent), non tranché.
- Versions exactes de Claude Code et de Bun lors du passage au Rust : contradictoires.
- Pipedream, Composio, Nango : seul un comparatif tiers ; aucun dépôt ni offre d'emploi lu.
- Pas de lecture directe des billets officiels GitHub, Codex, Qdrant : les chiffres viennent des résumés de recherche.
