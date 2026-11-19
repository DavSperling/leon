# 02 : Rust dans notre stack (Next.js 16, Node 24, Postgres 17, Railway)

État des lieux au 19 novembre 2026. Note de recherche pour le dossier de conception « agents ».

> Version finale. Les versions des sections 1.1 et 1.2 sont vérifiées sur crates.io et npm le 19 novembre 2026.

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

## 2. Les trois voies pour introduire Rust

### 2.1 Comparaison

| Critère | Module natif (napi-rs) | WebAssembly | Service séparé (axum + tokio) |
|---|---|---|---|
| Où ça tourne | Dans le processus Node | Dans le processus Node (ou ailleurs) | Autre processus, autre conteneur |
| Appels depuis TS | Directs, rapides, async possible | Directs, copie mémoire en entrée et sortie | HTTP ou gRPC, réseau privé |
| E/S réseau, Postgres | Possible mais mal adapté (tokio dans Node) | Quasi impossible (pas de sockets en général) | Natif, c'est son métier |
| Build | `napi build` par plateforme (gnu, musl) | `wasm32-wasip1-threads` ou `wasm-bindgen` | Dockerfile Rust, indépendant |
| Risque Next.js | Réel : traçage `standalone`, `serverExternalPackages` | Faible | Nul (aucun lien avec le bundler) |
| Panne | Un plantage natif tue le processus Node | Isolé (bac à sable) | Isolé, redémarrage séparé |
| Bon pour | Calcul pur : découpage, comptage de jetons, regex | Code non fiable, greffons | Passerelle, workers, tout ce qui fait des E/S |

(déduit, à partir des sources ci-dessous.)

### 2.2 Module natif avec napi-rs

- Versions : crate `napi` 3.16.2, `napi-derive` 3.7.1, `napi-build` 2.6.0 ; CLI `@napi-rs/cli` 3.10.12 (officiel, registres, 19 nov. 2026).
- napi-rs v3 ajoute la cible `wasm32-wasip1-threads` : le même code peut servir de repli WebAssembly quand le binaire natif manque (officiel : https://napi.rs/blog/announce-v3 ; https://napi.rs/docs/concepts/webassembly).
- Le chargeur généré détecte plateforme, architecture et libc. Ordre : fichier local `addon.linux-x64-gnu.node`, puis paquet optionnel `@scope/addon-linux-x64-gnu`, puis WASI (officiel : https://napi.rs/docs/more/integrations).
- Next.js : à utiliser seulement en runtime Node (pas Edge, pas composant client). Déclarer le paquet dans `serverExternalPackages` (officiel : https://napi.rs/docs/more/integrations).
- Piège Next.js 16 : avec Turbopack et la sortie `standalone`, des paquets externalisés manquent dans `.next/standalone/node_modules` (officiel, tickets : https://github.com/vercel/next.js/issues/88844 ; https://github.com/vercel/next.js/issues/91654, vus en 16.1.x et 16.2.0). Je n'ai pas vérifié l'état en 16.4.6. Parade : `outputFileTracingIncludes` pour copier le paquet de la plateforme (tiers : https://segar.me/blog/posts/pdf_extraction.html, cas de `@napi-rs/canvas`).
- Conteneur : choisir la libc. Image Debian (`node:24-bookworm-slim`) = cible `x86_64-unknown-linux-gnu`. Image Alpine = musl, cible séparée. Construire la bonne, pas les deux, en prod.
- Construction : `napi build --platform --release --use-napi-cross` (glibc) ou `-x` (musl). Les images Docker `ghcr.io/napi-rs/napi-rs/nodejs-rust` sont dépréciées (officiel : https://napi.rs/docs/cross-build ; https://napi.rs/docs/cli/build).
- Node 24 : le CLI exige `^20.17 || ^22.13 || >=23.5`, donc compatible (officiel, npm).
- Verdict : utile seulement pour du calcul pur appelé en boucle depuis TS. Pas pour la passerelle ni les workers. Coût caché : binaire natif à publier et à tracer dans le build Next.js.

### 2.3 WebAssembly

- `wasm-bindgen` 0.2.130, `wasm-pack` 0.15.1 (officiel, registres). Bon pour du code pur sans E/S.
- Pas de gain évident sur Node : on a déjà V8, et la copie des chaînes entre JS et Wasm coûte.
- Vrai intérêt : exécuter du code non fiable (voir 3.9, wasmtime) ou des greffons (extism 1.41.0).
- Verdict : pas de module Wasm « maison » au départ.

### 2.4 Service séparé (axum + tokio)

- Pile mûre : axum 0.8.9, tokio 1.54.1, tower 0.5.3, tower-http 0.7.1, hyper 1.12.0 (officiel, crates.io).
- Aucun lien avec le bundler Next.js. Déploiement indépendant. Mémoire et plantages isolés.
- Coût : un service de plus sur Railway, un contrat d'interface à tenir, une chaîne de build de plus.
- Verdict : c'est la seule voie adaptée à la passerelle de webhooks et au moteur d'envoi (E/S, longue durée, concurrence).

## 3. Crates recommandées par besoin

Toutes les versions : voir tableau 1.1.

### 3.1 Passerelle de webhooks

- `axum` 0.8.9, `tower` 0.5.3, `tower-http` 0.7.1 (limite de taille, timeout, trace, compression).
- Signature : `hmac` 0.13.0 + `sha2` 0.11.1, comparaison par `verify_slice` (temps constant). `subtle` 2.6.1 (dernière version 2024-06) si comparaison manuelle.
- Règle d'or : prendre le corps brut (`Bytes`) avant tout `Json<T>`, vérifier, puis parser. Les extracteurs qui re-sérialisent changent les octets (tiers : https://www.svix.com/guides/receiving/receive-webhooks-with-rust-axum/ ; https://guard-api.com/guides/how-to-fix-insecure-webhooks-in-axum/).
- Piège : un exemple compare des chaînes hex avec `!=`, pas en temps constant (tiers : https://dev.to/gokulnh/webhook-signature-verification-in-node-python-and-rust-the-raw-body-trap-l4c). À éviter.
- Décoder le hex de l'en-tête en octets avant `verify_slice` (tiers : https://oneuptime.com/blog/post/2026-01-25-webhook-handlers-signature-verification-rust/view).
- Ajouter une fenêtre de temps (horodatage signé) contre le rejeu. Chaque éditeur a son format : à lire dans la doc de chaque connecteur.
- Limite de débit entrante : `tower_governor` 0.8.0 (dernière publication août 2025).
- Principe : la passerelle vérifie, écrit une ligne dans une boîte d'envoi (3.3), répond 2xx vite. Le traitement se fait ailleurs.

### 3.2 Postgres

| Crate | Version | Remarque |
|---|---|---|
| sqlx | 0.9.1 (2026-11-18) | Async, requêtes vérifiées à la compilation, `PgListener`. Rust 1.94 minimum. |
| tokio-postgres | 0.7.18 | Plus bas niveau, léger. |
| deadpool-postgres | 0.14.2 | Pool pour tokio-postgres. |
| pgvector | 0.4.2 | Types `Vector` pour sqlx et tokio-postgres. |

- sqlx 0.9 : `PgListener` gagne `next_buffered()` et la reconnexion immédiate dans `try_recv` ; cassures : `sqlx.toml` par crate, trait `Migrate`, macros Postgres (nullabilité). 0.9.1 : `PGHOSTADDR` ne remplace plus `host` (officiel : https://github.com/launchbadge/sqlx/blob/main/CHANGELOG.md).
- LISTEN/NOTIFY : `PgListener::connect_with(&pool)` puis `listen("canal")` et `recv()`. Connexion dédiée, hors pool, directe (pas via un pooleur en mode transaction). À vérifier. Les notifications se perdent pendant une coupure : toujours relire la table au redémarrage.
- Sécurité par ligne (RLS) et variables de session : le pool réutilise les connexions. Faire `set_config('app.tenant_id', $1, true)` (équivalent à `SET LOCAL`) et les requêtes protégées dans une seule transaction (`pool.begin()`), jamais en appels séparés. Un `set_config(..., false)` oublié fuit vers la requête suivante. Le rôle applicatif ne doit être ni propriétaire des tables ni `BYPASSRLS`, ou alors `FORCE ROW LEVEL SECURITY` (tiers, général, pas propre à sqlx : https://patotski.com/blog/postgres-row-level-security-multi-tenant/ ; https://encore.dev/articles/postgres-row-level-security-multi-tenant). Je n'ai pas trouvé d'exemple sqlx précis : déduit.
- Recommandation : sqlx 0.9.1. Compatible avec le même schéma que Drizzle ; les migrations restent côté Drizzle (une seule source), sqlx n'y touche pas. Pour les macros `query!`, prévoir le mode hors ligne (`cargo sqlx prepare`, fichiers `.sqlx/` commités) pour que le build Docker n'ait pas besoin de base. À vérifier.

### 3.3 Files de tâches sur Postgres

| Option | Version | Verdict |
|---|---|---|
| pgmq (client) | 0.33.7 (0.34.0-alpha.7) | Installation SQL seule possible sans extension, donc compatible RDS (officiel : https://github.com/pgmq/pgmq/blob/main/INSTALLATION.md). File simple, sans planification riche. |
| apalis + apalis-postgres | 1.2.0 / 1.1.1 | 1.0 sorti le 2026-10-16 (officiel : https://apalis.dev/blog/introducing-v1-2026-10-16). Dépend de sqlx 0.9. Récent. |
| underway | 0.2.0 (2025-07) | Peu actif. À éviter. |
| graphile_worker | 0.14.2 (2026-11-10) | « Mostly compatible » avec la version Node, même schéma, `graphile_worker.add_job` en SQL (officiel : https://docs.rs/graphile_worker). Autre système que pg-boss. |
| sqlxmq | 0.6.0 (2025-05) | Peu actif. |
| pgboss (client Rust) | 0.1.0-rc5 | Pas de stable, 88 téléchargements. Non. |

- Écrire dans pg-boss depuis Rust : oui, c'est permis. La doc dit qu'un autre client ou un trigger peut faire `INSERT` ou `COPY` dans la table des jobs ; seul `name` est obligatoire ; la file doit exister (`SELECT pgboss.create_queue(name, options)`) (officiel : https://pgboss.io/sql/job-table ; https://github.com/timgit/pg-boss/releases/tag/10.0.0). pg-boss 12.38.2 est la version actuelle.
- Risque : le schéma interne de pg-boss change entre versions majeures. Une écriture directe lie Rust à une version précise.
- Recommandation : une table de boîte d'envoi à nous (`outbox`), avec clé d'idempotence unique. Rust y écrit dans la même transaction que le reste. Un petit relais côté Node (ou un trigger) la transforme en job pg-boss. On garde ainsi un contrat à nous, stable. Déduit.

### 3.4 HTTP sortant

- `reqwest` 0.13.5 (rustls par défaut à vérifier), `reqwest-middleware` 0.5.2, `reqwest-retry` 0.9.1.
- Débit : `governor` 0.10.4 (algorithme GCRA), un limiteur par fournisseur et par compte. Utile pour respecter les quotas des API d'outils.
- Reprises : respecter `Retry-After`. Prévoir des timeouts explicites.

### 3.5 Découpage de texte et comptage de jetons

- `text-splitter` 0.33.3 (Rust 1.90) : découpe par caractères, jetons ou Markdown.
- `tokenizers` 0.23.2 : Hugging Face. `tiktoken-rs` 0.12.1 : jetons OpenAI.
- Pour Claude, ne pas utiliser tiktoken : le comptage exact passe par `POST /v1/messages/count_tokens` de l'API Anthropic. Dans le code, utiliser une estimation, puis l'API quand c'est critique.
- Ce besoin existe aussi en TS. Gain de Rust : vitesse sur gros volumes. À mesurer avant.

### 3.6 Secrets et motifs

- `regex` 1.13.2 (temps linéaire, pas de rétroparcours catastrophique), `aho-corasick` 1.1.5 (nombreux mots-clés à la fois).
- Pour un détecteur de secrets : un `RegexSet` de motifs connus (préfixes de clés), plus entropie. Pas de crate dédiée trouvée : non trouvé.
- Intérêt réel : la sécurité face aux regex malveillantes (ReDoS), contrairement aux regex JavaScript.

### 3.7 Plein texte

- `tantivy` 0.27.0 (2026-10-17). Moteur embarqué, index sur disque.
- Sur Railway, un index sur disque demande un volume, et la source de vérité reste Postgres. Postgres a déjà `tsvector`. Non recommandé au départ.

### 3.8 Vecteurs

- `pgvector` 0.4.2 : fournit `pgvector::Vector` pour sqlx. Suffit si on reste sur Postgres.
- `qdrant-client` 1.20.0 : seulement si on adopte Qdrant. Non recommandé : une base de plus à opérer.

### 3.9 PDF et documents bureautiques

| Crate | Version | Usage |
|---|---|---|
| pdf-extract | 0.12.1 | Texte simple |
| lopdf | 0.47.0 | Structure du PDF |
| pdfium-render | 0.9.5 | Liaison PDFium (bibliothèque native à embarquer) |
| pdf_oxide | 0.3.78 | Pur Rust, jeune |
| calamine | 0.38.0 | Excel, ODS : mature |
| docx-rs | 0.4.22 | Écriture surtout |
| kreuzberg | 4.10.4 | Multi-formats |
| extractous | 0.3.0 (2024-12) | Abandonné ? |

- Qualité de l'extraction : non évaluée par moi (pas de test). Les PDF scannés demandent de l'OCR : hors sujet ici.

### 3.10 Exécution isolée de code

- `wasmtime` 50.0.3 (2026-11-19, Rust 1.97 minimum). Une branche LTS 36.0.23 existe, soutenue jusqu'en août 2027 (officiel : https://github.com/bytecodealliance/wasmtime/releases). WASI 0.3 par défaut à partir de wasmtime 46 (officiel : https://wasi.dev/roadmap).
- Limites à fixer : mémoire, « carburant » (`consume_fuel`) ou interruption par époque, aucun accès réseau ni fichier par défaut.
- Rust 1.100.0 est sorti le 12 novembre 2026 (tiers : https://endoflife.date/rust). Le minimum 1.97 de wasmtime est donc couvert.
- Pour un agent qui exécute du code, un bac à sable Wasm ne lance ni Python natif ni shell. Si on veut ça, il faut un conteneur isolé : autre sujet.

### 3.11 Appels aux modèles de langage

- Pas de SDK Rust officiel d'Anthropic (état au 19 nov. 2026 ; je n'en ai pas trouvé).
- Communautaires : `anthropic-ai-sdk` 0.2.27 (6,4 k téléchargements), `async-anthropic` 0.6.0 (non maintenu depuis mai 2025). Multi-fournisseurs : `rig-core` 0.46.0, `genai` 0.7.5.
- Appel direct avec `reqwest` : `POST https://api.anthropic.com/v1/messages`, en-têtes `x-api-key`, `anthropic-version: 2026-10-21` (valeur relevée dans mes notes, à vérifier sur la doc officielle), `content-type: application/json`.
- Recommandation : garder les appels aux modèles en TypeScript avec `@anthropic-ai/sdk` 1.11.0 (officiel, maintenu par l'éditeur). Ne pas les mettre en Rust.

### 3.12 MCP

- `rmcp` 3.11.0 : SDK Rust officiel du protocole, implémente la spécification MCP 2026-07-28. Transport `transport-streamable-http-server`, service Tower à monter dans axum (officiel : https://github.com/modelcontextprotocol/rust-sdk).
- Côté TS : `@modelcontextprotocol/sdk` 1.32.2.
- Un serveur MCP en Rust n'apporte rien tant que le moteur d'agents est en TS.

### 3.13 Télémétrie

- `tracing` 0.1.44, `tracing-subscriber` 0.3.23, `tracing-opentelemetry` 0.34.0, `opentelemetry` / `opentelemetry_sdk` / `opentelemetry-otlp` 0.33.1, `sentry` et `sentry-tracing` 0.49.6.
- Les crates OpenTelemetry doivent avoir la même version entre elles ; `tracing-opentelemetry` doit viser la même ligne (0.34 ↔ 0.33). À vérifier à la compilation.

## 4. Partage de types entre TypeScript et Rust

| Outil | Version | Verdict |
|---|---|---|
| schemars | 1.2.3 | Produit du JSON Schema depuis les structures Rust. Le contrat neutre. |
| jsonschema | 0.61.2 | Valide du JSON contre un schéma côté Rust. |
| json-schema-to-typescript | 16.0.0 (npm) | JSON Schema vers types TS. |
| zod | 4.6.7 (npm) | Déjà dans la pile TS probablement. |
| ts-rs | 12.0.1 | Rust vers `.ts`. Simple, stable. |
| specta | 2.0.0-rc.28 | Encore en candidate. Éviter. |
| typeshare | 1.0.5 | 1Password. Correct, plus limité. |
| prost / tonic | 0.14.6 / 0.14.9 | Protobuf et gRPC : lourd pour deux personnes. |
| utoipa | 6.0.0 | OpenAPI depuis axum. |

Recommandation (déduite) : un seul sens, de Rust vers TS. `schemars` produit les schémas JSON des messages (fiches d'agent, événements de la passerelle), un script `json-schema-to-typescript` génère les types, et le CI échoue si le résultat diffère de ce qui est commité. Alternative plus simple : `ts-rs` si seuls les types TS sont voulus.

## 5. Mise en ligne sur Railway

- Un dépôt, plusieurs services : un service par dossier, chacun avec son Dockerfile. Railway cherche un fichier nommé `Dockerfile` (D majuscule) à la racine de la source ; la variable `RAILWAY_DOCKERFILE_PATH` désigne un autre chemin (officiel : https://docs.railway.com/builds/dockerfiles). Pour un dépôt partagé, le personnel de Railway conseille de laisser le dossier racine vide et de fixer cette variable (tiers, forum, ancien : https://station.railway.com/questions/how-to-use-dockerfiles-in-a-shared-monor-b986ee3f). À vérifier dans la doc actuelle.
- BuildKit est utilisé et les montages de cache sont pris en charge (officiel : https://docs.railway.com/builds/dockerfiles). Donc cargo-chef ou `--mount=type=cache` fonctionnent.
- Config as code : `railway.toml` et `railway.json` sont dépréciés, lus jusqu'au 2026-12-01 pour les services existants ; remplaçant `.railway/railway.ts` appliqué par `railway config apply` (officiel : https://docs.railway.com/reference/config-as-code). Donc ne pas bâtir sur `railway.toml` : utiliser les variables du service.
- Réseau privé : `<service>.railway.internal`, IPv4 et IPv6 pour les environnements créés après le 16 octobre 2025 ; écouter sur `::` (officiel : https://docs.railway.com/private-networking). Dans le conteneur : `TcpListener::bind("[::]:PORT")`.
- Tarifs : 10 $ par Go de RAM et par mois, 20 $ par vCPU et par mois (officiel : https://docs.railway.com/pricing/plans). Un service axum tient en 50 à 150 Mo de RAM au repos (déduit, non mesuré), soit environ 1 à 2 $ par mois pour la mémoire.
- Taille d'image : binaire Rust release lié statiquement aux libs Rust, base `debian:bookworm-slim` ou `gcr.io/distroless/cc` : image de l'ordre de 30 à 80 Mo (déduit, non mesuré). Le build, lui, est lent.
- Postgres reste sur AWS RDS à Francfort : prévoir la latence réseau entre Railway et RDS, et la liste d'adresses autorisées. Non évalué ici.
- Compilation sur Railway : durée et mémoire du build non trouvées. Un build Rust à froid de plusieurs minutes est probable (déduit). Option : construire l'image dans GitHub Actions et la déployer depuis un registre. Non vérifié pour Railway.

## 6. Intégration continue GitHub Actions

- Base : `Swatinem/rust-cache` (cache des dépendances, enregistrement en fin de job). Il ne met pas les crates du workspace en cache sauf option `cache-workspace-crates: true` (v2.8.0 et plus, à vérifier) (tiers : https://dev.to/skipbox/why-rust-cache-doesnt-make-your-rust-ci-fast-tauri-246-s-to-53-s-1g88).
- `sccache` 0.19.0 (Rust 1.91) en complément, avec `CARGO_INCREMENTAL=0` ; gain non garanti (tiers : https://github.com/cubeyard/cube/pull/180 ; https://corrode.dev/blog/tips-for-faster-ci-builds/). Conseil d'un guide 2026 : l'ajouter au-delà de dix minutes de build.
- Limite de GitHub : 10 Go de cache par dépôt. Enregistrer le cache seulement depuis `main` (tiers : https://dev.to/eme_gug_0821b41b948be6516/taming-rust-compile-times-in-2026-a-practical-playbook-with-cargo-timings-cranelift-mold-and-3fgl).
- Étapes : `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo sqlx prepare --check`.
- Durée mesurée pour notre cas : non trouvée. Ordre de grandeur pour un petit service axum + sqlx : 2 à 4 minutes avec cache, 6 à 10 à froid (déduit, non mesuré).

## 7. Coûts honnêtes

- **Compilation** : plus lente que TypeScript, surtout sqlx avec macros, tokio, reqwest. Pour des agents de code, chaque boucle attend le compilateur (tiers : https://www.stork.ai/blog/rust-is-quietly-taking-over-ai ).
- **Courbe d'apprentissage** : réelle pour deux fondateurs venus de TypeScript. Les erreurs de durée de vie et de propriété en async sont les plus pénibles. Déduit.
- **Rust écrit par des agents en 2026** : le compilateur sert d'arbitre déterministe, ce qui aide. Un récit cite une migration de 430 000 lignes de TypeScript vers Rust en 14,5 semaines avec 1,7 % d'erreurs liées à l'emprunt ; je n'ai pas trouvé la source primaire, donc fragile (tiers : https://www.mlabs.city/blog/rust-for-ai-assisted-development, non lu en entier). Autre point de vue : les modèles tournent en rond sur les erreurs d'emprunt dans le code async (tiers : https://devtoolsreview.com/best-for/best-ai-coding-tools-rust/). Les deux se contredisent en degré, pas en sens. La plupart des sources sont du contenu commercial.
- **Relecture** : l'autre fondateur doit pouvoir relire du Rust. Un code Rust qu'un seul des deux comprend est un risque.
- **Maintenance** : deux chaînes de dépendances (npm et cargo), des mises à jour de sécurité (`cargo audit`, `cargo deny`) à suivre.

## 8. Squelette

### 8.1 Arborescence

```
leon/
  apps/web/                  (Next.js, existant)
  services/
    gateway/                 (nouveau, Rust)
      src/main.rs
      Dockerfile
  crates/
    common/                  (types partagés, schemars)
      Cargo.toml
      src/lib.rs
  Cargo.toml                 (espace de travail)
  Cargo.lock
  rust-toolchain.toml
  .sqlx/                     (requêtes préparées, si macros)
```

(Si `services/gateway` a son propre `Cargo.toml`, la racine liste `members = ["services/gateway", "crates/common"]`.)

### 8.2 Cargo.toml racine

Versions du 19 novembre 2026 (tableau 1.1). Assemblage non compilé par moi : à vérifier.

```toml
[workspace]
resolver = "3"
members = ["services/gateway", "crates/common"]

[workspace.package]
edition = "2024"
rust-version = "1.94"

[workspace.dependencies]
axum = "0.8.9"
tokio = { version = "1.54.1", features = ["rt-multi-thread", "macros", "signal"] }
tower = "0.5.3"
tower-http = { version = "0.7.1", features = ["trace", "limit", "timeout"] }
hmac = "0.13.0"
sha2 = "0.11.1"
hex = "0.4.3"
sqlx = { version = "0.9.1", default-features = false, features = ["runtime-tokio", "tls-rustls", "postgres", "uuid", "chrono", "json", "macros"] }
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.154"
uuid = { version = "1.29.3", features = ["v7", "serde"] }
anyhow = "1.0.104"
thiserror = "2.0.21"
tracing = "0.1.44"
tracing-subscriber = { version = "0.3.23", features = ["env-filter", "json"] }
schemars = "1.2.3"

[profile.release]
lto = "thin"
codegen-units = 1
strip = true
```

`services/gateway/Cargo.toml` : `[dependencies]` avec `axum.workspace = true`, etc. Le nom des fonctionnalités de sqlx 0.9 (`tls-rustls`) est à vérifier.

### 8.3 Dockerfile (plusieurs étapes, cargo-chef)

```dockerfile
FROM rust:1.100-bookworm AS chef
RUN cargo install cargo-chef --version 0.1.78 --locked
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY services ./services
COPY crates ./crates
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY services ./services
COPY crates ./crates
COPY .sqlx ./.sqlx
ENV SQLX_OFFLINE=true
RUN cargo build --release -p gateway

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/gateway /usr/local/bin/gateway
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/gateway"]
```

Sur Railway : `RAILWAY_DOCKERFILE_PATH=services/gateway/Dockerfile`, racine du service = racine du dépôt (le contexte doit contenir `crates/`). À vérifier. Distroless n'a pas de shell : pas de `healthcheck` par commande ; utiliser le contrôle HTTP de Railway.

### 8.4 axum : HMAC puis insertion

Table : `create table webhook_inbox (id uuid primary key, source text not null, delivery_id text not null, payload jsonb not null, received_at timestamptz not null default now(), unique (source, delivery_id));`

```rust
use axum::{body::Bytes, extract::State, http::{HeaderMap, StatusCode}, routing::post, Router};
use hmac::{Hmac, KeyInit, Mac}; // hmac 0.13 : KeyInit à importer (à vérifier)
use sha2::Sha256;
use sqlx::{postgres::PgPoolOptions, PgPool};

#[derive(Clone)]
struct AppState { pool: PgPool, secret: std::sync::Arc<Vec<u8>> }

async fn webhook(State(s): State<AppState>, headers: HeaderMap, body: Bytes)
    -> Result<StatusCode, StatusCode>
{
    // Corps brut : on vérifie avant tout parsing.
    let sig = headers.get("x-signature-256").and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("sha256=")).ok_or(StatusCode::UNAUTHORIZED)?;
    let sig = hex::decode(sig).map_err(|_| StatusCode::UNAUTHORIZED)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(&s.secret).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    mac.update(&body);
    mac.verify_slice(&sig).map_err(|_| StatusCode::UNAUTHORIZED)?; // temps constant

    let payload: serde_json::Value = serde_json::from_slice(&body).map_err(|_| StatusCode::BAD_REQUEST)?;
    let delivery = headers.get("x-delivery-id").and_then(|v| v.to_str().ok()).ok_or(StatusCode::BAD_REQUEST)?;
    sqlx::query("insert into webhook_inbox (id, source, delivery_id, payload) values ($1, 'demo', $2, $3) on conflict do nothing")
        .bind(uuid::Uuid::now_v7()).bind(delivery).bind(payload)
        .execute(&s.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::ACCEPTED)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    let pool = PgPoolOptions::new().max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?).await?;
    let secret = std::sync::Arc::new(std::env::var("WEBHOOK_SECRET")?.into_bytes());
    let app = Router::new().route("/hooks/demo", post(webhook)).with_state(AppState { pool, secret });
    let listener = tokio::net::TcpListener::bind("[::]:8080").await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

Ce code vient de mémoire et de motifs lus dans les guides cités en 3.1 : je ne l'ai pas compilé. Les noms d'en-têtes (`x-signature-256`, `x-delivery-id`) sont des exemples, pas ceux d'un éditeur précis. Ajouter `tower_http::limit::RequestBodyLimitLayer` pour borner le corps.

## Ce que je recommande

1. **Ne pas introduire Rust dans le processus Node (napi-rs, Wasm) au départ.** Raison : risque réel sur le traçage `standalone` de Next.js 16 (tickets ouverts), binaire natif à gérer, gain faible pour des tâches surtout d'E/S.
2. **Si Rust, un seul service : la passerelle de webhooks (axum 0.8.9 + sqlx 0.9.1).** Raison : c'est le seul besoin où Rust apporte une vraie valeur (charge, robustesse, mémoire basse), et il est isolé du reste.
3. **Passerelle = vérifier, écrire dans une boîte d'envoi, répondre vite.** Pas d'écriture directe dans les tables internes de pg-boss, même si c'est permis : le schéma interne change entre versions majeures.
4. **Garder en TypeScript** : les appels aux modèles (SDK Anthropic officiel 1.11.0), le moteur d'agents, le découpage et les jetons, MCP. Raison : SDK officiels, une seule langue pour deux fondateurs.
5. **Types** : `schemars` vers JSON Schema, puis `json-schema-to-typescript`, avec contrôle en CI.
6. **Déploiement** : Dockerfile cargo-chef, un service Railway distinct, réseau privé. Ne pas miser sur `railway.toml` (déprécié).
7. **Décision de départ prudente** : si le temps manque, démarrer la passerelle en TypeScript (Hono) derrière la même boîte d'envoi, et garder le contrat identique pour pouvoir la réécrire en Rust plus tard. Mesurer d'abord la charge réelle.

## Ce que je n'ai pas trouvé

- Aucun retour d'expérience 2025-2026 précis sur napi-rs avec Next.js 16 en sortie `standalone` dans un conteneur ; état des tickets 88844 et 91654 en Next.js 16.4.6 non vérifié.
- Durées réelles de build Rust sur Railway et sur GitHub Actions pour ce type de service : seulement des ordres de grandeur déduits.
- Taille d'image et consommation mémoire mesurées d'un service axum + sqlx : non mesurées.
- Exemple officiel de sqlx avec RLS et `set_config` : non trouvé (déduit du comportement de Postgres).
- Source primaire des chiffres « 430 000 lignes, 14,5 semaines, 1,7 % » (migration par agents) : non trouvée.
- Qualité d'extraction comparée des crates PDF : non évaluée.
- Détecteur de secrets en Rust prêt à l'emploi : non trouvé.
- Valeur actuelle exacte de l'en-tête `anthropic-version` : issue de mes notes, non reconfirmée.
- Fonctionnalités exactes de sqlx 0.9 (`tls-rustls`) et API `KeyInit` de hmac 0.13 : à vérifier à la compilation.
