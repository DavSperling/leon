# La porte en Rust

Le service qui reçoit les webhooks des éditeurs, vérifie leur signature sur le corps brut, dépose la livraison par `porte_deposer` et répond. Seconde mise en œuvre du contrat que tient d'abord la route Hono (`src/server/webhooks/hono-gate.ts`). Conception : `docs/etudes/agents-2026-11/dossier/15-la-porte-en-rust.md`.

Dans le dépôt, ce dossier devient `services/porte/`. Il ne se construit que sur une des mesures du chapitre 15 (section 4), ou sur décision de David.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `Cargo.toml`, `Cargo.lock` | Versions exactes. Construire avec `--locked` |
| `rust-toolchain.toml` | Rust 1.97.0, comme l'image et la CI |
| `src/main.rs` | Lecture de `fournisseurs.json` et des variables, routes `/h/{outil}`, `/h/{outil}/{abonnement}`, `/h/{outil}/{abonnement}/cycle`, `/sante`, déroulé d'une requête, délais, journal et Sentry |
| `src/verifier.rs` | Les modes de `WebhookVerification` : `hmac-sha256`, `hmac-sha1`, `standard-webhooks`, `jeton` |
| `src/depot.rs` | `porte_secret`, `porte_deposer` (2 s au plus par appel), les caches et la limite par adresse IP |
| `src/secret.rs` | Le déchiffrement des secrets d'abonnement (`v1:`, AES-256-GCM, `LEON_PORTE_KEY`) |
| `src/tests.rs` | Les cas de `vecteurs.json`, puis ce qu'ils ne mesurent pas |
| `fournisseurs.json`, `vecteurs.json` | **Générés** par `pnpm porte:generer` (chapitre 03). Ne jamais les modifier à la main. Les copies de ce dossier sont des exemples fictifs |
| `Dockerfile`, `Dockerfile.dockerignore` | L'image : cargo-chef, distroless, certificat RDS |
| `comparer.sh` | Compare deux portes sur des requêtes sans secret, avant la bascule du domaine |
| `sonde.sh` | Toutes les 500 ms, qui répond sous une adresse, et mesure le trou d'une mise en ligne ou d'une bascule |

## Les commandes

```bash
cd services/porte
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
# Essai différentiel avec verify.ts, à la main (chapitre 15, section 15.3) :
PORTE_DIFFERENTIEL=/chemin/cas.json cargo test --locked -- --ignored
```

## Les variables

| Variable | Obligatoire | Sens |
|---|---|---|
| `DATABASE_URL_PORTE` | oui | Le rôle `leon_porte`, `sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem`. Absente ou illisible : le service ne démarre pas. Injoignable ou refusée : `/sante` répond 503 jusqu'à la première lecture réussie, et le déploiement échoue |
| `LEON_PORTE_KEY` | pour les abonnements | 32 octets en base64, l'un ou l'autre alphabet. Absente : 503 aux livraisons d'abonnement |
| `LEON_PORTE_URL` | pour HubSpot | L'adresse publique. Absente : 503 quand la signature couvre l'adresse |
| `LEON_IP_HEADER` | en production | L'en-tête de l'adresse IP posé par le proxy (`x-real-ip`) |
| les secrets nommés par `fournisseurs.json` | selon les outils | Aujourd'hui `LEON_OAUTH_HUBSPOT_SECRET` |
| `PORT` | non | Posé par Railway ; 8080 sinon |
| `SENTRY_DSN`, `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_ENVIRONMENT_NAME` | non | Sentry |

Rien d'autre : ni `LEON_CONNECTORS_KEY`, ni `DATABASE_URL`, ni jeton d'outil.
