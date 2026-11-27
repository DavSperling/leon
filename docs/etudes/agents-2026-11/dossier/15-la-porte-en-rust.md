# 15. La porte en Rust

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Sources : l'architecture (`00-architecture.md`, sections 2, 3, 4, 6, 7.4, 8.3, 11, 12 écart E1, 13 question Q1, 14.3), le chapitre 01 (les fonctions `porte_secret` et `porte_deposer`, section 11), le chapitre 03 (la porte en Hono, `verify.ts`, le format de `fournisseurs.json` et de `vecteurs.json`, sections 4 à 7), le chapitre 13 (services, pools, variables, certificat, domaine : sections 4, 8, 9, 10, 11, 15.6), les notes 01, 02, 04 et 05. Code relu le 20/11/2026 (commit `b075333`).

Convention : **existe** (lu dans le dépôt, avec chemin et ligne), **à créer** (le nom vient de l'architecture, sinon de ce chapitre), **à vérifier** (vient d'une note de recherche ou de ma mémoire : à lire dans la documentation de l'éditeur avant d'écrire le code).

**En une phrase, honnêtement.** Rust ne sert ici qu'à une chose : une passerelle de webhooks qui reste debout quand Node redémarre. Tout le reste (connecteurs, standard, moteur, actions, recherche, écrans) reste en TypeScript, et aucun concurrent proche ne fait autrement (note 01). Même cette passerelle n'est pas pressée : la route Hono du chapitre 03 tient le même contrat, et rien ne mesure aujourd'hui qu'elle ne suffit pas. Ce chapitre écrit donc le service Rust en entier, compilé et testé, pour que la décision se prenne sur pièces (architecture, écart E1, question Q1), et dit quelle mesure la déclenche.

**Jalon.** Rien de ce chapitre n'est dans le jalon 1 (architecture, 14.3). La porte en Hono elle-même vient après le jalon 1 (chapitre 03, section 14). Le service Rust vient encore après, sur une des trois mesures de la section 4, ou sur décision de David.

**Ce qui a tourné.** Contrairement aux autres chapitres, le code de celui-ci a été construit et lancé, hors du dépôt, dans un dossier de travail, une première fois à l'écriture et une seconde après la relecture contradictoire (section 19) :

- `cargo check`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` et `cargo test` passent avec Rust 1.97.0 : 35 tests, plus l'essai différentiel lancé à la main (section 5.4, sorties recopiées) ;
- les 22 cas de vérification, les 2 cas de déchiffrement et les 11 cas de porte de `vecteurs.json` passent, tels que le générateur du chapitre 03 les produit ;
- un essai différentiel de 425 cas, jugés par le `verify.ts` du chapitre 03 sous Node, ne trouve que deux écarts, attendus et écrits (section 15.3) ;
- le binaire de production a tourné contre une base **Postgres 16** jetable (pas 17, la version de `docker-compose.yml` et de RDS : seule la 16 était installable dans la session) portant les deux fonctions du chapitre 01, recopiées telles quelles : livraisons Outlook, HubSpot (deux organisations) et Fathom déposées, `NOTIFY leon_porte` reçu, refus en 202 ms, arrêt propre sur `SIGTERM`. Après la relecture, aussi : un mot de passe faux (`/sante` reste en 503), une base lente (503 en 2 s, requête arrêtée par Postgres) et `comparer.sh` entre le binaire d'avant et celui d'après (section 15.4).

Ni l'image Docker (pas de démon Docker dans la session), ni Railway, ni RDS n'ont été essayés. Le code est dans `dossier/code/porte/`, à l'identique de ce qui a compilé ; ce chapitre le recopie.

## 1. Ce que ce chapitre fixe

1. **Le service `porte` en Rust, en entier** : `services/porte/Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `src/main.rs`, `src/verifier.rs`, `src/depot.rs`, `src/secret.rs`, et ses tests (`src/tests.rs`). Il lit `fournisseurs.json` et passe `vecteurs.json` tels que le chapitre 03 les génère.
2. **L'image et la CI** : le `Dockerfile` (cargo-chef, distroless, certificat RDS au même chemin que dans l'image de `web`) et le job `porte` de `.github/workflows/tests.yml`.
3. **La mise en service** : les variables que lit le binaire, sa colonne Railway (laissée « fixé au chapitre 15 » par le chapitre 13), la bascule du domaine de `LEON_PORTE_URL` avec la sonde qui mesure le trou et la relève forcée qui le rattrape, le retour arrière, et le jour où la route Hono s'éteint.
4. **Quand construire** : les trois mesures de l'architecture (section 3), avec une règle d'effectif pour M2 et M3, et la ligne de journal `porte.reponse` (l'intergiciel `measure` de la porte en Hono) qui permet de les lire.
5. **Les autres candidats Rust** (module `napi-rs` pour `maskSecrets` et `chunkText`, relève des connecteurs, moteur de recherche, exécution isolée en WebAssembly) : rien n'est fixé ici. Leur verdict et leur mesure sont ceux de l'architecture (section 3) ; la section 14 dit seulement comment prendre chaque mesure, sans code à construire.

## 2. Vue d'ensemble

Le service fait ce que fait la route Hono, dans le même ordre (chapitre 03, 6.1), avec les mêmes réponses sur chaque cas de `vecteurs.json` (les écarts hors de ces cas sont en 9.4). Il ne lit que deux fichiers générés et deux fonctions SQL.

```mermaid
flowchart LR
  E[Éditeur : Graph, Fathom, HubSpot] -- "POST signé<br/>LEON_PORTE_URL/h/…" --> P
  subgraph P["service porte (Rust, axum)"]
    direction TB
    M["main.rs<br/>1 corps ≤ 256 Kio · 2 adresse · 3 écho<br/>4 UTF-8 · 5 LEON_PORTE_URL"]
    D["depot.rs<br/>6 caches, limite par IP, porte_secret"]
    S["secret.rs<br/>déchiffrement v1"]
    V["verifier.rs<br/>7 signature"]
    M2["main.rs<br/>8 challenge · 9 compte · 10 livraison<br/>11 en-têtes · 12 porte_deposer"]
    M --> D --> S --> V --> M2
  end
  F[(fournisseurs.json<br/>compilé dans le binaire)] -.-> P
  P -- "rôle leon_porte :<br/>porte_secret, porte_deposer" --> B[(boite_entree_webhooks<br/>+ NOTIFY leon_porte)]
  B --> W[worker : inbox.ts, chapitre 03]
```

| # | Pièce | Fichier | État | Rôle | Jalon |
|---|---|---|---|---|---|
| 1 | La caisse | `services/porte/Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.gitignore` | à créer | Versions exactes, Rust 1.97.0 | après |
| 2 | L'interprète | `services/porte/src/verifier.rs` | à créer | Les quatre modes de `WebhookVerification` (architecture 8.3), comme `verify.ts` | après |
| 3 | Les secrets | `services/porte/src/secret.rs` | à créer | Déchiffrement `v1:` (AES-256-GCM, `LEON_PORTE_KEY`) | après |
| 4 | Le dépôt | `services/porte/src/depot.rs` | à créer | `porte_secret`, `porte_deposer`, caches, limite par adresse IP | après |
| 5 | Les routes | `services/porte/src/main.rs` | à créer | Lecture de `fournisseurs.json` et des variables, quatre routes, déroulé d'une requête, arrêt propre | après |
| 6 | Les tests | `services/porte/src/tests.rs` | à créer | Les cas de `vecteurs.json`, puis délai, limite, caches, pannes | après |
| 7 | Le contrat | `services/porte/fournisseurs.json`, `services/porte/vecteurs.json` | à créer **par le chapitre 03** (PR W5), générés | Lus tels quels ; jamais modifiés ici | après |
| 8 | L'image | `services/porte/Dockerfile`, `services/porte/Dockerfile.dockerignore` | à créer | cargo-chef, distroless, certificat RDS | après |
| 9 | La CI | `.github/workflows/tests.yml` | existe (jobs `code` et `base`) | Job `porte` : `cargo fmt --check`, `cargo clippy`, `cargo test` | après |
| 10 | La comparaison | `services/porte/comparer.sh` | à créer | Deux portes, mêmes requêtes sans secret, mêmes réponses ? | après |
| 11 | La mesure | `src/server/webhooks/hono-gate.ts` | à créer au chapitre 03 ; une ligne ajoutée ici | `porte.reponse` : statut et durée de chaque réponse | avec la porte en Hono |
| 12 | Le service Railway | tableau de bord | à créer | Colonne `porte` du chapitre 13 (4.1, 8.2, 9) | après |
| 13 | Le domaine | DNS de `porte.<domaine>` | à créer au chapitre 13 (section 11) | Passe de `web` au service `porte` | après |

Ce que ce chapitre ne refait pas : le SQL de `porte_secret` et `porte_deposer` (chapitre 01, section 11), la description `WebhookVerification` et ses règles (architecture 8.3, chapitre 03 section 4), le format et le générateur de `fournisseurs.json` et `vecteurs.json` (chapitre 03, section 7), les abonnements (chapitre 03, section 11), le rôle `leon_porte` en production et le domaine de départ (chapitre 13, sections 10 et 11).

## 3. Où Rust sert, où il ne sert pas

### 3.1 Ce que disent les recherches, sans arrangement

- « Tous les concurrents utilisent Rust » est faux. Parmi les produits proches (Glean, Langdock, Sana, Onyx, Notion, n8n, Nango, Linear), aucun Rust trouvé dans la logique métier. Seul Dust a un service Rust (`core`), et ses connecteurs, son interface et ses workers sont en TypeScript (note 01, « Dust »). Rust est massif chez les fournisseurs de briques (Qdrant, Meilisearch, turbopuffer, Restate, cœur des SDK Temporal) et dans les outils lancés sur le poste (Codex CLI, runtime de Copilot), où le démarrage et la mémoire comptent (note 01, « Réponse courte »).
- La note 01 recommande de ne pas écrire de Rust au lancement. La note 02 dit : « si Rust, un seul service : la passerelle de webhooks », et « si le temps manque, démarrer la passerelle en TypeScript (Hono) derrière la même boîte d'envoi ».
- L'architecture garde la décision D1 comme destination, pas comme premier pas : la route Hono d'abord, le service Rust sur mesure ou sur décision de David (écart E1, question Q1).

### 3.2 Ce que le service Rust apporte vraiment

| Gain | Ce qu'il vaut | D'où il vient |
|---|---|---|
| Rester debout pendant une mise en ligne de `web` | Mince. Railway démarre la nouvelle version avant d'arrêter l'ancienne (architecture, 3) : le trou d'une route Hono est de quelques secondes au plus, que Microsoft et HubSpot rattrapent par leurs reprises (à vérifier pour chaque éditeur, notes 04 et 05). Seul GitHub ne reprend pas (note 05), et il n'est pas dans le premier lot. Et la bascule elle-même ouvre un trou, sans doute plus long, à l'aller puis à chaque retour arrière (section 13, et 3.3) : le gain ne vient qu'après | D'un **service séparé**, pas de Rust |
| Un processus public qui ne tient aucun jeton d'outil | Réel, avec une limite. La porte en Hono vit dans `web`, dont le processus a `LEON_CONNECTORS_KEY`, `DATABASE_URL` et charge `connectors/pipedream` (chapitre 03, écart E-s). Le binaire Rust ne reçoit que sa base `leon_porte`, `LEON_PORTE_KEY`, son adresse et les secrets de signature : une faille dans l'analyse d'une requête n'atteint aucun jeton d'outil, et ne permet ni de lire ni d'écrire dans un outil. Mais il tient les secrets de signature de toutes les organisations : `LEON_PORTE_KEY` ouvre le `clientState` de chaque abonnement, `LEON_OAUTH_HUBSPOT_SECRET` signe pour n'importe quel portail. Un compromis permet donc de forger des signaux. L'effet reste borné : une livraison n'est qu'un signal, et la relève qui la suit relit l'objet chez l'éditeur, par la connexion de la personne (chapitre 03, 8.5 ; architecture, section 5) | D'un **service séparé**. Un service Node à part donnerait la même isolation, pour le prix d'une seconde image Node |
| Mémoire et image | Mesuré en local (section 15.4) : binaire de 6,4 Mo, 7,4 Mo de mémoire résidente après une dizaine de requêtes. L'estimation de la note 02 (50 à 150 Mo) était large. Sur Railway (10 $ par Go et par mois, note 02), c'est moins d'un dollar | De Rust |
| Un analyseur en temps borné | `serde_json` et `axum` n'ont pas de cas pathologique connu sur un corps de 256 Kio ; Node non plus en pratique | Marginal |
| Indépendance du cycle de `web` | La porte se déploie à part, ne relit pas `node_modules`, n'attend pas un `next build` | D'un service séparé |

Ce que le service Rust **ne** donne **pas** : il dépend du même Postgres et ne survit pas à une panne de base (il répond 503, comme la route Hono). Il ne rend aucun webhook plus rapide côté métier : le traitement reste dans le worker.

### 3.3 Ce qu'il coûte

- **Une seconde mise en œuvre** de chaque mode de vérification, du déchiffrement `v1:`, des caches et de la limite par adresse IP, tenue égale à la première par `vecteurs.json`. Ce chapitre montre que c'est faisable (les 35 cas passent, et 425 cas tirés au hasard ne trouvent que deux écarts connus, section 15.3), mais chaque nouveau mode ou nouvel outil se code deux fois.
- **Une chaîne de plus** : `cargo`, `rustup`, 188 caisses compilées (195 avec celles de construction), un `Cargo.lock` de 3 018 lignes à surveiller (`cargo deny` : à ajouter plus tard, section 11).
- **Du Rust à relire par deux fondateurs venus de TypeScript** (note 02, section 7). Le code de ce chapitre évite les génériques savants et les durées de vie explicites ; il garde les noms et l'ordre de `hono-gate.ts` pour se lire en parallèle.
- **La bascule** : déplacer le domaine coupe les livraisons le temps du DNS et du certificat, à l'aller et à chaque retour arrière (13.3, 13.5). Ce trou se paie par une relève forcée juste après (13.3, geste 6) et par une heure choisie, hors des réunions des clients (Fathom ne documente aucune reprise, note 05).
- **Le temps** : l'architecture estimait 3 à 5 jours. Le code est écrit ; restent l'image, Railway, la bascule et l'essai réel, soit 1 à 2 jours (estimation de ma part).

### 3.4 Les candidats, un par un

Le tableau de l'architecture (section 3), recopié, avec la section de ce chapitre qui en donne le code (la porte) ou la mesure (les autres).

| Candidat | Verdict | Mesure qui déclenche | Ici |
|---|---|---|---|
| **La porte** : passerelle de webhooks (axum, tokio, sqlx), service séparé | Oui, seule pièce Rust, en second. La route Hono tient le contrat d'abord | Un abonnement désactivé par un éditeur après des échecs pendant un déploiement, ou plus de 0,1 % de livraisons en 5xx ou hors délai sur 7 jours, ou un p95 de réponse au-dessus d'une seconde | Sections 4 à 13 : le code entier ; la règle d'effectif des mesures (section 4, écart E15-8) |
| Masquage de secrets (`maskSecrets`) et découpage (`chunkText`) en module `napi-rs` | Non maintenant | Un profil du worker qui montre plus de 20 % du CPU dans `normalizeItem` ou `chunkText` pendant une première relève, ou un incident de regex bloquante | 14.1 : la mesure |
| Relève des connecteurs en Rust | Non | Aucune mesure réaliste. À rouvrir seulement si le worker sature en CPU sur du décodage JSON, profil à l'appui | 14.2 : la mesure |
| Moteur de recherche (tantivy embarqué, Qdrant) | Non. Si besoin : acheter un service, ne pas écrire | Recherche avec mots au-dessus d'une seconde au p95 sur le corpus d'un client, après avoir épuisé Postgres | 14.3 : la mesure |
| Exécution isolée en WebAssembly (`wasmtime` 50.0.3) | Non avant l'éditeur d'agents | La décision produit d'exécuter du code écrit par un client ou généré par un modèle | 14.4 : la mesure |
| Moteur d'exécution durable | Rust « en dépendance » seulement (Temporal, Restate) | Architecture 9.2 | rien ici |
| Client lourd (agent local, extension) | Non, hors produit | Le jour où Leon livre un agent sur le poste | rien ici |

## 4. Quand construire : les trois mesures

L'architecture (section 3) fixe trois déclencheurs. Aucun n'est mesurable aujourd'hui : la porte en Hono du chapitre 03 n'écrit rien au journal quand tout va bien. Cette section dit comment les lire. La mesure commence avec la porte en Hono (après le jalon 1), et dure au moins 7 jours avant de décider.

| # | Déclencheur (architecture, 3) | Ce qu'on lit | Où |
|---|---|---|---|
| M1 | Un abonnement désactivé par un éditeur après des échecs pendant un déploiement | Les abonnements passés à `expiree` ou `erreur`, ou restés muets ; l'heure de leur dernière livraison, rapprochée des mises en ligne de `web` | Requête SQL 4.2, liste des déploiements de Railway |
| M2 | Plus de 0,1 % de livraisons en 5xx ou hors délai sur 7 jours | Les lignes `porte.reponse` dont le statut n'est pas 401 : les 5xx et celles au-dessus de 3 secondes. En part à partir de 1 000 livraisons dans la semaine, en nombre en dessous (plus de 3) | Journal de `web`, 4.3 |
| M3 | Un p95 de réponse au-dessus d'une seconde | Les mêmes lignes, statut 202, à partir de 1 000 livraisons acceptées | Journal de `web`, 4.3 |

« Hors délai » : plus de 3 secondes. C'est le plus court des délais relevés par les notes (Slack et Zoom, 3 s ; Front, 5 s ; Graph, GitHub et Zendesk, 10 s : notes 04 et 05, sources tierces pour la plupart). Un 401 ne compte pas : c'est le refus uniforme, qui attend 200 ms exprès.

Une seule mesure suffit à déclencher. Sans aucune des trois, le service Rust reste dans ce chapitre, sauf décision de David (question Q1).

**À l'échelle de Leon.** Le volume d'une société de 20 à 200 personnes va de quelques dizaines de livraisons par semaine (HubSpot et Fathom, quelques personnes branchées) à des dizaines de milliers (Outlook branché sur chaque boîte) : c'est une estimation, rien ne le mesure encore. Au bas de cette fourchette, un seul 503 dépasse 0,1 % de la semaine, et un p95 calculé sur trente réponses ne dit rien. D'où une règle d'effectif, qui précise l'architecture (écart E15-8) : M2 se lit en part à partir de 1 000 livraisons dans la semaine, et en nombre en dessous (plus de 3 livraisons en 5xx ou hors délai) ; M3 ne se lit qu'à partir de 1 000 livraisons acceptées, et ne conclut pas en dessous. M1, qui se lit en base, sans export ni effectif, reste le déclencheur principal.

### 4.1 La ligne `porte.reponse` dans la porte en Hono

Fichier : `src/server/webhooks/hono-gate.ts` (à créer au chapitre 03, PR W5). L'ajout est à faire dans la même PR, ou dans une PR à part juste après. Une ligne par réponse, au format de `console.info('[leon]', …)` (architecture, section 2, observabilité), sans corps, sans en-tête, sans identifiant d'abonnement : l'outil, le statut, la durée.

C'est un intergiciel placé en tête de chaque route, avant `limit`, et non une fonction autour de `receive` : la ligne doit compter aussi les réponses que `receive` ne rend pas. Le 413 de `bodyLimit` (qui lit un corps sans `content-length` avant la route), et le 500 que Hono rend quand la lecture du corps échoue ou qu'une erreur sort de `receive` avant son `try` (`specFor` et `c.req.arrayBuffer()` sont hors de son `try`, chapitre 03, 6.2). Essayé hors du dépôt avec hono 4.13.18 : une livraison juste, un corps trop gros, une erreur levée dans la route et un flux de corps coupé donnent chacun une ligne, avec 202, 413, 500 et 500.

```ts
// src/server/webhooks/hono-gate.ts (à créer au chapitre 03), dans createPorteRoutes, avant `limit`.
// import type { MiddlewareHandler } from 'hono';

  // Mesure (dossier agents, chapitre 15, section 4) : une ligne par réponse, sans contenu ni identifiant d'abonnement.
  // Elle donne la part de 5xx et le p95 des livraisons, qui décident de la construction du service Rust ; le service
  // Rust écrit la même ligne. Placée avant bodyLimit, elle voit aussi le 413, et le 500 que Hono rend quand la lecture
  // du corps échoue ou qu'une erreur sort de receive avant son try.
  const measure: MiddlewareHandler = async (c, next) => {
    const started = deps.now();
    const raw = c.req.param('outil') ?? '';
    const outil = OUTIL.test(raw) ? raw : 'inconnu';
    let failed = false;
    try {
      await next();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      const statut = failed ? 500 : c.res.status;
      console.info('[leon]', 'porte.reponse', JSON.stringify({ outil, statut, ms: deps.now() - started }));
    }
  };
```

Et dans `createPorteRoutes`, chaque route reçoit `measure` en premier : `routes.post('/h/:outil', measure, limit, (c) => receive(…))`, de même pour les deux autres. Tests à ajouter dans `hono-gate.test.ts` (chapitre 03, 13.3), en espionnant `console.info` avec `vi.spyOn` : une livraison juste écrit une ligne `porte.reponse` avec `statut: 202` ; un corps trop gros, une ligne avec `statut: 413` ; un corps dont le flux échoue (`new ReadableStream({ pull: (ctrl) => ctrl.error(new Error('coupé')) })`, avec `duplex: 'half'`), une ligne avec `statut: 500` ; aucune ligne ne contient le corps ni l'identifiant d'abonnement.

### 4.2 M1 : les abonnements qui se taisent

Requête en lecture seule, sous le rôle propriétaire (celui des migrations : `leon_app` ne lit pas les abonnements des autres). Les colonnes viennent du chapitre 01 (`0083-webhooks.sql`) ; `connections.last_sync_at` existe (`src/server/db/schema/connections.ts:29`).

```sql
-- Les abonnements retirés par l'éditeur ou muets depuis 3 jours, avec la dernière livraison reçue.
-- Des identifiants et des dates seulement.
select a.outil, a.etat, a.erreur, a.dernier_recu_le, a.cree_le, c.last_sync_at
  from abonnements_webhook a
  join connections c on c.tenant_id = a.tenant_id and c.id = a.connection_id
 where a.etat = any (array['expiree', 'erreur'])
    or (a.etat = 'active' and coalesce(a.dernier_recu_le, a.cree_le) < now() - interval '3 days')
 order by coalesce(a.dernier_recu_le, a.cree_le);

-- Les notifications de cycle de vie reçues par jour (gardées 7 jours, purger_boite_entree) : une rafale de
-- « supprime » après une mise en ligne dit qu'un éditeur a retiré des abonnements.
select date_trunc('day', recu_le) as jour, outil, count(*)
  from boite_entree_webhooks
 where genre = 'cycle'
 group by 1, 2
 order by 1;
```

Un abonnement muet n'est pas forcément mort : une boîte sans courrier depuis 3 jours se tait aussi. Le signe est la conjonction : `dernier_recu_le` arrêté juste après une mise en ligne de `web`, alors que la relève de 15 minutes de la même connexion trouve des éléments nouveaux. Le rapprochement se fait à la main, avec la liste des déploiements de Railway (heure de chaque mise en ligne : tableau de bord, à vérifier dans la documentation de l'éditeur).

### 4.3 M2 et M3 : la part de 5xx et le p95

Sur un export du journal de `web` couvrant 7 jours (commande d'export de Railway, ou téléchargement depuis le tableau de bord : à vérifier dans la documentation de l'éditeur ; la durée de rétention des journaux dépend de l'offre, à vérifier aussi). Les lignes `porte.reponse` ont deux formes : `[leon] porte.reponse {"outil":"outlook","statut":202,"ms":12}` pour la porte en Hono, et une ligne JSON de `tracing` pour le service Rust (`{"fields":{"event":"porte.reponse","outil":"outlook","statut":202,"ms":12},…}`, section 9). Le même programme lit les deux, ce qui permet de comparer les deux semaines sans rien changer (essayé sur un fichier qui mêle les deux formes).

```bash
# M2 et M3 sur un export de journal (un fichier texte), celui de web ou celui du service porte : les deux formes de la
# ligne porte.reponse sont lues. jq est le seul outil demandé.
jq -nR '
  [ inputs
    | (fromjson? | objects | .fields | select(.event? == "porte.reponse"))
      // (capture("porte\\.reponse (?<j>\\{.*\\})")? | .j | fromjson)
    | {outil, statut, ms} ]
  | map(select(.statut != 401)) as $l
  | ($l | length) as $n
  | ($l | map(select(.statut >= 500 or .ms > 3000)) | length) as $mauvaises
  | ($l | map(select(.statut == 202)) | map(.ms) | sort) as $ok
  | (if ($ok | length) > 0 then $ok[(($ok | length) * 0.95 | floor)] else null end) as $p95
  | {
      livraisons: $n,
      en_5xx_ou_hors_delai: $mauvaises,
      p95_ms: $p95,
      M2: (if $n >= 1000 then $mauvaises / $n > 0.001 else $mauvaises > 3 end),
      M3: (($ok | length) >= 1000 and $p95 > 1000)
    }' journal.txt
```

Ce que M2 ne voit pas : une réponse que le proxy de Railway rend lui-même (un 502 pendant une mise en ligne, quand aucun processus ne répond) n'écrit aucune ligne `porte.reponse`. Pour la fenêtre d'une mise en ligne, c'est la sonde (13.2) qui compte le trou, ou le journal du proxy de Railway s'il s'exporte (à vérifier). Et si l'export du journal n'existe pas sur l'offre, ou garde moins de 7 jours, M2 et M3 ne se mesurent pas : M1 et la sonde restent.

Après la bascule, le même programme lit le journal du service Rust. On compare les deux semaines : si le service Rust ne fait pas mieux sur la mesure qui l'a déclenché, on revient en arrière (section 13.5).

Une dernière mesure, utile avant de décider : le trou d'une mise en ligne de `web`. La sonde de la section 13.2, lancée pendant une mise en ligne ordinaire, dit combien de secondes la porte en Hono répond autre chose que son refus uniforme. Si c'est zéro, M1 a peu de chances d'arriver.

## 5. La caisse : `Cargo.toml`, `rust-toolchain.toml`, `Cargo.lock`

Dossier : `services/porte/` (à créer ; le chapitre 03 y a déjà mis `fournisseurs.json` et `vecteurs.json`). Une caisse seule, pas d'espace de travail Cargo à la racine du dépôt : rien d'autre n'est en Rust, et la note 02 (8.1) ne propose un espace de travail que pour partager des types, ce que fait déjà `fournisseurs.json`.

### 5.1 Les versions

Versions exactes (`=`), comme `package.json` (`"hono": "4.13.18"`, sans `^`). `Cargo.lock` est commité ; la CI et le Dockerfile construisent avec `--locked`.

| Caisse | Architecture (section 2) | Ici | Pourquoi |
|---|---|---|---|
| `axum` | 0.8.9 | 0.8.9, fonctionnalités `http1`, `tokio` | Le serveur. Pas de `json` ni de `macros` : les réponses sont des textes fixes |
| `tokio` | 1.54.1 | 1.54.1 | `macros`, `net`, `rt-multi-thread`, `signal`, `sync`, `time` ; `test-util` en test seulement |
| `tower` | 0.5.3 | 0.5.3, **en test seulement** (`ServiceExt::oneshot`) | Le service n'empile aucune couche |
| `http-body` | absent | **1.1.0, en test seulement** | Un corps qui échoue en cours de lecture (test `un_corps_interrompu_recoit_400_et_non_413`). Déjà dans l'arbre par `axum` : aucune caisse de plus. Écart E15-1 |
| `tower-http` | 0.7.1 | **non utilisée** | La limite du corps se fait en lisant le corps (`read_body`, sur le trait `HttpBody` que réexporte `axum`), les délais par `tokio::time::timeout` : la réponse reste celle de la porte en Hono (413 JSON), et un client qui coupe se distingue d'un corps trop gros |
| `sqlx` | 0.9.1 | 0.9.1, `runtime-tokio`, `tls-rustls-ring-webpki`, `postgres`, `uuid`, `json`, **sans `macros`** | Aucune base à la compilation (pas de `cargo sqlx prepare`, pas de dossier `.sqlx/`). Deux requêtes, écrites en texte |
| `hmac`, `sha2`, `subtle` | 0.13.0, 0.11.1, 2.6.1 | idem | Signatures, comparaisons en temps constant |
| `sha1` | absent | **0.11.0** | Le mode `hmac-sha1` de `WebhookVerification` (architecture 8.3) en a besoin. Écart E15-1 |
| `aes-gcm` | « version à vérifier » | **0.11.1** (crates.io, lue le 20/11/2026, Rust 1.85 minimum) | Le format `v1:` |
| `base64`, `hex`, `uuid` | 0.23.1, 0.4.3, 1.29.3 | idem | |
| `form_urlencoded` | absent | **1.2.2** | Décoder `validationToken` et le champ `payload` d'un formulaire comme `URLSearchParams` (« + » vaut une espace). Écart E15-1 |
| `serde`, `serde_json` | 1.0.229, 1.0.154 | idem | |
| `tracing`, `tracing-subscriber` | 0.1.44 ; `tracing-subscriber` 0.3.23 dans la note 02 | idem | Journal en lignes JSON sur la sortie standard, les lignes de la porte seulement (filtre `Targets`) |
| `sentry` | 0.49.6 | 0.49.6, sans les fonctionnalités par défaut : `backtrace`, `contexts`, `panic`, `ureq`, `rustls` | Envoi par `ureq` et `rustls` : ni OpenSSL, ni second client HTTP |

Ce que la résolution donne (`cargo tree`, 20/11/2026, recompté après la relecture) : 188 caisses compilées pour le binaire, 195 avec celles de construction ; ni `openssl`, ni `aws-lc-sys` (le Dockerfile n'a donc besoin ni de `cmake` ni des en-têtes d'OpenSSL). `Cargo.lock` fait 3 018 lignes : il est dans `dossier/code/porte/Cargo.lock`, et n'est pas recopié ici.

Rust : `rust-version = "1.94"` est le minimum de `sqlx` 0.9.1 (note 02). Seul Rust 1.97.0 a été essayé ; c'est celui que fixent `rust-toolchain.toml`, l'image et la CI.

### 5.2 `services/porte/Cargo.toml` (à créer)

```toml
# La porte des webhooks de Leon, en Rust (dossier agents, chapitre 15). Seconde mise en œuvre du contrat que tient
# d'abord la route Hono (src/server/webhooks/hono-gate.ts, chapitre 03) : mêmes adresses, mêmes étapes, mêmes réponses
# sur chaque cas de vecteurs.json (les écarts hors de ces cas : chapitre 15, section 9.4).
# Elle lit fournisseurs.json (compilé dans le binaire) et passe vecteurs.json (cargo test). Les deux fichiers sont
# générés depuis le TypeScript par `pnpm porte:generer` : on ne les modifie jamais à la main.
#
# Versions exactes, comme package.json. Cargo.lock est commité ; la CI et le Dockerfile construisent avec --locked.

[package]
name = "porte"
version = "0.1.0"
edition = "2024"
rust-version = "1.94"
publish = false

[dependencies]
# Déchiffrement des secrets d'abonnement (format v1 de src/server/connectors/crypto.ts).
aes-gcm = { version = "=0.11.1", default-features = false, features = ["aes", "alloc"] }
# Le serveur HTTP : HTTP/1.1 seulement, le proxy de Railway parle HTTP/1.1 au service (à vérifier).
axum = { version = "=0.8.9", default-features = false, features = ["http1", "tokio"] }
base64 = "=0.23.1"
# La chaîne de requête d'un écho de validation et le champ `payload` d'un corps form-payload, décodés comme
# URLSearchParams (« + » vaut une espace).
form_urlencoded = "=1.2.2"
hex = "=0.4.3"
hmac = "=0.13.0"
# Seulement l'envoi des erreurs et des paniques, par ureq et rustls : pas d'OpenSSL dans l'image.
sentry = { version = "=0.49.6", default-features = false, features = ["backtrace", "contexts", "panic", "ureq", "rustls"] }
serde = { version = "=1.0.229", features = ["derive"] }
serde_json = "=1.0.154"
sha1 = { version = "=0.11.0", default-features = false }
sha2 = { version = "=0.11.1", default-features = false }
# Postgres sans macros : aucune base n'est requise pour compiler. rustls avec ring, certificat RDS par sslrootcert.
sqlx = { version = "=0.9.1", default-features = false, features = ["runtime-tokio", "tls-rustls-ring-webpki", "postgres", "uuid", "json"] }
subtle = "=2.6.1"
tokio = { version = "=1.54.1", features = ["macros", "net", "rt-multi-thread", "signal", "sync", "time"] }
tracing = "=0.1.44"
tracing-subscriber = { version = "=0.3.23", default-features = false, features = ["fmt", "json", "std"] }
uuid = { version = "=1.29.3", default-features = false, features = ["std"] }

[dev-dependencies]
# Un corps qui échoue en cours de lecture (client qui coupe) : déjà dans l'arbre par axum, nommé ici pour les tests.
http-body = "=1.1.0"
# start_paused : le refus uniforme attend 200 ms sans ralentir les tests.
tokio = { version = "=1.54.1", features = ["macros", "rt", "test-util"] }
tower = { version = "=0.5.3", default-features = false, features = ["util"] }

[profile.release]
lto = "thin"
codegen-units = 1
strip = true
```

### 5.3 `services/porte/rust-toolchain.toml` et `services/porte/.gitignore` (à créer)

```toml
# La chaîne Rust de la porte (dossier agents, chapitre 15). La même que l'image du Dockerfile et que le job `porte`
# de .github/workflows/tests.yml : les trois changent ensemble. rustfmt et clippy s'installent à part (CI, poste).
[toolchain]
channel = "1.97.0"
profile = "minimal"
```

Le `.gitignore` de la racine (existe) ne couvre pas `target/` ; plutôt que de le toucher, la caisse a le sien :

```gitignore
# Le dossier de construction de cargo.
/target/
```

### 5.4 Ce que donnent les commandes

Lancées dans le dossier de travail, avec le code de ce chapitre tel qu'il est après la relecture (section 19), après un `cargo clean` (machine de la session : 4 processeurs, 15 Go ; les caisses étaient déjà téléchargées). Sorties recopiées, lignes `Compiling` et `Checking` retirées :

```text
$ cargo check --locked --all-targets
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 20.32s
$ cargo fmt --check
(rien : le code est déjà formaté)
$ cargo clippy --locked --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.90s
$ cargo test --locked
    Finished `test` profile [unoptimized + debuginfo] target(s) in 25.00s
     Running unittests src/main.rs (target/debug/deps/porte-ea8cf251fcf9d1a9)

running 36 tests
test depot::tests::une_erreur_de_base_ne_garde_aucun_message ... ok
test depot::tests::memo_expire_et_evince_la_plus_ancienne ... ok
test depot::tests::la_fenetre_ne_se_prolonge_pas ... ok
test secret::tests::la_cle_se_lit_dans_les_deux_alphabets_comme_node ... ok
test secret::tests::un_format_inconnu_est_illisible ... ok
test tests::cle_d_adresse_ip ... ok
test secret::tests::la_cle_fait_32_octets ... ok
test tests::differentiel_avec_verify_ts ... ignored, à la main : PORTE_DIFFERENTIEL=<cas.json> cargo test -- --ignored
test tests::fournisseurs_est_dans_la_version_connue ... ok
test tests::de_l_utf8_invalide_recoit_400 ... ok
test tests::le_bilan_de_sante_attend_la_premiere_lecture_de_la_base ... ok
test tests::l_echo_fait_1_024_caracteres_au_plus ... ok
test tests::le_cache_negatif_evite_une_seconde_lecture ... ok
test tests::les_secrets_d_application_sont_les_seuls_lus ... ok
test tests::le_refus_attend_au_moins_200_ms ... ok
test tests::sentry_ne_recoit_aucun_texte_recu ... ok
test tests::sentry_recoit_un_envoi_par_minute_et_par_evenement ... ok
test tests::le_cache_positif_expire_apres_60_s ... ok
test tests::sans_leon_porte_url_une_signature_sur_l_adresse_recoit_503 ... ok
test tests::un_compte_illisible_est_accepte_sans_depot ... ok
test tests::un_corps_trop_gros_recoit_413 ... ok
test tests::un_corps_interrompu_recoit_400_et_non_413 ... ok
test tests::un_corps_trop_gros_recoit_413_avant_l_adresse ... ok
test tests::un_secret_illisible_est_un_refus_et_non_une_panne ... ok
test tests::une_panne_de_base_n_est_pas_un_refus ... ok
test tests::vecteurs_de_dechiffrement ... ok
test tests::une_base_lente_recoit_503_en_2_s ... ok
test tests::une_requete_ne_dure_jamais_plus_de_3_s ... ok
test verifier::tests::base64_tolere_les_bits_de_fin_comme_node ... ok
test tests::vecteurs_de_la_porte ... ok
test tests::vecteurs_de_verification ... ok
test verifier::tests::formulaire_payload ... ok
test verifier::tests::pointeur_avec_etoile_et_entiers_surs ... ok
test verifier::tests::chaque_mode_refuse_un_champ_inconnu ... ok
test verifier::tests::une_moitie_de_paire_seule_devient_u_fffd_comme_dans_node ... ok
test tests::au_dela_de_la_limite_une_adresse_hors_cache_recoit_503 ... ok

test result: ok. 35 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.03s
```

Le binaire de production :

```text
$ cargo build --release --locked
    Finished `release` profile [optimized] target(s) in 1m 06s
$ ls -l target/release/porte && ldd target/release/porte
6376608 octets
	linux-vdso.so.1
	libgcc_s.so.1 => /lib/x86_64-linux-gnu/libgcc_s.so.1
	libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
	/lib64/ld-linux-x86-64.so.2
```

6,4 Mo, lié seulement à glibc, libm et libgcc : l'image distroless `cc` lui suffit (section 10). Une minute de compilation en mode `release` sur cette machine, dépendances comprises ; la CI de la note 02 (« 2 à 4 minutes avec cache, 6 à 10 à froid ») reste une estimation tant que le job n'a pas tourné.

## 6. `src/verifier.rs` : l'interprète de `WebhookVerification`

Fichier : `services/porte/src/verifier.rs` (à créer ; nommé par l'architecture, section 6). Seconde mise en œuvre de `src/server/webhooks/verify.ts` (à créer au chapitre 03, section 4.3). Il suit la règle du chapitre 03 (4.1), étape par étape, dans le même ordre : un cas qui cumule deux défauts rend la première raison rencontrée, ici comme en TypeScript.

Les noms suivent ceux de `verify.ts`, en forme Rust :

| `verify.ts` (chapitre 03) | `verifier.rs` |
|---|---|
| `VERDICT_REASONS`, `VerdictReason` | `enum VerdictReason` et `as_str()` : `entete`, `signature`, `horodatage`, `secret`, `format` |
| `Verdict` | `type Verdict = Result<(), VerdictReason>` |
| `VerifyInput` | `struct VerifyInput` (mêmes champs ; `now_ms` en `i64`) |
| `decodeBytes`, `parseBodyJson`, `readPointer`, `secretHeaders`, `verifyWebhook` | `decode_bytes`, `parse_body_json`, `read_pointer`, `secret_headers`, `verify_webhook` |
| `WebhookVerification`, `WebhookSecret`, `WebhookTimestamp`, `SignedPart` (`types.ts`, architecture 8.3) | les mêmes noms, lus de `fournisseurs.json` par `serde`, avec `deny_unknown_fields` |
| `porteBase` | sans objet : `main.rs` retire le « / » final de `LEON_PORTE_URL` au démarrage |

À savoir :

- **Le corps est l'octet brut reçu.** `verify_webhook` prend `&[u8]` ; rien n'est relu puis réécrit avant la vérification (note 02, 3.1).
- **Temps constant.** `subtle::ConstantTimeEq` pour les signatures (après contrôle de la longueur, qui n'est pas un secret) et pour les jetons (empreintes SHA-256 des deux textes, comme `sameText`).
- **base64 comme Node.** `Buffer.from(…, 'base64')` ignore les bits de fin non nuls ; le décodeur standard de la caisse `base64` les refuse. Sans la configuration `BASE64_LENIENT`, une signature HubSpot écrite avec des bits de fin non nuls passerait en TypeScript et serait refusée ici. Un test le fixe ; l'essai différentiel aussi (section 15.3).
- **Les horodatages en flottant**, comme `Number()` : 16 chiffres en secondes, multipliés par 1 000, dépassent un `i64`.
- **JSON comme `JSON.parse`, autant que possible.** `serde_json` refuse une moitié de paire UTF-16 seule (« \ud800 »), que `JSON.parse` garde. La porte n'en fait que des octets UTF-8, où Node écrit U+FFFD à sa place ; `replace_lone_surrogates` fait de même avant de relire, ce qui donne les mêmes octets (empreinte d'un jeton, compte passé à Postgres, écho). Deux écarts restent, refusés ici et acceptés en TypeScript : un nombre hors des `f64` (« 1e400 ») et plus de 128 niveaux d'imbrication. Aucun éditeur du premier lot n'envoie l'un ou l'autre dans un corps signé (déduit) ; ils sont écrits en écart E15-6.
- **`fournisseurs.json` est lu strictement.** Un champ inconnu (un mode, un morceau signé, un champ de spec) fait échouer la lecture : le binaire refuse de démarrer, et `cargo test` échoue. C'est voulu : le chapitre 03 (7, règles communes) change `version` quand le Rust doit changer, mais un oubli de version doit se voir aussi. `deny_unknown_fields` est posé sur chaque structure **et sur les deux énumérations** `WebhookVerification` (modes `standard-webhooks` et `jeton`, dont les champs sont écrits dans l'énumération) et `SignedPart` (le morceau littéral) ; la première version l'avait oublié sur ces deux-là. Les tests `chaque_mode_refuse_un_champ_inconnu` et `fournisseurs_est_dans_la_version_connue` le vérifient mode par mode.

```rust
// L'interprète de WebhookVerification (dossier agents, 8.3), seconde mise en œuvre. La première est
// src/server/webhooks/verify.ts (chapitre 03, section 4) : les deux rendent le même verdict sur chaque cas de
// services/porte/vecteurs.json, et suivent les étapes dans le même ordre (un cas qui cumule deux défauts rend la
// première raison rencontrée). Pur : ni base, ni réseau, ni variable d'environnement. L'heure est un argument, le
// secret arrive en clair. Un refus dit pourquoi, pour le journal et les vecteurs, jamais à l'éditeur.

use std::collections::BTreeMap;

use base64::Engine as _;
use base64::alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

// Les types de src/server/connectors/types.ts (architecture 8.3), tels que fournisseurs.json les écrit. Un champ
// inconnu fait échouer la lecture, dans chaque mode et dans chaque morceau signé (deny_unknown_fields sur chaque type,
// enums comprises) : un changement du contrat sans changement de `version` se voit au démarrage.

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "from", deny_unknown_fields)]
pub enum WebhookSecret {
    #[serde(rename = "abonnement")]
    Abonnement,
    #[serde(rename = "env")]
    Env { name: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimestampSource {
    Header,
    Body,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimestampUnit {
    S,
    Ms,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebhookTimestamp {
    pub source: TimestampSource,
    pub name: String,
    pub unit: TimestampUnit,
    pub tolerance_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NamedPart {
    Method,
    Uri,
    Timestamp,
    Body,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum SignedPart {
    Named(NamedPart),
    Literal { literal: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Encoding {
    Hex,
    Base64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecretEncoding {
    Utf8,
    Hex,
    Base64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HmacVerification {
    pub header: String,
    pub encoding: Encoding,
    pub prefix: Option<String>,
    pub signed: Vec<SignedPart>,
    pub separator: String,
    pub timestamp: Option<WebhookTimestamp>,
    pub secret: WebhookSecret,
    pub secret_encoding: Option<SecretEncoding>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "mode", deny_unknown_fields)]
pub enum WebhookVerification {
    #[serde(rename = "hmac-sha256")]
    HmacSha256(HmacVerification),
    #[serde(rename = "hmac-sha1")]
    HmacSha1(HmacVerification),
    #[serde(rename = "standard-webhooks")]
    StandardWebhooks { secret: WebhookSecret },
    #[serde(rename = "jeton", rename_all = "camelCase")]
    Jeton {
        header: Option<String>,
        body_pointer: Option<String>,
        secret: WebhookSecret,
    },
}

impl WebhookVerification {
    pub fn secret(&self) -> &WebhookSecret {
        match self {
            Self::HmacSha256(hmac) | Self::HmacSha1(hmac) => &hmac.secret,
            Self::StandardWebhooks { secret } | Self::Jeton { secret, .. } => secret,
        }
    }

    // La signature couvre-t-elle l'adresse appelée ? Sans LEON_PORTE_URL, la porte ne peut pas la rebâtir.
    pub fn signs_uri(&self) -> bool {
        match self {
            Self::HmacSha256(hmac) | Self::HmacSha1(hmac) => {
                hmac.signed.contains(&SignedPart::Named(NamedPart::Uri))
            }
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum BodyFormat {
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "form-payload")]
    FormPayload,
}

// Les cinq raisons d'un refus (VERDICT_REASONS de verify.ts).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerdictReason {
    Entete,
    Signature,
    Horodatage,
    Secret,
    Format,
}

impl VerdictReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Entete => "entete",
            Self::Signature => "signature",
            Self::Horodatage => "horodatage",
            Self::Secret => "secret",
            Self::Format => "format",
        }
    }
}

pub type Verdict = Result<(), VerdictReason>;

pub struct VerifyInput<'a> {
    pub verification: &'a WebhookVerification,
    pub body_format: BodyFormat,
    pub secret: &'a str, // en clair : déchiffré (abonnement) ou lu dans sa variable (application)
    pub method: &'a str,
    pub uri: &'a str, // l'adresse publique appelée : LEON_PORTE_URL, puis /h/…, puis la chaîne de requête reçue
    pub headers: &'a BTreeMap<String, String>, // noms en minuscules
    pub body: &'a [u8], // le corps brut, jamais re-sérialisé
    pub now_ms: i64,
}

const STANDARD_TOLERANCE_SECONDS: f64 = 300.0;

// base64 standard, remplissage exigé, bits de fin tolérés : Buffer.from(texte, 'base64') de Node les ignore. Sans
// cette tolérance, une signature écrite avec des bits de fin non nuls passerait en TypeScript et pas ici.
const BASE64_LENIENT: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::RequireCanonical),
);

// /^\d{1,16}$/ de verify.ts : des chiffres ASCII seulement.
fn is_digits(text: &str) -> bool {
    (1..=16).contains(&text.len()) && text.bytes().all(|b| b.is_ascii_digit())
}

// /^(?:[0-9a-fA-F]{2})+$/
fn is_hex(text: &str) -> bool {
    !text.is_empty() && text.len().is_multiple_of(2) && text.bytes().all(|b| b.is_ascii_hexdigit())
}

// /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
fn is_base64(text: &str) -> bool {
    let padding = text.bytes().rev().take_while(|&b| b == b'=').count();
    let body = &text.as_bytes()[..text.len() - padding];
    padding <= 2
        && text.len().is_multiple_of(4)
        && body
            .iter()
            .all(|&b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
}

// Hexadécimal (majuscules admises) ou base64 standard avec remplissage. None : vide ou illisible.
pub fn decode_bytes(text: &str, encoding: Encoding) -> Option<Vec<u8>> {
    if text.is_empty() {
        return None;
    }
    match encoding {
        Encoding::Hex => is_hex(text).then(|| hex::decode(text).ok()).flatten(),
        Encoding::Base64 => is_base64(text)
            .then(|| BASE64_LENIENT.decode(text).ok())
            .flatten(),
    }
}

// Temps constant pour une même longueur ; la longueur d'une signature n'est pas un secret.
fn same_bytes(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && bool::from(a.ct_eq(b))
}

// Temps constant quelle que soit la longueur : on compare les empreintes des deux textes.
fn same_text(a: &str, b: &str) -> bool {
    let left = Sha256::digest(a.as_bytes());
    let right = Sha256::digest(b.as_bytes());
    bool::from(left.as_slice().ct_eq(right.as_slice()))
}

// Quatre chiffres hexadécimaux à partir de `at` : une unité UTF-16 écrite \uXXXX.
fn hex4(bytes: &[u8], at: usize) -> Option<u16> {
    let digits = std::str::from_utf8(bytes.get(at..at + 4)?).ok()?;
    if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u16::from_str_radix(digits, 16).ok()
}

// JSON.parse garde une moitié de paire UTF-16 seule (« \ud800 ») ; serde_json la refuse. La porte n'en fait que des
// octets UTF-8, où Node écrit U+FFFD à sa place (empreinte d'un jeton, compte passé à Postgres, écho) : la remplacer
// par \ufffd avant de relire donne les mêmes octets. None : rien à remplacer.
fn replace_lone_surrogates(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let (mut out, mut last, mut index, mut in_string) = (String::new(), 0, 0, false);
    while index < bytes.len() {
        match (in_string, bytes[index]) {
            (false, b'"') => in_string = true,
            (true, b'"') => in_string = false,
            (true, b'\\') if bytes.get(index + 1) == Some(&b'u') => {
                let Some(unit) = hex4(bytes, index + 2) else {
                    index += 2;
                    continue;
                };
                let low_follows = bytes.get(index + 6..index + 8) == Some(b"\\u")
                    && hex4(bytes, index + 8).is_some_and(|low| (0xdc00..0xe000).contains(&low));
                if (0xd800..0xdc00).contains(&unit) && low_follows {
                    index += 12; // une paire complète
                    continue;
                }
                if (0xd800..0xe000).contains(&unit) {
                    out.push_str(&text[last..index]);
                    out.push_str("\\ufffd");
                    last = index + 6;
                }
                index += 6;
                continue;
            }
            (true, b'\\') => {
                index += 2;
                continue;
            }
            _ => {}
        }
        index += 1;
    }
    if last == 0 {
        return None;
    }
    out.push_str(&text[last..]);
    Some(out)
}

// JSON.parse, autant que serde_json le permet. Écarts restants (chapitre 15, « Ce que je n'ai pas vérifié ») : un
// nombre hors des f64 (« 1e400 ») et plus de 128 niveaux d'imbrication, que JSON.parse accepte et que serde_json
// refuse. Le verdict devient alors un refus ici.
fn parse_json_like_js(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok().or_else(|| {
        let repaired = replace_lone_surrogates(text)?;
        serde_json::from_str(&repaired).ok()
    })
}

// Le corps lu comme JSON : tel quel, ou le champ `payload` d'un formulaire (Slack). None : illisible.
pub fn parse_body_json(format: BodyFormat, text: &str) -> Option<Value> {
    match format {
        BodyFormat::Json => parse_json_like_js(text),
        BodyFormat::FormPayload => {
            // URLSearchParams retire un « ? » de tête.
            let query = text.strip_prefix('?').unwrap_or(text);
            let payload = form_urlencoded::parse(query.as_bytes())
                .find(|(key, _)| key == "payload")
                .map(|(_, value)| value.into_owned())?;
            parse_json_like_js(&payload)
        }
    }
}

// /^(?:\/(?:[^/~]|~[01])*)+$/ : commence par « / », et chaque « ~ » est suivi de 0 ou de 1.
fn is_pointer(pointer: &str) -> bool {
    let mut chars = pointer.chars().peekable();
    if chars.next() != Some('/') {
        return false;
    }
    while let Some(c) = chars.next() {
        if c == '~' && !matches!(chars.next(), Some('0' | '1')) {
            return false;
        }
    }
    true
}

// /^(?:0|[1-9]\d*)$/
fn is_index(segment: &str) -> bool {
    segment == "0"
        || (segment
            .as_bytes()
            .first()
            .is_some_and(|b| (b'1'..=b'9').contains(b))
            && segment.bytes().all(|b| b.is_ascii_digit()))
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

// Number.isSafeInteger, puis String(n) : un entier entre -(2^53 - 1) et 2^53 - 1, écrit sans exposant.
fn safe_integer(number: &serde_json::Number) -> Option<String> {
    let value = number.as_f64()?;
    if let Some(int) = number.as_i64() {
        return ((int as f64).abs() <= MAX_SAFE_INTEGER).then(|| int.to_string());
    }
    if let Some(int) = number.as_u64() {
        return ((int as f64) <= MAX_SAFE_INTEGER).then(|| int.to_string());
    }
    (value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER)
        .then(|| (value as i64).to_string()) // -0.0 devient « 0 », comme String(-0)
}

// Un pointeur JSON (RFC 6901), avec au plus un segment « * » qui parcourt un tableau non vide. Rend les valeurs en
// texte : une chaîne telle quelle, un entier sûr en chiffres décimaux. None : pointeur mal formé, chemin absent,
// tableau vide, ou une valeur d'un autre type.
pub fn read_pointer(document: &Value, pointer: &str) -> Option<Vec<String>> {
    if !is_pointer(pointer) {
        return None;
    }
    let segments: Vec<String> = pointer[1..]
        .split('/')
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect();
    if segments.iter().filter(|segment| *segment == "*").count() > 1 {
        return None;
    }
    let mut nodes: Vec<&Value> = vec![document];
    for segment in &segments {
        let mut next = Vec::new();
        for node in nodes {
            match node {
                Value::Array(items) if segment == "*" => {
                    if items.is_empty() {
                        return None;
                    }
                    next.extend(items.iter());
                }
                _ if segment == "*" => return None,
                Value::Array(items) => {
                    let index = is_index(segment)
                        .then(|| segment.parse::<usize>().ok())
                        .flatten()?;
                    next.push(items.get(index)?);
                }
                Value::Object(map) => next.push(map.get(segment.as_str())?),
                _ => return None,
            }
        }
        nodes = next;
    }
    let mut values = Vec::with_capacity(nodes.len());
    for value in nodes {
        match value {
            Value::String(text) => values.push(text.clone()),
            Value::Number(number) => values.push(safe_integer(number)?),
            _ => return None,
        }
    }
    (!values.is_empty()).then_some(values)
}

// Les en-têtes qui portent un secret ou une signature : jamais gardés avec une livraison.
pub fn secret_headers(verification: &WebhookVerification) -> Vec<&str> {
    match verification {
        WebhookVerification::StandardWebhooks { .. } => vec!["webhook-signature"],
        WebhookVerification::Jeton { header, .. } => header.iter().map(String::as_str).collect(),
        WebhookVerification::HmacSha256(hmac) | WebhookVerification::HmacSha1(hmac) => {
            vec![hmac.header.as_str()]
        }
    }
}

fn key_of(secret: &str, encoding: Option<SecretEncoding>) -> Option<Vec<u8>> {
    match encoding.unwrap_or(SecretEncoding::Utf8) {
        SecretEncoding::Utf8 => Some(secret.as_bytes().to_vec()),
        SecretEncoding::Hex => decode_bytes(secret, Encoding::Hex),
        SecretEncoding::Base64 => decode_bytes(secret, Encoding::Base64),
    }
}

struct Stamp {
    text: String,
    ms: f64, // en flottant, comme Number() : 16 chiffres en secondes dépassent un i64 une fois en millisecondes
}

fn read_stamp(timestamp: &WebhookTimestamp, input: &VerifyInput) -> Option<Stamp> {
    let text = match timestamp.source {
        TimestampSource::Header => input.headers.get(&timestamp.name).cloned(),
        TimestampSource::Body => {
            let body = String::from_utf8_lossy(input.body);
            let document = parse_body_json(input.body_format, &body)?;
            match read_pointer(&document, &timestamp.name) {
                Some(mut values) if values.len() == 1 => values.pop(),
                _ => None,
            }
        }
    }?;
    if !is_digits(&text) {
        return None;
    }
    let number: f64 = text.parse().ok()?;
    let ms = match timestamp.unit {
        TimestampUnit::S => number * 1000.0,
        TimestampUnit::Ms => number,
    };
    Some(Stamp { text, ms })
}

fn fresh(ms: f64, now_ms: i64, tolerance_seconds: f64) -> bool {
    (now_ms as f64 - ms).abs() <= tolerance_seconds * 1000.0
}

fn signed_bytes(
    parts: &[SignedPart],
    separator: &str,
    input: &VerifyInput,
    stamp: Option<&Stamp>,
) -> Vec<u8> {
    let mut message = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            message.extend_from_slice(separator.as_bytes());
        }
        match part {
            SignedPart::Literal { literal } => message.extend_from_slice(literal.as_bytes()),
            SignedPart::Named(NamedPart::Method) => {
                message.extend_from_slice(input.method.to_uppercase().as_bytes())
            }
            SignedPart::Named(NamedPart::Uri) => message.extend_from_slice(input.uri.as_bytes()),
            SignedPart::Named(NamedPart::Timestamp) => {
                message.extend_from_slice(stamp.map_or("", |s| s.text.as_str()).as_bytes())
            }
            SignedPart::Named(NamedPart::Body) => message.extend_from_slice(input.body),
        }
    }
    message
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac =
        <Hmac<Sha256> as KeyInit>::new_from_slice(key).expect("HMAC accepte toute longueur de clé");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn hmac_sha1(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac =
        <Hmac<Sha1> as KeyInit>::new_from_slice(key).expect("HMAC accepte toute longueur de clé");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn verify_hmac(hmac: &HmacVerification, sha1: bool, input: &VerifyInput) -> Verdict {
    let key = key_of(input.secret, hmac.secret_encoding).ok_or(VerdictReason::Secret)?;
    let mut header = input
        .headers
        .get(&hmac.header)
        .ok_or(VerdictReason::Entete)?
        .as_str();
    if let Some(prefix) = &hmac.prefix {
        header = header
            .strip_prefix(prefix.as_str())
            .ok_or(VerdictReason::Signature)?;
    }
    let given = decode_bytes(header, hmac.encoding).ok_or(VerdictReason::Signature)?;
    let mut stamp = None;
    if let Some(timestamp) = &hmac.timestamp {
        match read_stamp(timestamp, input) {
            Some(read) if fresh(read.ms, input.now_ms, timestamp.tolerance_seconds) => {
                stamp = Some(read)
            }
            _ => return Err(VerdictReason::Horodatage),
        }
    }
    let message = signed_bytes(&hmac.signed, &hmac.separator, input, stamp.as_ref());
    let expected = if sha1 {
        hmac_sha1(&key, &message)
    } else {
        hmac_sha256(&key, &message)
    };
    if same_bytes(&given, &expected) {
        Ok(())
    } else {
        Err(VerdictReason::Signature)
    }
}

fn verify_standard(input: &VerifyInput) -> Verdict {
    let (Some(id), Some(timestamp), Some(signatures)) = (
        input.headers.get("webhook-id"),
        input.headers.get("webhook-timestamp"),
        input.headers.get("webhook-signature"),
    ) else {
        return Err(VerdictReason::Entete);
    };
    let ms = timestamp.parse::<f64>().map(|seconds| seconds * 1000.0);
    if !is_digits(timestamp)
        || !ms.is_ok_and(|ms| fresh(ms, input.now_ms, STANDARD_TOLERANCE_SECONDS))
    {
        return Err(VerdictReason::Horodatage);
    }
    let encoded = input.secret.strip_prefix("whsec_").unwrap_or(input.secret);
    let key = decode_bytes(encoded, Encoding::Base64).ok_or(VerdictReason::Secret)?;
    let mut message = format!("{id}.{timestamp}.").into_bytes();
    message.extend_from_slice(input.body);
    let expected = hmac_sha256(&key, &message);
    for entry in signatures.split(' ') {
        let Some((version, signature)) = entry.split_once(',') else {
            continue;
        };
        if version != "v1" {
            continue;
        }
        if decode_bytes(signature, Encoding::Base64)
            .is_some_and(|given| same_bytes(&given, &expected))
        {
            return Ok(());
        }
    }
    Err(VerdictReason::Signature)
}

fn verify_token(header: Option<&str>, body_pointer: Option<&str>, input: &VerifyInput) -> Verdict {
    if let Some(name) = header {
        let given = input.headers.get(name).ok_or(VerdictReason::Entete)?;
        return if same_text(given, input.secret) {
            Ok(())
        } else {
            Err(VerdictReason::Signature)
        };
    }
    let pointer = body_pointer.ok_or(VerdictReason::Format)?;
    let body = String::from_utf8_lossy(input.body);
    let document = parse_body_json(input.body_format, &body).ok_or(VerdictReason::Format)?;
    let values = read_pointer(&document, pointer).ok_or(VerdictReason::Entete)?;
    // Chaque valeur est comparée : Microsoft regroupe plusieurs notifications, chacune porte son clientState.
    if values.iter().all(|value| same_text(value, input.secret)) {
        Ok(())
    } else {
        Err(VerdictReason::Signature)
    }
}

pub fn verify_webhook(input: &VerifyInput) -> Verdict {
    if input.secret.is_empty() {
        return Err(VerdictReason::Secret);
    }
    match input.verification {
        WebhookVerification::StandardWebhooks { .. } => verify_standard(input),
        WebhookVerification::Jeton {
            header,
            body_pointer,
            ..
        } => verify_token(header.as_deref(), body_pointer.as_deref(), input),
        WebhookVerification::HmacSha256(hmac) => verify_hmac(hmac, false, input),
        WebhookVerification::HmacSha1(hmac) => verify_hmac(hmac, true, input),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn base64_tolere_les_bits_de_fin_comme_node() {
        // « QR== » : Node rend [0x41], comme « QQ== ».
        assert_eq!(decode_bytes("QQ==", Encoding::Base64), Some(vec![0x41]));
        assert_eq!(decode_bytes("QR==", Encoding::Base64), Some(vec![0x41]));
        assert_eq!(decode_bytes("QQ", Encoding::Base64), None); // remplissage exigé
        assert_eq!(decode_bytes("", Encoding::Base64), None);
        assert_eq!(decode_bytes("ABcd", Encoding::Hex), Some(vec![0xab, 0xcd]));
        assert_eq!(decode_bytes("abc", Encoding::Hex), None);
    }

    #[test]
    fn pointeur_avec_etoile_et_entiers_surs() {
        let document = json!({ "value": [{ "a": "x" }, { "a": "y" }], "n": [12345678, 1.0, -0.0, 9007199254740992u64] });
        assert_eq!(
            read_pointer(&document, "/value/*/a"),
            Some(vec!["x".into(), "y".into()])
        );
        assert_eq!(
            read_pointer(&document, "/n/0"),
            Some(vec!["12345678".into()])
        );
        assert_eq!(read_pointer(&document, "/n/1"), Some(vec!["1".into()]));
        assert_eq!(read_pointer(&document, "/n/2"), Some(vec!["0".into()]));
        assert_eq!(read_pointer(&document, "/n/3"), None); // 2^53 : pas un entier sûr
        assert_eq!(read_pointer(&document, "/n/01"), None);
        assert_eq!(read_pointer(&document, "/*/*"), None); // deux étoiles
        assert_eq!(read_pointer(&json!({ "value": [] }), "/value/*/a"), None);
        assert_eq!(
            read_pointer(&json!({ "a/b": { "~": "z" } }), "/a~1b/~0"),
            Some(vec!["z".into()])
        );
        assert_eq!(read_pointer(&document, "value"), None);
        assert_eq!(read_pointer(&document, "/~2"), None);
    }

    #[test]
    fn une_moitie_de_paire_seule_devient_u_fffd_comme_dans_node() {
        let text = r#"{"a":"\ud800","b":"\ud83d\ude00","c":"\\ud800","d":"\udc00x"}"#;
        let expected =
            json!({ "a": "\u{fffd}", "b": "\u{1f600}", "c": "\\ud800", "d": "\u{fffd}x" });
        assert_eq!(parse_body_json(BodyFormat::Json, text), Some(expected));
        // Les écarts qui restent : refusés ici, acceptés par JSON.parse.
        assert_eq!(parse_body_json(BodyFormat::Json, r#"{"n":1e400}"#), None);
        assert_eq!(
            parse_body_json(
                BodyFormat::Json,
                &format!("{}{}", "[".repeat(129), "]".repeat(129))
            ),
            None
        );
    }

    #[test]
    fn chaque_mode_refuse_un_champ_inconnu() {
        let secret = r#""secret":{"from":"env","name":"S"}"#;
        let hmac = format!(
            r#""header":"x-sig","encoding":"hex","signed":["body",{{"literal":"v0"}}],"separator":":",{secret}"#
        );
        for good in [
            format!(r#"{{"mode":"hmac-sha256",{hmac}}}"#),
            format!(r#"{{"mode":"hmac-sha1",{hmac}}}"#),
            format!(r#"{{"mode":"standard-webhooks",{secret}}}"#),
            format!(r#"{{"mode":"jeton","bodyPointer":"/a",{secret}}}"#),
        ] {
            assert!(
                serde_json::from_str::<WebhookVerification>(&good).is_ok(),
                "{good}"
            );
            // Un champ de plus au niveau du mode : refusé, quel que soit le mode.
            let extra = good.replacen('{', r#"{"inconnu":1,"#, 1);
            assert!(
                serde_json::from_str::<WebhookVerification>(&extra).is_err(),
                "{extra}"
            );
        }
        // Un champ de plus dans un morceau signé littéral, ou dans le secret : refusé aussi.
        let literal = format!(r#"{{"mode":"hmac-sha256",{hmac}}}"#)
            .replace(r#"{"literal":"v0"}"#, r#"{"literal":"v0","inconnu":1}"#);
        assert!(serde_json::from_str::<WebhookVerification>(&literal).is_err());
        let in_secret =
            r#"{"mode":"standard-webhooks","secret":{"from":"env","name":"S","inconnu":1}}"#;
        assert!(serde_json::from_str::<WebhookVerification>(in_secret).is_err());
    }

    #[test]
    fn formulaire_payload() {
        let text = "?payload=%7B%22type%22%3A%22url_verification%22%7D&autre=1";
        assert_eq!(
            parse_body_json(BodyFormat::FormPayload, text),
            Some(json!({ "type": "url_verification" }))
        );
        assert_eq!(parse_body_json(BodyFormat::FormPayload, "autre=1"), None);
    }
}
```

## 7. `src/secret.rs` : les secrets d'abonnement

Fichier : `services/porte/src/secret.rs` (à créer ; nommé par l'architecture, section 6). Il lit le format écrit par `encryptSecret` (`src/server/connectors/crypto.ts:33`, existe) et relu par `decryptSecret` (`:42`, existe) : `v1:<iv>:<tag>:<chiffré>`, chaque partie en base64url, AES-256-GCM, IV de 12 octets et étiquette de 16 imposés (`:52-54`). La clé est `LEON_PORTE_KEY`, les données associées `<tenant_id>:<abonnement_id>` (`subscriptionAad`, chapitre 03, section 5).

| `crypto.ts` (chapitres 03 et existant) | `secret.rs` |
|---|---|
| `porteKey()` | `parse_porte_key(value)` : 32 octets en base64, l'un ou l'autre alphabet comme `Buffer.from(…, 'base64')`, sinon `None` ; `main.rs` refuse de démarrer sur une valeur mal formée |
| `subscriptionAad({ tenantId, abonnementId })` | `subscription_aad(tenant_id, abonnement_id)` |
| `openSubscriptionSecret(stored, ids, key)` | `open_subscription_secret(stored, aad, key)` |
| `Error('Secret illisible')` (`connectors/crypto.ts:45`, `:61`) | `UnreadableSecret`, même message, sans le secret ni le chiffré |

À savoir :

- La porte ne chiffre jamais : seul le worker écrit un secret, en abonnant (`sealSubscriptionSecret`, chapitre 03). Le service Rust n'a donc que la moitié lecture.
- **Un seul décodeur, comme Node.** `Buffer.from(…, 'base64')` et `Buffer.from(…, 'base64url')` acceptent tous deux les deux alphabets (« + / » et « - _ »), avec ou sans remplissage, et ignorent les bits de fin (essayé sous Node 22.23 : une clé de 43 caractères en base64url y fait 32 octets). Une `LEON_PORTE_KEY` écrite en base64url passe donc le contrôle de `env.ts` (chapitre 03, 6.3) et chiffre les secrets côté `web` et `worker` : elle doit passer ici aussi, sinon le service refuserait de démarrer le jour de la bascule. `decode_like_node` ramène « - » et « _ » à « + » et « / », puis décode en base64 standard, remplissage indifférent, bits de fin tolérés ; la clé et les trois parties de `v1:` passent par lui. Node va plus loin, il saute tout caractère hors alphabet : refusé ici, et ni `encryptSecret` ni `openssl rand -base64 32` n'en écrivent.
- Une seule clé, pas de clé « précédente » (chapitre 03, section 5 et relecture « Fond 9 ») : une rotation se fait par la marche à suivre du chapitre 03, et le service Rust reçoit la nouvelle valeur en même temps que `web` et `worker` (section 12).

```rust
// Les secrets d'abonnement (abonnements_webhook.secret, dossier agents 7.2 et 8.3), en lecture seule. Même format
// que src/server/connectors/crypto.ts : v1:<iv>:<tag>:<chiffré>, chaque partie en base64url, AES-256-GCM, IV de
// 12 octets, étiquette de 16. La clé est LEON_PORTE_KEY ; les données associées, `<tenant_id>:<abonnement_id>`, lient
// le secret à sa ligne (src/server/webhooks/crypto.ts, chapitre 03). La porte ne chiffre jamais : seul le worker
// écrit un secret, en abonnant.

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::Engine as _;
use base64::alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};

const VERSION: &str = "v1";
const KEY_BYTES: usize = 32;
const IV_BYTES: usize = 12;
const TAG_BYTES: usize = 16;

// Le décodeur de Node, autant qu'il le faut ici. Buffer.from(…, 'base64') et Buffer.from(…, 'base64url') acceptent
// tous deux les deux alphabets (« + / » et « - _ »), avec ou sans remplissage, et ignorent les bits de fin. Une clé
// écrite en base64url passe donc env.ts (chapitre 03, 6.3) : elle doit passer ici aussi, sinon le service refuse de
// démarrer le jour de la bascule. Node va plus loin (il saute tout caractère hors alphabet) : encryptSecret et
// `openssl rand -base64 32` n'en écrivent jamais, ce décodeur les refuse.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn decode_like_node(text: &str) -> Option<Vec<u8>> {
    let standard: String = text
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();
    BASE64.decode(standard).ok()
}

// Un message fixe : jamais le secret, ni le chiffré, ni la clé.
#[derive(Debug, PartialEq, Eq)]
pub struct UnreadableSecret;

impl std::fmt::Display for UnreadableSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret illisible")
    }
}

impl std::error::Error for UnreadableSecret {}

// LEON_PORTE_KEY : 32 octets en base64, l'un ou l'autre alphabet (env.ts le vérifie côté TypeScript). None : absente,
// vide ou mal formée ; le démarrage refuse une valeur mal formée (main.rs), une valeur absente rend 503 aux livraisons
// d'abonnement.
pub fn parse_porte_key(value: &str) -> Option<[u8; KEY_BYTES]> {
    decode_like_node(value.trim())?.try_into().ok()
}

// subscriptionAad de src/server/webhooks/crypto.ts.
pub fn subscription_aad(tenant_id: &str, abonnement_id: &str) -> String {
    format!("{tenant_id}:{abonnement_id}")
}

// openSubscriptionSecret de crypto.ts, sans la clé par défaut : la porte la reçoit toujours en argument.
pub fn open_subscription_secret(
    stored: &str,
    aad: &str,
    key: &[u8; KEY_BYTES],
) -> Result<String, UnreadableSecret> {
    let parts: Vec<&str> = stored.split(':').collect();
    let [version, iv, tag, encrypted] = parts.as_slice() else {
        return Err(UnreadableSecret);
    };
    if *version != VERSION {
        return Err(UnreadableSecret);
    }
    let decode = |part: &str| decode_like_node(part).ok_or(UnreadableSecret);
    let (iv, tag, encrypted) = (decode(iv)?, decode(tag)?, decode(encrypted)?);
    if iv.len() != IV_BYTES || tag.len() != TAG_BYTES {
        return Err(UnreadableSecret);
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| UnreadableSecret)?;
    let nonce = Nonce::try_from(iv.as_slice()).map_err(|_| UnreadableSecret)?;
    // aes-gcm attend l'étiquette à la suite du chiffré.
    let mut message = encrypted;
    message.extend_from_slice(&tag);
    let plain = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &message,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| UnreadableSecret)?;
    // toString('utf8') de Node remplace un octet invalide au lieu d'échouer.
    Ok(String::from_utf8_lossy(&plain).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_cle_fait_32_octets() {
        assert!(parse_porte_key("CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=").is_some());
        assert!(parse_porte_key("CQkJ").is_none());
        assert!(parse_porte_key("").is_none());
    }

    #[test]
    fn la_cle_se_lit_dans_les_deux_alphabets_comme_node() {
        // Buffer.from(…, 'base64') de Node rend 32 octets pour ces trois écritures : env.ts les accepte.
        let standard = parse_porte_key("+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/s=");
        assert!(standard.is_some());
        assert_eq!(
            parse_porte_key("-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_s"),
            standard
        );
        assert_eq!(
            parse_porte_key(" -_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_s=\n"),
            standard
        );
        // Hors des deux alphabets : refusé ici (Node sauterait le caractère).
        assert!(parse_porte_key("+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/s!").is_none());
    }

    #[test]
    fn un_format_inconnu_est_illisible() {
        let key = [9u8; 32];
        for stored in [
            "",
            "v2:a:b:c",
            "v1:a:b",
            "v1:AQEBAQEBAQEBAQEB:AAAA:AAAA",
            "v1:!!:x:y:z",
        ] {
            assert_eq!(
                open_subscription_secret(stored, "t:a", &key),
                Err(UnreadableSecret)
            );
        }
    }
}
```

## 8. `src/depot.rs` : le contrat SQL et les caches

Fichier : `services/porte/src/depot.rs` (à créer ; nommé par l'architecture, section 6 : « `porte_secret`, `porte_deposer`, cache des secrets »).

**Le contrat SQL**, recopié du chapitre 01 (section 11, « À savoir ») sans un mot de changé :

```sql
select tenant_id, secret from porte_secret($1, $2);                 -- outil, abonnement
select porte_deposer($1, $2, $3, $4, $5, $6, $7);                   -- outil, abonnement, compte, genre, livraison, corps, en-têtes
```

Le service les envoie en requêtes préparées par `sqlx`, sans macro : `$2` est lié comme `uuid` (type `Uuid`), `$7` comme `jsonb` (`sqlx::types::Json`), avec un `::jsonb` explicite comme dans `pgPorteStore` (chapitre 03, 6.2). Le rôle `leon_porte` n'a aucun autre droit (chapitre 01, `0083`) : une erreur de code qui viserait une table échouerait en base.

| `hono-gate.ts` (chapitre 03) | `depot.rs` |
|---|---|
| `PorteStore`, `pgPorteStore(pool)` | `trait PorteStore`, `PgPorteStore`, `connect(database_url)` |
| `Deposit` | `struct Deposit` (mêmes sept champs, dans l'ordre des paramètres SQL) |
| `Memo`, `Counters`, `GateState` | `Memo`, `Counters`, `GateState` : mêmes durées, même borne (`cacheMaxEntries`), même éviction de la plus ancienne, même fenêtre fixe |

**Le pool** : 5 connexions (chapitre 13, 8.2), ouvertes à la demande (`connect_lazy_with`) : le service démarre même si la base tarde, et `/sante` attend la première lecture réussie (section 9.4). **Chaque appel de base dure 2 secondes au plus** (`DB_CALL_TIMEOUT`), attente d'une connexion comprise : au-delà, la livraison reçoit 503 (`porte.base`, résumé `Timeout`), sous les 3 secondes du plus court délai d'éditeur (section 4). `statement_timeout=2000`, passé à l'ouverture de chaque connexion, fait aussi arrêter la requête par Postgres, pour qu'une requête abandonnée ici ne tienne pas une connexion là-bas (essayé : `code=57014` au bout de 2 s, section 15.4). Une écriture qui aboutirait malgré tout ne se double pas : l'éditeur réessaie, `porte_deposer` rend 0, la porte répond 202. La route Hono attend jusqu'à 5 s une connexion (`connectionTimeoutMillis: 5_000` de `portePool`), sans délai de requête : proposition au chapitre 03, écart E15-9. Une connexion inactive se ferme après 10 minutes, toute connexion après 30 : assez long pour ne pas payer une poignée de main TLS à chaque webhook (chapitre 13, écart E13-6), assez court pour suivre une bascule de RDS. `sqlx` vérifie une connexion avant de la prêter (`test_before_acquire`, son défaut) : un aller-retour de plus par livraison, à mesurer avec `porte.reponse`, à couper si le p95 le demande.

**Les erreurs de base** ne gardent que des champs de diagnostic (`code`, `constraint`, `table`), comme `safeErrorSummary` (`src/server/log.ts:23`, existe) : le message d'une erreur Postgres peut citer un paramètre, donc un morceau de corps.

```rust
// Le contrat SQL de la porte (dossier agents 7.4, chapitre 01 section 11) : deux fonctions, accordées au seul rôle
// leon_porte. La porte ne lit et n'écrit aucune table. Et les caches qui évitent de relire la base : un cache positif
// des secrets, un cache négatif des adresses inconnues, un compteur des lectures vides par adresse IP. Mêmes règles
// que hono-gate.ts (chapitre 03, 6.1 et 6.2) : mêmes durées, même borne, même éviction, même fenêtre fixe.

use std::collections::{BTreeMap, HashMap};
use std::future::Future;
use std::str::FromStr;
use std::time::Duration;

use serde::Serialize;
use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::types::Json;
use uuid::Uuid;

// Ce que rend porte_secret : l'organisation de l'abonnement et son secret chiffré (nul : l'outil signe avec un secret
// d'application).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubscriptionRow {
    pub tenant_id: String,
    pub secret: Option<String>,
}

// Les sept arguments de porte_deposer, dans l'ordre. `Serialize` pour les tests, qui les comparent à vecteurs.json.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Deposit {
    pub outil: String,
    pub abonnement: Option<String>,
    pub compte: Option<String>,
    pub genre: &'static str, // 'livraison' ou 'cycle'
    pub livraison: String,
    pub corps: String,
    pub entetes: BTreeMap<String, String>,
}

// Une panne de base : la porte répond 503, l'éditeur réessaie. Le résumé ne garde que des champs de diagnostic
// (comme safeErrorSummary de src/server/log.ts) : jamais un message de Postgres, qui peut citer un paramètre.
#[derive(Debug)]
pub struct StoreError(pub String);

impl From<sqlx::Error> for StoreError {
    fn from(error: sqlx::Error) -> Self {
        let summary = match &error {
            sqlx::Error::Database(db) => {
                let mut parts = vec!["Database".to_string()];
                if let Some(code) = db.code() {
                    parts.push(format!("code={code}"));
                }
                if let Some(constraint) = db.constraint() {
                    parts.push(format!("constraint={constraint}"));
                }
                if let Some(table) = db.table() {
                    parts.push(format!("table={table}"));
                }
                parts.join(" ")
            }
            sqlx::Error::PoolTimedOut => "PoolTimedOut".into(),
            sqlx::Error::PoolClosed => "PoolClosed".into(),
            sqlx::Error::Io(_) => "Io".into(),
            sqlx::Error::Tls(_) => "Tls".into(),
            sqlx::Error::Protocol(_) => "Protocol".into(),
            sqlx::Error::RowNotFound => "RowNotFound".into(),
            sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => "Decode".into(),
            _ => "Other".into(),
        };
        StoreError(summary)
    }
}

// PorteStore de hono-gate.ts. Une implémentation par Postgres, une fausse pour les tests (src/tests.rs).
pub trait PorteStore: Send + Sync + 'static {
    // porte_secret : None pour un abonnement inconnu, d'un autre outil, expiré, résilié, ou d'une personne partie.
    fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> impl Future<Output = Result<Option<SubscriptionRow>, StoreError>> + Send;
    // porte_deposer : les lignes écrites (0 : déjà reçue, ou personne n'écoute ce compte).
    fn deposit(&self, deposit: &Deposit) -> impl Future<Output = Result<i32, StoreError>> + Send;
}

pub struct PgPorteStore {
    pool: PgPool,
}

// Le délai d'un appel de base, attente d'une connexion comprise. Au-delà, la livraison reçoit 503 (porte.base) : sous
// les 3 secondes du plus court délai d'éditeur (chapitre 15, section 4), pas à l'heure où l'éditeur a déjà renoncé.
// main.rs borne chaque appel par tokio::time::timeout ; statement_timeout fait aussi arrêter la requête par Postgres,
// pour qu'une requête abandonnée ici ne continue pas de tenir une connexion là-bas.
pub const DB_CALL_TIMEOUT: Duration = Duration::from_secs(2);
const STATEMENT_TIMEOUT_MS: u64 = 2_000;

// Le pool du service : 5 connexions (chapitre 13, 8.2), sous le rôle leon_porte. Ouvert à la demande : le service
// démarre même si la base tarde ; /sante attend la première lecture réussie (main.rs, wait_for_base). Une livraison
// attend une connexion DB_CALL_TIMEOUT au plus, puis reçoit 503. L'adresse porte sslmode=verify-full et sslrootcert,
// comme DATABASE_URL_PORTE de web.
pub fn connect(database_url: &str) -> Result<PgPorteStore, sqlx::Error> {
    let options = PgConnectOptions::from_str(database_url)?
        .application_name("leon-porte")
        .options([("statement_timeout", STATEMENT_TIMEOUT_MS)]);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .min_connections(0)
        .acquire_timeout(DB_CALL_TIMEOUT)
        .idle_timeout(Some(Duration::from_secs(600)))
        .max_lifetime(Some(Duration::from_secs(1800)))
        .connect_lazy_with(options);
    Ok(PgPorteStore { pool })
}

impl PorteStore for PgPorteStore {
    async fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> Result<Option<SubscriptionRow>, StoreError> {
        // La porte n'appelle qu'avec un UUID en minuscules, vérifié avant (main.rs, spec_for).
        let Ok(abonnement) = Uuid::parse_str(abonnement) else {
            return Ok(None);
        };
        let row: Option<(Uuid, Option<String>)> =
            sqlx::query_as("select tenant_id, secret from porte_secret($1, $2)")
                .bind(outil)
                .bind(abonnement)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(tenant_id, secret)| SubscriptionRow {
            tenant_id: tenant_id.to_string(),
            secret,
        }))
    }

    async fn deposit(&self, deposit: &Deposit) -> Result<i32, StoreError> {
        let abonnement = deposit
            .abonnement
            .as_deref()
            .and_then(|id| Uuid::parse_str(id).ok());
        let written: i32 =
            sqlx::query_scalar("select porte_deposer($1, $2, $3, $4, $5, $6, $7::jsonb)")
                .bind(&deposit.outil)
                .bind(abonnement)
                .bind(deposit.compte.as_deref())
                .bind(deposit.genre)
                .bind(&deposit.livraison)
                .bind(&deposit.corps)
                .bind(Json(&deposit.entetes))
                .fetch_one(&self.pool)
                .await?;
        Ok(written)
    }
}

// Une table bornée, à durée de vie (Memo de hono-gate.ts). L'ordre d'insertion décide de l'éviction : la plus
// ancienne part quand la table dépasse sa borne ; réécrire une clé la remet en dernier, comme delete puis set sur une
// Map de JavaScript.
pub struct Memo<T> {
    ttl_ms: i64,
    max_entries: usize,
    entries: HashMap<String, (u64, T, i64)>, // rang d'insertion, valeur, échéance
    order: BTreeMap<u64, String>,
    next_rank: u64,
}

impl<T: Clone> Memo<T> {
    pub fn new(ttl_seconds: u64, max_entries: usize) -> Self {
        Self {
            ttl_ms: ttl_seconds as i64 * 1000,
            max_entries,
            entries: HashMap::new(),
            order: BTreeMap::new(),
            next_rank: 0,
        }
    }

    pub fn get(&mut self, key: &str, now_ms: i64) -> Option<T> {
        let (rank, value, until) = self.entries.get(key)?;
        if *until > now_ms {
            return Some(value.clone());
        }
        let rank = *rank;
        self.entries.remove(key);
        self.order.remove(&rank);
        None
    }

    pub fn set(&mut self, key: &str, value: T, now_ms: i64) {
        let until = now_ms + self.ttl_ms;
        self.insert(key, value, until);
    }

    fn insert(&mut self, key: &str, value: T, until: i64) {
        if let Some((rank, _, _)) = self.entries.remove(key) {
            self.order.remove(&rank);
        }
        let rank = self.next_rank;
        self.next_rank += 1;
        self.entries.insert(key.to_string(), (rank, value, until));
        self.order.insert(rank, key.to_string());
        if self.entries.len() > self.max_entries
            && let Some((_, oldest)) = self.order.pop_first()
        {
            self.entries.remove(&oldest);
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

// Des compteurs à fenêtre fixe (Counters de hono-gate.ts) : la fenêtre s'ouvre au premier compte et ne se prolonge
// pas, même si les comptes continuent. Même borne et même éviction que Memo.
pub struct Counters {
    window_ms: i64,
    memo: Memo<u32>,
}

impl Counters {
    pub fn new(window_seconds: u64, max_entries: usize) -> Self {
        Self {
            window_ms: window_seconds as i64 * 1000,
            memo: Memo::new(window_seconds, max_entries),
        }
    }

    pub fn get(&mut self, key: &str, now_ms: i64) -> u32 {
        self.memo.get(key, now_ms).unwrap_or(0)
    }

    pub fn add(&mut self, key: &str, now_ms: i64) {
        // Dans la fenêtre : on compte sans repousser l'échéance (pas de déplacement dans l'ordre non plus, comme
        // `entry.count += 1` sur la Map).
        if let Some((_, count, until)) = self.memo.entries.get_mut(key)
            && *until > now_ms
        {
            *count += 1;
            return;
        }
        self.memo.insert(key, 1, now_ms + self.window_ms);
    }
}

// L'état de la porte (GateState de hono-gate.ts). En mémoire du processus : juste tant que le service a une seule
// instance ; avec plusieurs, chacune a ses caches et sa limite, ce qui reste sûr (ils ne font qu'éviter des lectures).
pub struct GateState {
    pub secrets: Memo<SubscriptionRow>,
    pub unknown: Memo<()>,
    pub misses: Counters, // par clé d'adresse IP (ip_key) : lectures de porte_secret restées vides
}

impl GateState {
    pub fn new(
        secret_cache_seconds: u64,
        negative_cache_seconds: u64,
        window_seconds: u64,
        max_entries: usize,
    ) -> Self {
        Self {
            secrets: Memo::new(secret_cache_seconds, max_entries),
            unknown: Memo::new(negative_cache_seconds, max_entries),
            misses: Counters::new(window_seconds, max_entries),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memo_expire_et_evince_la_plus_ancienne() {
        let mut memo = Memo::new(60, 2);
        memo.set("a", 1, 0);
        memo.set("b", 2, 0);
        memo.set("a", 3, 1); // a repasse en dernier
        memo.set("c", 4, 2); // b, la plus ancienne, part
        assert_eq!(memo.get("b", 3), None);
        assert_eq!(memo.get("a", 3), Some(3));
        assert_eq!(memo.get("c", 3), Some(4));
        assert_eq!(memo.get("c", 60_002), None); // échue
        assert_eq!(memo.len(), 1);
    }

    #[test]
    fn la_fenetre_ne_se_prolonge_pas() {
        let mut counters = Counters::new(600, 10);
        counters.add("ip", 0);
        counters.add("ip", 599_000);
        assert_eq!(counters.get("ip", 599_999), 2);
        assert_eq!(counters.get("ip", 600_000), 0); // la fenêtre ouverte à 0 est close
        counters.add("ip", 600_000);
        assert_eq!(counters.get("ip", 600_001), 1);
    }

    #[test]
    fn une_erreur_de_base_ne_garde_aucun_message() {
        let error = StoreError::from(sqlx::Error::Protocol("corps cité par erreur".into()));
        assert_eq!(error.0, "Protocol");
    }
}
```

## 9. `src/main.rs` : les routes et le déroulé d'une requête

Fichier : `services/porte/src/main.rs` (à créer ; nommé par l'architecture, section 6). Il lit `fournisseurs.json` et les variables, monte quatre routes, déroule chaque requête dans l'ordre du chapitre 03 (6.1), borne chaque requête et chaque appel de base dans le temps, attend la base avant de se dire en bonne santé, journalise, filtre ce qui part vers Sentry, et s'arrête proprement.

### 9.1 Les variables que lit le binaire

Le chapitre 13 (section 9) laisse leurs noms à ce chapitre. Le binaire ne lit **que** celles-ci ; il ne connaît ni `DATABASE_URL`, ni `LEON_CONNECTORS_KEY`, ni aucun jeton d'outil (architecture, section 3).

| Variable | Obligatoire | Absente | Mal formée |
|---|---|---|---|
| `DATABASE_URL_PORTE` | oui | le service ne démarre pas (`porte.demarrage`) | illisible : idem. Lisible, mais la base refuse ou ne répond pas (mot de passe, hôte, certificat, TLS, migration 0083) : le service démarre, `/sante` répond 503 jusqu'à la première lecture réussie, le déploiement échoue (9.4) |
| `LEON_PORTE_KEY` | pour les outils à secret d'abonnement | 503 à leurs livraisons, `porte.cle_absente` (comme la route Hono) | le service ne démarre pas. L'un ou l'autre alphabet base64 est admis, comme dans `env.ts` (section 7) |
| `LEON_PORTE_URL` | pour les signatures qui couvrent l'adresse (HubSpot v3) | 503 à ces livraisons (étape 5) | le service ne démarre pas (ni http ni https) |
| `LEON_IP_HEADER` | en production | toutes les lectures vides partagent un plafond de 3 000 (chapitre 03, 6.1) | sans objet |
| les secrets que `fournisseurs.json` nomme (`from: 'env'`) : aujourd'hui `LEON_OAUTH_HUBSPOT_SECRET` ; demain les `LEON_PORTE_SECRET_<OUTIL>` | selon les outils | 503 aux livraisons de l'outil, `porte.secret_appli_absent` | sans objet |
| `PORT` | non (Railway la pose) | 8080 | le service ne démarre pas |
| `SENTRY_DSN`, `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_ENVIRONMENT_NAME` | non | rien ne part vers Sentry | `SENTRY_DSN` illisible : ignorée |

Une variable vide vaut absente, comme `emptyIsAbsent` (`src/server/env.ts`, existe).

### 9.2 Les routes

| Méthode et adresse | Pour | Dans la porte en Hono |
|---|---|---|
| `POST /h/{outil}` | webhook d'application | `/api/v1/porte/h/:outil` |
| `POST /h/{outil}/{abonnement}` | livraison d'abonnement | `/api/v1/porte/h/:outil/:abonnement` |
| `POST /h/{outil}/{abonnement}/cycle` | notification de cycle de vie | `/api/v1/porte/h/:outil/:abonnement/cycle` |
| `GET /sante` | bilan de santé de Railway (chapitre 13, 4.1) : 503 `{"ok":false}` jusqu'à la première lecture réussie de la base, puis 200 `{"ok":true}` pour toujours | `/api/health` |

Les trois premières sont celles de `fournisseurs.json` (`paths`), vérifiées au démarrage. L'architecture (section 6) n'écrit que les deux premières et `/sante` : la troisième vient de 8.3 (cycle de vie de Graph), comme au chapitre 03 (écart E-i). Écart E15-2.

### 9.3 Le déroulé, étape par étape

| # | Étape (chapitre 03, 6.1) | Où dans `main.rs` | Réponse |
|---|---|---|---|
| 1 | Corps de 262 144 octets au plus, avant tout : d'abord `content-length`, puis la lecture comptée, avant l'étape 2, comme le `bodyLimit` de Hono pour un corps sans `content-length` | `receive`, `read_body`, `too_large` | 413, `porte.trop_gros` (au journal seulement) ; lecture interrompue : 400, `porte.corps_interrompu` |
| 2 | Adresse : outil de `fournisseurs.json`, forme conforme à `scope`, UUID minuscule, `/cycle` si `lifecycle` | `spec_for` | refus uniforme |
| 3 | Écho `validationToken`, sans lire la base | `query_param`, `echo` | 200 `text/plain`, ou 400 |
| 4 | UTF-8 valide, sans octet nul | `receive` | 400 |
| 5 | `LEON_PORTE_URL` si la signature couvre l'adresse | `signs_uri` | 503 |
| 6 | Le secret : cache positif, cache négatif, limite par adresse IP, `porte_secret` (2 s au plus), déchiffrement ; ou la variable nommée | `secret_for`, `bounded` | refus uniforme, ou 503 |
| 7 | `verify_webhook` | `receive` | refus uniforme (et `porte.refus` au journal) |
| 8 | `slack-challenge` | `receive` | 200 `text/plain` |
| 9 | Le compte d'un webhook d'application | `account_of` | 202 sans dépôt, `porte.compte_illisible` ou `porte.comptes_multiples` |
| 10 | Identifiant de livraison | `delivery_id` | |
| 11 | En-têtes gardés | `kept_headers` | |
| 12 | `porte_deposer` (2 s au plus) | `PorteStore::deposit`, `bounded` | 202, ou 503 (`porte.base`) |

Le refus uniforme : `401 {"error":"Invalid signature"}`, rendu au plus tôt 200 ms après l'arrivée (`refusalMinDelayMs`), par `tokio::time::sleep_until`. Toute la requête dure 3 secondes au plus (`REQUEST_TIMEOUT`), puis `503 {"error":"Unavailable"}` et `porte.delai`. Chaque réponse, quelle qu'elle soit, écrit sa ligne `porte.reponse` (`handle`).

### 9.4 Ce qui diffère de la route Hono, et pourquoi

Aucune réponse prévue par `vecteurs.json` ne diffère. Ce qui suit est hors du contrat, ou propre à un service séparé ; `comparer.sh` (13.1) en vérifie une partie sur les deux portes réelles, avant la bascule.

- **Démarrage et bilan de santé.** Sans `DATABASE_URL_PORTE` (ou illisible), la route Hono répond 503 ; le service Rust ne démarre pas. Avec une adresse lisible mais une base qui refuse ou ne répond pas (mot de passe faux, hôte faux, certificat absent de l'image, TLS refusé, migration 0083 absente), il démarre, sert les livraisons (503, comme la route Hono), et `/sante` répond `503 {"ok":false}` tant qu'une première lecture n'a pas réussi : `wait_for_base` appelle `porte_secret` sur un outil qui n'existe pas, une fois par seconde, et journalise chaque échec (`porte.base`, `etape: demarrage`). Un déploiement mal réglé échoue donc au bilan de santé, et Railway garde l'ancienne version (comportement de Railway à vérifier, chapitre 13). Une fois la base lue, `/sante` répond 200 pour toujours, sans lire la base : une panne en régime ne fait pas redémarrer la porte en boucle. Essayé avec un mot de passe faux (section 15.4).
- **Délais.** 3 secondes par requête (`REQUEST_TIMEOUT`, puis 503 et `porte.delai`) : le plus court délai d'éditeur relevé (section 4), et non 10 s, le délai de Graph, au bout duquel l'éditeur a déjà renoncé. 2 secondes par appel de base, attente d'une connexion comprise (`DB_CALL_TIMEOUT`, `statement_timeout`, section 8). Une base lente donne donc 503 en 2 s. La route Hono n'a ni l'un ni l'autre (5 s pour une connexion de `portePool`, aucun délai de requête) : proposition au chapitre 03, écart E15-9. Ni coupe-circuit ni borne des requêtes en vol : pendant une panne, chaque livraison attend ses 2 s ; avec 5 connexions et des corps de 256 Kio au plus, c'est un coût de mémoire et de temps, pas un risque pour la base, et aucune mesure de charge ne le chiffre (section 18).
- **Le corps est lu avant l'adresse.** Le `bodyLimit` de hono 4.13.18 (lu dans `dist/middleware/body-limit/index.js`) lit en entier un corps sans `content-length`, en le comptant, avant la route : un corps trop gros reçoit 413 même vers un outil inconnu ou pour un écho. Le service Rust fait de même, pour tous les corps (`read_body`, étape 1). Hono ne lit un corps annoncé par `content-length` qu'à l'étape 4 : les réponses sont les mêmes, sauf pour un client qui coupe pendant l'envoi (400 ici, 500 ou rien en Hono : une réponse que personne ne lit). Un client qui coupe n'est plus pris pour un corps trop gros (`porte.corps_interrompu`, au journal seulement).
- **Journal.** `porte.reponse` (une ligne par réponse, section 4), `porte.refus` (la raison d'un refus de signature, au journal seulement : jamais dans la réponse ni dans Sentry), `porte.demarree`, `porte.prete` (la base a répondu), `porte.arret`, `porte.demarrage`, `porte.corps_interrompu`. Les événements d'erreur gardent les noms de `hono-gate.ts` : `porte.trop_gros`, `porte.secret_absent`, `porte.cle_absente`, `porte.secret_illisible`, `porte.secret_appli_absent`, `porte.compte_illisible`, `porte.comptes_multiples`, `porte.base`, plus `porte.delai`. **`porte.trop_gros` va au journal seulement** : n'importe qui peut envoyer un gros corps à n'importe quelle adresse, avant toute vérification ; un éditeur qui en enverrait se voit dans les lignes `porte.reponse` (statut 413, par outil). La route Hono le met dans Sentry (proposition au chapitre 03, E15-9). Le journal ne contient que les lignes de la porte : les bibliothèques n'y écrivent rien, parce que `sqlx` y mettrait des messages de Postgres (constaté à l'essai : un avertissement « canceling statement due to statement timeout » après une requête coupée), que la règle de `logError` ne garde jamais.
- **Sentry** reçoit un message par `log_error`, avec l'étiquette `event` (comme `logError`, `src/server/log.ts:37`) et l'étiquette `role = porte` (comme `role = web` ou `worker`, chapitre 13, section 13), **au plus un par nom d'événement et par minute** (`SentryThrottle`) : une panne de base (une erreur par livraison) ou un expéditeur qui insiste ne vident pas le quota et ne noient pas les autres alertes ; l'envoi suivant compte les occurrences tues, le journal les garde toutes. Ce qui part suit la règle de `src/sentry.server.config.ts` (« rien de ce qui pourrait en contenir ne part ») : `before_send` (`scrub_event`) masque tout message qui ne vient pas de `log_error`, reconnu à l'absence de l'étiquette `event` (une panique, dont le message peut citer la chaîne qu'on lisait), retire requête, utilisateur et fils d'Ariane, ne garde des extras que `outil`, `abonnement` et `etape` ; `max_breadcrumbs = 0`.
- **En-têtes.** Lus octet par octet (latin-1) et joints par « , » quand ils se répètent, comme `Headers` de Node.
- **Chaîne de requête.** Décodée par `form_urlencoded`, clé comprise. Hono 4.13.18 (`getQueryParam`, `dist/utils/url.js`) cherche d'abord la clé telle quelle puis, si l'adresse contient « % » ou « + », décode aussi les clés : `validation%54oken` est reconnue des deux côtés (une ligne de `comparer.sh` le vérifie). Le décodage d'une séquence « % » mal formée peut différer, sans effet de sécurité : l'écho rend à l'appelant ce qu'il a envoyé.
- **Adresse signée (`uri`).** La chaîne de requête est reprise telle que reçue ; Hono passe par `new URL(…).search`, qui peut réencoder certains caractères. Nos adresses n'ont pas de chaîne de requête, sauf un éditeur qui en ajouterait une (cas de vecteur « la même requête reçue sur une autre adresse »).
- **Une méthode autre que `POST`** sur `/h/…` reçoit 405 ici ; côté `web`, 404 ou 405 selon ce que la route de Next exporte (non essayé). `comparer.sh` affiche cette ligne comme « attendu ».
- **La ligne `porte.reponse`** a la forme JSON de `tracing` ici, `[leon] porte.reponse {…}` en Hono (la règle de journal du dépôt) : le programme de 4.3 lit les deux.
- **Écoute** sur `[::]` (note 02, section 5 : réseau de Railway), et sur `0.0.0.0` si IPv6 manque.
- **Arrêt** sur `SIGTERM` ou Ctrl-C : plus de nouvelle connexion, les requêtes en cours finissent (au plus `REQUEST_TIMEOUT`, 3 s).

### 9.5 Le code

```rust
// La porte des webhooks de Leon, en Rust (dossier agents, chapitre 15). Seconde mise en œuvre du contrat que tient
// d'abord la route Hono (src/server/webhooks/hono-gate.ts, chapitre 03) : mêmes adresses, mêmes étapes dans le même
// ordre, mêmes limites (fournisseurs.json), mêmes réponses sur chaque cas de vecteurs.json (section « gate »). Ce qui
// diffère hors de ces cas est écrit au chapitre 15, section 9.4.
//
// Elle reçoit une livraison, la vérifie sur le corps brut, la dépose par porte_deposer et répond. Rien d'autre : ni
// pg-boss, ni jeton OAuth, ni LEON_CONNECTORS_KEY, ni lecture de la mémoire (architecture, section 3). Son rôle
// Postgres, leon_porte, n'exécute que porte_secret et porte_deposer. Elle ne reçoit que ses variables (section 9.1 du
// chapitre 15) : sa base, sa clé, son adresse publique, l'en-tête de l'adresse IP et les secrets de signature que
// fournisseurs.json nomme.

mod depot;
mod secret;
mod verifier;

#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::pin::Pin;
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, HttpBody};
use axum::extract::{Path, RawQuery, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use axum::routing::{get, post};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::time::Instant;
use tracing_subscriber::Layer as _;
use tracing_subscriber::filter::{LevelFilter, Targets};
use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;

use crate::depot::{DB_CALL_TIMEOUT, Deposit, GateState, PorteStore, StoreError};
use crate::secret::{open_subscription_secret, parse_porte_key, subscription_aad};
use crate::verifier::{
    BodyFormat, VerifyInput, WebhookSecret, WebhookVerification, parse_body_json, read_pointer,
    secret_headers, verify_webhook,
};

// fournisseurs.json est compilé dans le binaire : l'image et le fichier ne peuvent pas diverger. Il est relu et
// vérifié au démarrage ; une version inconnue arrête le service.
const PROVIDERS_JSON: &str = include_str!("../fournisseurs.json");
const PORTE_FORMAT_VERSION: u64 = 1;
const PATH_APP: &str = "/h/{outil}";
const PATH_SUBSCRIPTION: &str = "/h/{outil}/{abonnement}";
const PATH_LIFECYCLE: &str = "/h/{outil}/{abonnement}/cycle";
// Au-delà, la requête reçoit 503 (porte.delai) et l'éditeur réessaie. 3 secondes : le plus court délai d'éditeur
// relevé (chapitre 15, section 4). Chaque appel de base a son propre délai, plus court (DB_CALL_TIMEOUT, depot.rs).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
// La lecture qui prouve la base au démarrage : porte_secret sur un outil qui n'existe pas. Elle passe par tout ce
// qu'une livraison demande (adresse, TLS et certificat, mot de passe, droit d'exécuter porte_secret, migration 0083)
// et ne rend aucune ligne.
const PROBE_TOOL: &str = "sante";
const PROBE_SUBSCRIPTION: &str = "00000000-0000-0000-0000-000000000000";
const PROBE_PAUSE: Duration = Duration::from_secs(1);
// Sentry : un envoi par nom d'événement et par fenêtre, au plus.
const SENTRY_WINDOW: Duration = Duration::from_secs(60);

// fournisseurs.json (chapitre 03, 7.1), champ pour champ.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Providers {
    pub version: u64,
    #[allow(dead_code)] // rappel « fichier généré », lu pour que deny_unknown_fields l'accepte
    pub generated_by: String,
    pub paths: Paths,
    pub limits: Limits,
    pub kept_headers: Vec<String>,
    pub tools: BTreeMap<String, ToolSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Paths {
    pub app: String,
    pub abonnement: String,
    pub cycle: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Limits {
    pub body_max_bytes: usize,
    pub headers_max_bytes: usize,
    pub header_value_max_chars: usize,
    pub echo_max_chars: usize,
    pub delivery_id_max_chars: usize,
    pub account_max_chars: usize,
    pub refusal_min_delay_ms: u64,
    pub lookup_misses_per_ip: u32,
    pub lookup_misses_unknown_ip: u32,
    pub lookup_misses_window_seconds: u64,
    pub negative_cache_seconds: u64,
    pub secret_cache_seconds: u64,
    pub cache_max_entries: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Scope {
    App,
    Abonnement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub(crate) enum Handshake {
    #[serde(rename = "echo-validation-token")]
    EchoValidationToken,
    #[serde(rename = "slack-challenge")]
    SlackChallenge,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ToolSpec {
    pub scope: Scope,
    pub body_format: BodyFormat,
    pub account_pointer: Option<String>,
    pub delivery_header: Option<String>,
    pub handshake: Option<Handshake>,
    pub lifecycle: bool,
    pub verification: WebhookVerification,
}

// /^[a-z][a-z0-9_]{1,39}$/ de hono-gate.ts (OUTIL).
fn is_tool_id(text: &str) -> bool {
    let bytes = text.as_bytes();
    (2..=40).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|&b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

// Le nom d'outil écrit au journal : celui de l'adresse s'il a la forme d'un identifiant, sinon « inconnu ».
fn tool_label(outil: &str) -> &str {
    if is_tool_id(outil) { outil } else { "inconnu" }
}

// Un UUID en minuscules (UUID de hono-gate.ts) : l'adresse d'un abonnement, telle que le worker l'a écrite.
fn is_lower_uuid(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, &b)| match index {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}

pub(crate) fn load_providers(text: &str) -> Result<Providers, String> {
    let providers: Providers = serde_json::from_str(text)
        .map_err(|error| format!("fournisseurs.json illisible : {error}"))?;
    if providers.version != PORTE_FORMAT_VERSION {
        return Err(format!(
            "fournisseurs.json est en version {}, ce binaire lit la version {PORTE_FORMAT_VERSION} : reconstruire la porte",
            providers.version
        ));
    }
    let paths = &providers.paths;
    if (
        paths.app.as_str(),
        paths.abonnement.as_str(),
        paths.cycle.as_str(),
    ) != (PATH_APP, PATH_SUBSCRIPTION, PATH_LIFECYCLE)
    {
        return Err("fournisseurs.json : des adresses que ce binaire ne sert pas".into());
    }
    for (id, tool) in &providers.tools {
        if !is_tool_id(id) {
            return Err(format!(
                "fournisseurs.json : identifiant d'outil mal formé ({id})"
            ));
        }
        if tool.scope == Scope::App && tool.account_pointer.is_none() {
            return Err(format!(
                "fournisseurs.json : {id} est d'application, sans accountPointer"
            ));
        }
    }
    if providers
        .kept_headers
        .iter()
        .any(|name| name.to_lowercase() != *name)
    {
        return Err("fournisseurs.json : un en-tête gardé n'est pas en minuscules".into());
    }
    Ok(providers)
}

// Ce que la porte lit dans son environnement, hors base et port. Une valeur vide vaut absente, comme emptyIsAbsent
// dans src/server/env.ts.
pub(crate) struct PorteSettings {
    pub porte_key: Option<[u8; 32]>,           // LEON_PORTE_KEY
    pub base: Option<String>,                  // LEON_PORTE_URL, sans « / » final
    pub ip_header: Option<String>,             // LEON_IP_HEADER, en minuscules
    pub app_secrets: BTreeMap<String, String>, // les seules variables que fournisseurs.json nomme (from: 'env')
}

pub(crate) fn porte_settings(
    providers: &Providers,
    var: impl Fn(&str) -> Option<String>,
) -> Result<PorteSettings, String> {
    let read = |name: &str| var(name).filter(|value| !value.is_empty());
    let porte_key = match read("LEON_PORTE_KEY") {
        None => None,
        Some(value) => Some(parse_porte_key(&value).ok_or("LEON_PORTE_KEY : 32 octets en base64")?),
    };
    let base = match read("LEON_PORTE_URL") {
        None => None,
        Some(url) if url.starts_with("https://") || url.starts_with("http://") => {
            Some(url.trim_end_matches('/').to_string())
        }
        Some(_) => return Err("LEON_PORTE_URL : une adresse http ou https".into()),
    };
    let ip_header = read("LEON_IP_HEADER").map(|name| name.to_lowercase());
    let mut app_secrets = BTreeMap::new();
    for tool in providers.tools.values() {
        if let WebhookSecret::Env { name } = tool.verification.secret()
            && let Some(value) = read(name)
        {
            app_secrets.insert(name.clone(), value);
        }
    }
    Ok(PorteSettings {
        porte_key,
        base,
        ip_header,
        app_secrets,
    })
}

// La clé d'une adresse IP pour la limite de débit (ipKey de hono-gate.ts). Une IPv4 telle quelle. Une IPv6 réduite à
// son /64 : un client qui tient un /64 en changerait à chaque requête. Une IPv4 écrite en IPv6 (::ffff:a.b.c.d)
// compte comme l'IPv4. None : pas une adresse.
pub(crate) fn ip_key(value: &str) -> Option<String> {
    if value.parse::<Ipv4Addr>().is_ok() {
        return Some(value.to_string());
    }
    // La zone (fe80::1%eth0) est admise par isIP de Node, puis retirée.
    let (address, zone) = match value.split_once('%') {
        Some((address, zone)) => (address, Some(zone)),
        None => (value, None),
    };
    if zone.is_some_and(|zone| {
        zone.is_empty()
            || !zone
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b':'))
    }) {
        return None;
    }
    let ip: Ipv6Addr = address.parse().ok()?;
    let segments = ip.segments();
    let dotted = address.rsplit(':').next().filter(|tail| tail.contains('.'));
    if let Some(dotted) = dotted
        && segments[..5].iter().all(|&group| group == 0)
        && segments[5] == 0xffff
    {
        return Some(dotted.to_string());
    }
    Some(format!(
        "{:x}:{:x}:{:x}:{:x}::/64",
        segments[0], segments[1], segments[2], segments[3]
    ))
}

// String.prototype.trim de JavaScript : ses espaces, pas ceux de Rust (U+0085 n'en est pas un en JavaScript).
fn js_trim(text: &str) -> &str {
    text.trim_matches(|c: char| {
        matches!(
            c,
            '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
                ..='\u{200a}'
                    | '\u{2028}'
                    | '\u{2029}'
                    | '\u{202f}'
                    | '\u{205f}'
                    | '\u{3000}'
                    | '\u{feff}'
        )
    })
}

// La longueur d'un texte comme la compte JavaScript : en unités UTF-16.
fn js_length(text: &str) -> usize {
    text.encode_utf16().count()
}

// Les en-têtes reçus, comme Object.fromEntries(new Headers(…)) : noms en minuscules, valeurs lues octet par octet
// (latin-1), deux en-têtes du même nom joints par « , ».
fn header_map(headers: &HeaderMap) -> BTreeMap<String, String> {
    let mut map: BTreeMap<String, String> = BTreeMap::new();
    for (name, value) in headers {
        let text: String = value.as_bytes().iter().map(|&b| char::from(b)).collect();
        map.entry(name.as_str().to_string())
            .and_modify(|joined| {
                joined.push_str(", ");
                joined.push_str(&text);
            })
            .or_insert(text);
    }
    map
}

// La première valeur d'un paramètre de la chaîne de requête, décodée comme URLSearchParams.
fn query_param(query: Option<&str>, name: &str) -> Option<String> {
    form_urlencoded::parse(query?.as_bytes())
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
}

// L'adresse appelée, telle que l'éditeur l'a signée : LEON_PORTE_URL, le chemin public, la chaîne de requête reçue.
fn public_uri(base: Option<&str>, target: &Target, query: Option<&str>) -> String {
    let mut uri = format!("{}/h/{}", base.unwrap_or(""), target.outil);
    if let Some(abonnement) = &target.abonnement {
        uri.push('/');
        uri.push_str(abonnement);
    }
    if target.cycle {
        uri.push_str("/cycle");
    }
    if let Some(query) = query.filter(|query| !query.is_empty()) {
        uri.push('?');
        uri.push_str(query);
    }
    uri
}

fn json_response(status: StatusCode, body: &'static str) -> Response {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    response
}

fn invalid_request() -> Response {
    json_response(StatusCode::BAD_REQUEST, r#"{"error":"Invalid request"}"#)
}

fn unavailable() -> Response {
    json_response(
        StatusCode::SERVICE_UNAVAILABLE,
        r#"{"error":"Unavailable"}"#,
    )
}

fn accepted() -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::ACCEPTED;
    response
}

// L'écho d'une poignée de main : du texte brut, jamais interprété par un navigateur.
fn echo(token: &str, limits: &Limits) -> Response {
    let control = token.chars().any(|c| (c as u32) < 0x20 || c as u32 == 0x7f);
    if js_length(token) > limits.echo_max_chars || control {
        return invalid_request();
    }
    let mut response = Response::new(Body::from(token.to_string()));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

// Sentry reçoit au plus un envoi par nom d'événement et par minute : une panne de base (une erreur par livraison) ou
// un expéditeur qui insiste ne doivent ni épuiser le quota ni noyer les autres alertes. Le journal, lui, garde chaque
// occurrence. L'envoi suivant dit combien ont été tues entre-temps.
pub(crate) struct SentryThrottle {
    last: BTreeMap<String, (std::time::Instant, u32)>, // dernier envoi, occurrences tues depuis
}

impl SentryThrottle {
    pub(crate) const fn new() -> Self {
        Self {
            last: BTreeMap::new(),
        }
    }

    // Some(n) : envoyer, n occurrences ont été tues depuis le dernier envoi. None : taire celle-ci.
    pub(crate) fn admit(&mut self, event: &str, now: std::time::Instant) -> Option<u32> {
        match self.last.get_mut(event) {
            Some((sent, muted)) if now.duration_since(*sent) < SENTRY_WINDOW => {
                *muted += 1;
                None
            }
            Some((sent, muted)) => {
                let count = *muted;
                (*sent, *muted) = (now, 0);
                Some(count)
            }
            None => {
                self.last.insert(event.to_string(), (now, 0));
                Some(0)
            }
        }
    }
}

static SENTRY_THROTTLE: Mutex<SentryThrottle> = Mutex::new(SentryThrottle::new());

// Le journal : une ligne JSON sur la sortie standard, et Sentry (au plus une fois par minute pour un même événement).
// Comme logError (src/server/log.ts) : le nom de l'événement, des identifiants, un résumé d'erreur sans texte reçu.
// Jamais un en-tête, un corps ou un secret.
pub(crate) fn log_error(event: &str, summary: &str, ids: &[(&str, &str)]) {
    let details: BTreeMap<&str, &str> = ids.iter().copied().collect();
    let details = serde_json::to_string(&details).unwrap_or_default();
    tracing::error!(event, details = %details, error = summary, "[leon]");
    let admitted = SENTRY_THROTTLE
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .admit(event, std::time::Instant::now());
    let Some(muted) = admitted else {
        return;
    };
    let message = match muted {
        0 => format!("{event}: {summary}"),
        n => format!("{event}: {summary} (et {n} autres depuis le dernier envoi, au journal)"),
    };
    sentry::with_scope(
        |scope| {
            scope.set_tag("event", event);
            for (key, value) in ids {
                scope.set_extra(key, (*value).into());
            }
        },
        || sentry::capture_message(&message, sentry::Level::Error),
    );
}

// Ce qui part vers Sentry (before_send), dans l'esprit de scrubEvent (src/server/sentry-scrub.ts) : rien de ce qui
// pourrait citer une donnée reçue. Le message d'un log_error est construit sans texte reçu : il reste, reconnu à son
// étiquette `event`. Tout autre texte (une panique, dont le message peut citer la chaîne qu'on lisait) est masqué. Ni
// requête, ni utilisateur, ni fil d'Ariane ; des extras, seulement les identifiants que log_error pose.
const MASKED: &str = "[masqué]";
const KEPT_EXTRA: [&str; 3] = ["outil", "abonnement", "etape"];

pub(crate) fn scrub_event(
    mut event: sentry::protocol::Event<'static>,
) -> sentry::protocol::Event<'static> {
    if !event.tags.contains_key("event") {
        if event.message.is_some() {
            event.message = Some(MASKED.into());
        }
        event.logentry = None;
        for exception in &mut event.exception.values {
            if exception.value.is_some() {
                exception.value = Some(MASKED.into());
            }
        }
    }
    event.request = None;
    event.user = None;
    event.breadcrumbs = Default::default();
    event
        .extra
        .retain(|key, _| KEPT_EXTRA.contains(&key.as_str()));
    event
}

// Un appel de base borné par DB_CALL_TIMEOUT : au-delà, la même erreur qu'une panne (503, porte.base). Une écriture
// qui aurait abouti malgré tout ne se double pas : l'éditeur réessaie, porte_deposer rend 0, la porte répond 202.
async fn bounded<T>(call: impl Future<Output = Result<T, StoreError>>) -> Result<T, StoreError> {
    tokio::time::timeout(DB_CALL_TIMEOUT, call)
        .await
        .unwrap_or_else(|_| Err(StoreError("Timeout".into())))
}

enum BodyError {
    TooLarge,
    Interrupted,
}

// Le corps, lu jusqu'à `max` octets et compté en le lisant : un corps sans content-length (envoyé par morceaux) est
// borné comme les autres. Au-delà : TooLarge. Une erreur de lecture (le client coupe, un corps tronqué) : Interrupted.
async fn read_body(mut body: Body, max: usize) -> Result<Vec<u8>, BodyError> {
    let mut bytes = Vec::new();
    while let Some(frame) = std::future::poll_fn(|cx| Pin::new(&mut body).poll_frame(cx)).await {
        let frame = frame.map_err(|_| BodyError::Interrupted)?;
        if let Ok(data) = frame.into_data() {
            if bytes.len() + data.len() > max {
                return Err(BodyError::TooLarge);
            }
            bytes.extend_from_slice(&data);
        }
    }
    Ok(bytes)
}

#[derive(Debug, Clone)]
pub(crate) struct Target {
    pub outil: String,
    pub abonnement: Option<String>,
    pub cycle: bool,
}

enum SecretLookup {
    Found(String),
    Refused,
    Unavailable,
}

pub(crate) type Clock = Box<dyn Fn() -> i64 + Send + Sync>;

pub(crate) fn wall_clock_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}

pub(crate) struct Porte<S> {
    providers: Providers,
    settings: PorteSettings,
    store: S,
    state: Mutex<GateState>,
    clock: Clock,
    ready: AtomicBool, // la base a répondu au moins une fois depuis le démarrage (wait_for_base)
}

impl<S: PorteStore> Porte<S> {
    pub(crate) fn new(
        providers: Providers,
        settings: PorteSettings,
        store: S,
        clock: Clock,
    ) -> Self {
        let limits = &providers.limits;
        let state = GateState::new(
            limits.secret_cache_seconds,
            limits.negative_cache_seconds,
            limits.lookup_misses_window_seconds,
            limits.cache_max_entries,
        );
        Self {
            providers,
            settings,
            store,
            state: Mutex::new(state),
            clock,
            ready: AtomicBool::new(false),
        }
    }

    pub(crate) fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    // Au démarrage : lire la base jusqu'à la première lecture réussie, puis le dire à /sante. Une seule fois : une
    // panne de base plus tard ne fait jamais échouer /sante (les livraisons reçoivent 503, l'éditeur réessaie).
    pub(crate) async fn wait_for_base(&self) {
        loop {
            match bounded(self.store.secret(PROBE_TOOL, PROBE_SUBSCRIPTION)).await {
                Ok(_) => {
                    self.ready.store(true, Ordering::Relaxed);
                    tracing::info!(event = "porte.prete", "[leon]");
                    return;
                }
                Err(error) => log_error("porte.base", &error.0, &[("etape", "demarrage")]),
            }
            tokio::time::sleep(PROBE_PAUSE).await;
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, GateState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn spec_for(&self, target: &Target) -> Option<(&str, &ToolSpec)> {
        if !is_tool_id(&target.outil) {
            return None;
        }
        let (id, spec) = self.providers.tools.get_key_value(&target.outil)?;
        let fits = match &target.abonnement {
            None => spec.scope == Scope::App,
            Some(abonnement) => spec.scope == Scope::Abonnement && is_lower_uuid(abonnement),
        };
        if !fits || (target.cycle && !spec.lifecycle) {
            return None;
        }
        Some((id.as_str(), spec))
    }

    // L'adresse IP du client, lue dans le seul en-tête que pose le proxy de confiance, réduite à sa clé.
    fn client_ip(&self, headers: &BTreeMap<String, String>) -> Option<String> {
        let name = self.settings.ip_header.as_ref()?;
        let value = js_trim(headers.get(name)?);
        if value.is_empty() {
            None
        } else {
            ip_key(value)
        }
    }

    // Le refus uniforme : même réponse, et au plus tôt au même délai, quelle qu'en soit la raison.
    async fn refuse(&self, started: Instant) -> Response {
        let delay = Duration::from_millis(self.providers.limits.refusal_min_delay_ms);
        tokio::time::sleep_until(started + delay).await;
        json_response(StatusCode::UNAUTHORIZED, r#"{"error":"Invalid signature"}"#)
    }

    // Au journal seulement, pas dans Sentry : n'importe qui peut envoyer un gros corps à n'importe quelle adresse, avant
    // toute vérification. Un éditeur qui en enverrait se voit dans les lignes porte.reponse (statut 413, par outil).
    fn too_large(&self, outil: &str) -> Response {
        tracing::warn!(
            event = "porte.trop_gros",
            outil = tool_label(outil),
            "[leon]"
        );
        json_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            r#"{"error":"Request too large"}"#,
        )
    }

    async fn secret_for(
        &self,
        outil: &str,
        spec: &ToolSpec,
        abonnement: Option<&str>,
        ip: Option<&str>,
        now_ms: i64,
    ) -> Result<SecretLookup, StoreError> {
        let limits = &self.providers.limits;
        let from = spec.verification.secret();
        if spec.scope == Scope::Abonnement
            && let Some(abonnement) = abonnement
        {
            let key = format!("{outil}:{abonnement}");
            let cached = self.state().secrets.get(&key, now_ms);
            let row = match cached {
                Some(row) => row,
                None => {
                    let source = ip.unwrap_or("inconnue");
                    {
                        let mut state = self.state();
                        if state.unknown.get(&key, now_ms).is_some() {
                            return Ok(SecretLookup::Refused);
                        }
                        let cap = if ip.is_some() {
                            limits.lookup_misses_per_ip
                        } else {
                            limits.lookup_misses_unknown_ip
                        };
                        // Limite atteinte : on ne lit plus la base pour cette source, mais on ne refuse pas non plus. Un
                        // abonnement vivant hors cache doit pouvoir être rejoué par l'éditeur (503), jamais refusé
                        // comme une fausse signature.
                        if state.misses.get(source, now_ms) >= cap {
                            return Ok(SecretLookup::Unavailable);
                        }
                    }
                    let found = bounded(self.store.secret(outil, abonnement)).await?;
                    let mut state = self.state();
                    match found {
                        None => {
                            state.unknown.set(&key, (), now_ms);
                            state.misses.add(source, now_ms);
                            return Ok(SecretLookup::Refused);
                        }
                        Some(row) => {
                            state.secrets.set(&key, row.clone(), now_ms);
                            row
                        }
                    }
                }
            };
            if *from == WebhookSecret::Abonnement {
                let Some(stored) = &row.secret else {
                    log_error(
                        "porte.secret_absent",
                        "Subscription secret missing",
                        &[("outil", outil), ("abonnement", abonnement)],
                    );
                    return Ok(SecretLookup::Refused);
                };
                let Some(key32) = &self.settings.porte_key else {
                    log_error(
                        "porte.cle_absente",
                        "LEON_PORTE_KEY missing",
                        &[("outil", outil)],
                    );
                    return Ok(SecretLookup::Unavailable);
                };
                let aad = subscription_aad(&row.tenant_id, abonnement);
                return Ok(match open_subscription_secret(stored, &aad, key32) {
                    Ok(plain) => SecretLookup::Found(plain),
                    Err(error) => {
                        log_error(
                            "porte.secret_illisible",
                            &error.to_string(),
                            &[("outil", outil), ("abonnement", abonnement)],
                        );
                        SecretLookup::Refused
                    }
                });
            }
        }
        // Une spec d'application signe toujours avec un secret d'application.
        let WebhookSecret::Env { name } = from else {
            return Ok(SecretLookup::Refused);
        };
        Ok(match self.settings.app_secrets.get(name) {
            Some(value) => SecretLookup::Found(value.clone()),
            None => {
                log_error(
                    "porte.secret_appli_absent",
                    "App secret missing",
                    &[("outil", outil)],
                );
                SecretLookup::Unavailable
            }
        })
    }

    // Le compte d'un webhook d'application : une seule valeur. Sinon, l'événement du journal qui dit pourquoi.
    fn account_of(&self, spec: &ToolSpec, corps: &str) -> Result<String, &'static str> {
        let values = spec.account_pointer.as_deref().and_then(|pointer| {
            parse_body_json(spec.body_format, corps)
                .and_then(|document| read_pointer(&document, pointer))
        });
        if let Some(values) = &values
            && values.iter().collect::<BTreeSet<_>>().len() > 1
        {
            return Err("porte.comptes_multiples");
        }
        match values.and_then(|mut values| (!values.is_empty()).then(|| values.swap_remove(0))) {
            Some(compte)
                if !compte.is_empty()
                    && js_length(&compte) <= self.providers.limits.account_max_chars =>
            {
                Ok(compte)
            }
            _ => Err("porte.compte_illisible"),
        }
    }

    // L'en-tête deliveryHeader s'il fait 1 à 200 caractères ASCII visibles, sinon le SHA-256 hexadécimal du corps.
    fn delivery_id(
        &self,
        spec: &ToolSpec,
        headers: &BTreeMap<String, String>,
        bytes: &[u8],
    ) -> String {
        let max = self.providers.limits.delivery_id_max_chars;
        let given = spec
            .delivery_header
            .as_ref()
            .and_then(|name| headers.get(name));
        match given {
            Some(value)
                if (1..=max).contains(&value.len())
                    && value.bytes().all(|b| (0x21..=0x7e).contains(&b)) =>
            {
                value.clone()
            }
            _ => hex::encode(Sha256::digest(bytes)),
        }
    }

    // Les seuls en-têtes gardés : ceux de keptHeaders et deliveryHeader, jamais celui d'une signature ou d'un jeton,
    // 1 024 caractères par valeur ; plus de 8 Kio en tout : aucun.
    fn kept_headers(
        &self,
        spec: &ToolSpec,
        headers: &BTreeMap<String, String>,
    ) -> BTreeMap<String, String> {
        let limits = &self.providers.limits;
        let banned: BTreeSet<&str> = secret_headers(&spec.verification).into_iter().collect();
        let mut wanted: BTreeSet<&str> = self
            .providers
            .kept_headers
            .iter()
            .map(String::as_str)
            .collect();
        if let Some(name) = &spec.delivery_header {
            wanted.insert(name);
        }
        let kept: BTreeMap<String, String> = headers
            .iter()
            .filter(|(name, value)| {
                wanted.contains(name.as_str())
                    && !banned.contains(name.as_str())
                    && js_length(value) <= limits.header_value_max_chars
            })
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        let size = serde_json::to_string(&kept).map_or(usize::MAX, |json| json.len());
        if size <= limits.headers_max_bytes {
            kept
        } else {
            BTreeMap::new()
        }
    }

    // Une requête, bornée dans le temps, puis une ligne de mesure (chapitre 15, section 4) : la même que
    // hono-gate.ts, sans contenu ni identifiant d'abonnement. Elle donne la part de 5xx et le p95 des livraisons.
    async fn handle(&self, target: Target, query: Option<String>, request: Request) -> Response {
        let started = Instant::now();
        let outil = tool_label(&target.outil).to_string();
        let response =
            match tokio::time::timeout(REQUEST_TIMEOUT, self.receive(target, query, request)).await
            {
                Ok(response) => response,
                Err(_) => {
                    log_error("porte.delai", "Request timeout", &[("outil", &outil)]);
                    unavailable()
                }
            };
        let ms = started.elapsed().as_millis() as u64;
        tracing::info!(
            event = "porte.reponse",
            outil,
            statut = response.status().as_u16(),
            ms,
            "[leon]"
        );
        response
    }

    // Le déroulé d'une requête : les étapes de la section 6.1 du chapitre 03, dans le même ordre.
    async fn receive(&self, target: Target, query: Option<String>, request: Request) -> Response {
        let started = Instant::now();
        let now_ms = (self.clock)();
        let limits = &self.providers.limits;
        let (parts, body) = request.into_parts();

        // 1. Le corps, avant tout, comme le bodyLimit de hono-gate.ts : un content-length trop grand est refusé sans rien
        // lire ; sinon le corps est lu et compté (un corps envoyé par morceaux, sans content-length, aussi).
        let declared = parts
            .headers
            .get(header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        if declared.is_some_and(|length| length > limits.body_max_bytes as u64) {
            return self.too_large(&target.outil);
        }
        let bytes = match read_body(body, limits.body_max_bytes).await {
            Ok(bytes) => bytes,
            Err(BodyError::TooLarge) => return self.too_large(&target.outil),
            // Le client a coupé, ou le corps est tronqué : personne n'attend la réponse. Au journal seulement.
            Err(BodyError::Interrupted) => {
                tracing::info!(
                    event = "porte.corps_interrompu",
                    outil = tool_label(&target.outil),
                    "[leon]"
                );
                return invalid_request();
            }
        };

        // 2. L'adresse : outil connu, forme conforme à sa portée, abonnement en UUID minuscule, /cycle si permis.
        let Some((outil, spec)) = self.spec_for(&target) else {
            return self.refuse(started).await;
        };

        // 3. Microsoft Graph vérifie l'adresse pendant la création de l'abonnement : écho, sans lire la base.
        if spec.handshake == Some(Handshake::EchoValidationToken)
            && let Some(token) = query_param(query.as_deref(), "validationToken")
        {
            return echo(&token, limits);
        }

        // 4. De l'UTF-8 valide, sans octet nul : Postgres refuse l'octet nul dans un text.
        let Some(corps) = std::str::from_utf8(&bytes)
            .ok()
            .filter(|text| !text.contains('\0'))
        else {
            return invalid_request();
        };

        // 5. Sans LEON_PORTE_URL, une signature qui couvre l'adresse ne peut pas être vérifiée.
        let base = self.settings.base.as_deref();
        if base.is_none() && spec.verification.signs_uri() {
            return unavailable();
        }

        let headers = header_map(&parts.headers);
        let ip = self.client_ip(&headers);

        // 6. Le secret.
        let secret = match self
            .secret_for(
                outil,
                spec,
                target.abonnement.as_deref(),
                ip.as_deref(),
                now_ms,
            )
            .await
        {
            Ok(SecretLookup::Found(secret)) => secret,
            Ok(SecretLookup::Refused) => return self.refuse(started).await,
            Ok(SecretLookup::Unavailable) => return unavailable(),
            Err(error) => {
                // Une panne de base n'est pas un refus : l'éditeur réessaiera.
                log_error("porte.base", &error.0, &[("outil", outil)]);
                return unavailable();
            }
        };

        // 7. La signature, sur le corps brut.
        let uri = public_uri(base, &target, query.as_deref());
        let verdict = verify_webhook(&VerifyInput {
            verification: &spec.verification,
            body_format: spec.body_format,
            secret: &secret,
            method: parts.method.as_str(),
            uri: &uri,
            headers: &headers,
            body: &bytes,
            now_ms,
        });
        if let Err(reason) = verdict {
            // Au journal seulement (pas dans Sentry : un refus est attendu), jamais dans la réponse.
            tracing::info!(
                event = "porte.refus",
                outil,
                raison = reason.as_str(),
                "[leon]"
            );
            return self.refuse(started).await;
        }

        // 8. Slack : un url_verification signé reçoit son challenge en écho.
        if spec.handshake == Some(Handshake::SlackChallenge)
            && let Some(document) = parse_body_json(spec.body_format, corps)
            && document.get("type").and_then(|value| value.as_str()) == Some("url_verification")
            && let Some(challenge) = document.get("challenge").and_then(|value| value.as_str())
        {
            return echo(challenge, limits);
        }

        // 9. Un webhook d'application : le compte, une seule valeur.
        let mut compte = None;
        if spec.scope == Scope::App {
            match self.account_of(spec, corps) {
                Ok(account) => compte = Some(account),
                Err(event) => {
                    // Signée par l'éditeur, mais impossible à ranger : rien n'est déposé, l'éditeur ne réessaie pas.
                    log_error(event, "Account not found", &[("outil", outil)]);
                    return accepted();
                }
            }
        }

        // 10 à 12. Identifiant de livraison, en-têtes gardés, dépôt.
        let deposit = Deposit {
            outil: outil.to_string(),
            abonnement: target.abonnement.clone(),
            compte,
            genre: if target.cycle { "cycle" } else { "livraison" },
            livraison: self.delivery_id(spec, &headers, &bytes),
            corps: corps.to_string(),
            entetes: self.kept_headers(spec, &headers),
        };
        match bounded(self.store.deposit(&deposit)).await {
            // 0 : déjà reçue, ou personne n'écoute ce compte. Même réponse : l'éditeur ne doit pas réessayer.
            Ok(_) => accepted(),
            Err(error) => {
                log_error("porte.base", &error.0, &[("outil", outil)]);
                unavailable()
            }
        }
    }
}

async fn app_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path(outil): Path<String>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: None,
                cycle: false,
            },
            query,
            request,
        )
        .await
}

async fn subscription_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path((outil, abonnement)): Path<(String, String)>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: Some(abonnement),
                cycle: false,
            },
            query,
            request,
        )
        .await
}

async fn lifecycle_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path((outil, abonnement)): Path<(String, String)>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: Some(abonnement),
                cycle: true,
            },
            query,
            request,
        )
        .await
}

// Le bilan de santé de Railway (healthcheckPath), qui ne sert qu'au déploiement (chapitre 13, 4.1, à vérifier). 503
// tant que la base n'a jamais répondu : un déploiement dont la base est injoignable ou mal réglée (mot de passe, hôte,
// certificat, migration) échoue, et Railway garde l'ancienne version. 200 ensuite, pour toujours : la route ne lit pas
// la base, et une panne de base en régime ne fait pas redémarrer la porte en boucle.
async fn health<S: PorteStore>(State(porte): State<Arc<Porte<S>>>) -> Response {
    if porte.is_ready() {
        json_response(StatusCode::OK, r#"{"ok":true}"#)
    } else {
        json_response(StatusCode::SERVICE_UNAVAILABLE, r#"{"ok":false}"#)
    }
}

pub(crate) fn router<S: PorteStore>(porte: Arc<Porte<S>>) -> Router {
    Router::new()
        .route(PATH_APP, post(app_route::<S>))
        .route(PATH_SUBSCRIPTION, post(subscription_route::<S>))
        .route(PATH_LIFECYCLE, post(lifecycle_route::<S>))
        .route("/sante", get(health::<S>))
        .with_state(porte)
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

// SIGTERM (Railway, à la fin du recouvrement) ou Ctrl-C : on n'accepte plus de connexion, on finit les requêtes en
// cours. Une requête dure au plus REQUEST_TIMEOUT (3 s) : drainingSeconds de 5 suffit.
async fn shutdown_signal() {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
    tracing::info!(event = "porte.arret", "[leon]");
}

async fn run() -> Result<(), String> {
    let providers = load_providers(PROVIDERS_JSON)?;
    let settings = porte_settings(&providers, env_var)?;
    let database_url = env_var("DATABASE_URL_PORTE").ok_or(
        "DATABASE_URL_PORTE manque : l'adresse du rôle leon_porte (chapitre 13, section 10)",
    )?;
    let store =
        depot::connect(&database_url).map_err(|_| "DATABASE_URL_PORTE illisible".to_string())?;
    let port: u16 = match env_var("PORT") {
        Some(port) => port
            .parse()
            .map_err(|_| "PORT : un numéro de port".to_string())?,
        None => 8080,
    };
    let tools = providers
        .tools
        .keys()
        .cloned()
        .collect::<Vec<_>>()
        .join(",");
    let porte = Arc::new(Porte::new(
        providers,
        settings,
        store,
        Box::new(wall_clock_ms),
    ));
    // /sante répond 503 jusqu'à la première lecture réussie de la base ; les livraisons sont servies dès l'écoute.
    tokio::spawn({
        let porte = porte.clone();
        async move { porte.wait_for_base().await }
    });
    // Le réseau de Railway demande d'écouter sur « :: » (note 02, section 5) ; sans IPv6, on se rabat sur IPv4.
    let listener = match tokio::net::TcpListener::bind(SocketAddr::from((
        Ipv6Addr::UNSPECIFIED,
        port,
    )))
    .await
    {
        Ok(listener) => listener,
        Err(_) => tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, port)))
            .await
            .map_err(|_| format!("impossible d'écouter sur le port {port}"))?,
    };
    tracing::info!(event = "porte.demarree", port, outils = %tools, "[leon]");
    axum::serve(listener, router(porte))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|_| "le serveur s'est arrêté sur une erreur".to_string())
}

fn main() -> ExitCode {
    // Le journal : des lignes JSON, celles de la porte seulement. Les bibliothèques n'y écrivent rien : sqlx y mettrait
    // des messages de Postgres (un avis, une erreur de connexion testée), que la règle de logError ne garde jamais.
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_target(false)
                .with_filter(Targets::new().with_target("porte", LevelFilter::INFO)),
        )
        .init();
    // Sentry avant le moteur asynchrone, comme le demande sa documentation. Sans SENTRY_DSN, rien ne part.
    let mut options = sentry::ClientOptions::default();
    options.dsn = env_var("SENTRY_DSN").and_then(|dsn| dsn.parse().ok());
    options.release = env_var("RAILWAY_GIT_COMMIT_SHA").map(Into::into);
    options.environment = env_var("RAILWAY_ENVIRONMENT_NAME").map(Into::into);
    options.send_default_pii = false;
    // Comme sentry.server.config.ts : rien de ce qui pourrait citer une donnée reçue ne part, aucun fil d'Ariane.
    options.max_breadcrumbs = 0;
    options.before_send = Some(Arc::new(|event| Some(scrub_event(event))));
    let _sentry = sentry::init(options);
    sentry::configure_scope(|scope| scope.set_tag("role", "porte"));
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("[leon] porte : impossible de démarrer le moteur asynchrone");
            return ExitCode::FAILURE;
        }
    };
    match runtime.block_on(run()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!(event = "porte.demarrage", error = %message, "[leon]");
            ExitCode::FAILURE
        }
    }
}
```

## 10. L'image : `Dockerfile` et `Dockerfile.dockerignore`

Fichiers : `services/porte/Dockerfile` et `services/porte/Dockerfile.dockerignore` (à créer). Construits par Railway depuis la racine du dépôt (chapitre 13, 4.1 : `RAILWAY_DOCKERFILE_PATH=services/porte/Dockerfile`, à vérifier dans la documentation de l'éditeur). La racine est le contexte parce que l'image a besoin de `certs/rds-eu-central-1-bundle.pem` (existe) en plus de `services/porte/`.

Trois étapes, sur le patron de la note 02 (8.3) :

- **cargo-chef 0.1.78** : les dépendances se compilent dans une couche à part, gardée tant que `Cargo.lock` ne change pas. Une PR qui ne touche que `src/` recompile la seule caisse `porte` (une vingtaine de secondes en local, section 5.4).
- **`rust:1.97.0-slim-bookworm`** pour construire : la même version que `rust-toolchain.toml` (l'image n'a donc rien à télécharger). L'image `slim` contient `gcc`, dont `ring` a besoin ; ni `cmake` ni OpenSSL (section 5.1).
- **`gcr.io/distroless/cc-debian12:nonroot`** pour tourner : ni shell, ni gestionnaire de paquets, un utilisateur sans droits. Le binaire ne demande que glibc, libm et libgcc (`ldd`, section 5.4). Même Debian (12, « bookworm ») des deux côtés : un binaire construit sur une glibc plus récente pourrait refuser de démarrer sur une plus ancienne. Pas de `HEALTHCHECK` (pas de shell) : c'est Railway qui interroge `/sante`.

**Le certificat RDS** est copié au même chemin que dans l'image Railpack de `web` (`/app/certs/rds-eu-central-1-bundle.pem`, chapitre 13, 10.2). `DATABASE_URL_PORTE` est donc la même chaîne sur `web` et sur `porte`, `sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem` comprises : le chapitre 13 laissait ce chemin à fixer ici.

**`Dockerfile.dockerignore`** : BuildKit lit, à côté d'un Dockerfile, un fichier d'exclusion qui porte son nom. Il réduit le contexte à `services/porte/` et au certificat, sans `.dockerignore` à la racine, qui pourrait toucher la construction Railpack de `web` et `worker`. Que Railway lise ce fichier est à vérifier ; sans lui, la construction marche quand même, elle envoie seulement tout le dépôt comme contexte.

```dockerfile
# syntax=docker/dockerfile:1
# La porte des webhooks (dossier agents, chapitre 15). Railway la construit depuis la racine du dépôt, avec
# RAILWAY_DOCKERFILE_PATH=services/porte/Dockerfile (note 02, section 5 : à vérifier dans la documentation de Railway).
# Le contexte n'emporte que services/porte et le certificat RDS (Dockerfile.dockerignore).

# cargo-chef : les dépendances se compilent dans une couche à part, gardée en cache tant que Cargo.lock ne change pas.
FROM rust:1.97.0-slim-bookworm AS chef
RUN cargo install cargo-chef --version 0.1.78 --locked
WORKDIR /app

FROM chef AS planner
COPY services/porte/ ./
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --locked --recipe-path recipe.json
COPY services/porte/ ./
RUN cargo build --release --locked --bin porte

# Ni shell ni gestionnaire de paquets, un utilisateur sans droits. Le binaire ne demande que glibc, libm et libgcc
# (ldd) : rustls et ring, pas d'OpenSSL. Même version de Debian que l'étape de construction (glibc).
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/porte /usr/local/bin/porte
# Même fichier et même chemin que dans l'image de web (README, « En ligne ») : DATABASE_URL_PORTE est la même chaîne
# sur les deux services, sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem.
COPY certs/rds-eu-central-1-bundle.pem /app/certs/rds-eu-central-1-bundle.pem
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/porte"]
```

```gitignore
# Le contexte de construction de la porte est la racine du dépôt (Railway). BuildKit lit ce fichier, placé à côté du
# Dockerfile, au lieu d'un .dockerignore à la racine : celui-ci ne touche donc pas web ni worker (à vérifier sur Railway).
*
!services/porte/
services/porte/target/
!certs/rds-eu-central-1-bundle.pem
```

**Non construit ici** : la session n'avait pas de démon Docker. Les noms d'images (`rust:1.97.0-slim-bookworm`, `gcr.io/distroless/cc-debian12:nonroot`) sont à vérifier sur leurs registres le jour de la PR. Le premier essai, sur un poste avec Docker, depuis la racine du dépôt :

```bash
docker build -f services/porte/Dockerfile -t leon-porte .
docker images leon-porte                                   # la taille, à noter dans la PR (note 02 : 30 à 80 Mo, déduit)
docker run --rm -p 8080:8080 -e DATABASE_URL_PORTE='postgres://leon_porte:leon_porte@host.docker.internal:54329/leon?sslmode=disable' leon-porte &
curl -sS http://127.0.0.1:8080/sante                       # attendu : {"ok":true} ; {"ok":false} (503) si la base refuse
curl -sS -X POST http://127.0.0.1:8080/h/outlook/00000000-0000-4000-8000-000000000000 -d '{}'
# attendu, au bout de 200 ms : {"error":"Invalid signature"} (ou 503 si la base locale n'a pas la migration 0083)
```

## 11. Le job de CI `porte`

Fichier : `.github/workflows/tests.yml` (existe ; deux jobs aujourd'hui, `code` et `base`). Un troisième job, ajouté dans la PR du service (P2, section 16). L'architecture (section 2) fixe ses trois commandes : `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`. J'y ajoute `--locked` (le `Cargo.lock` commité fait foi) et `--all-targets` (clippy relit aussi les tests).

```yaml
  # La porte en Rust (dossier agents, chapitre 15) : le service lit services/porte/fournisseurs.json et passe
  # services/porte/vecteurs.json, que le job code vérifie à jour (providers-json.test.ts, chapitre 03). Les deux jobs
  # tournent sur le même commit : un changement de WebhookSpec qui casserait le Rust casse ce job dans la même PR.
  porte:
    name: La porte en Rust
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: services/porte
    steps:
      - uses: actions/checkout@v7
      # La version de rust-toolchain.toml, avec rustfmt et clippy. rustup est sur les machines de GitHub.
      - run: rustup toolchain install 1.97.0 --profile minimal --component rustfmt,clippy
      # Le cache des dépendances, enregistré depuis main seulement (10 Go de cache par dépôt, note 02 section 6).
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: services/porte
          save-if: ${{ github.ref == 'refs/heads/main' }}
      - run: cargo fmt --check
      - run: cargo clippy --locked --all-targets -- -D warnings
      - run: cargo test --locked
```

À savoir :

- **Le job tourne à chaque PR**, même sans changement dans `services/porte/`. Un filtre par chemin demanderait une action de plus (ou un job séparé avec `paths`), et le job doit justement tourner quand une PR ne touche que le TypeScript : un `WebhookSpec` modifié régénère `fournisseurs.json`, que le Rust doit encore lire. Avec le cache, la note 02 estime 2 à 4 minutes (non mesuré) ; il tourne en parallèle de `code` et `base`.
- **Il ne construit pas l'image.** Un `docker build` en CI coûterait plusieurs minutes de plus pour vérifier ce que Railway vérifie à chaque déploiement. À ajouter si une PR casse l'image sans casser `cargo test`.
- **Railway attend la CI** si l'option existe (chapitre 13, 4.1, à vérifier) : un `main` où `porte` est rouge ne part pas.
- **Les versions des actions** : `actions/checkout@v7` est celle du dépôt (`tests.yml`, existe). `Swatinem/rust-cache@v2` est la version majeure que je connais ; son option `save-if` est à vérifier dans sa documentation.
- **Plus tard** : `cargo deny check` (licences, avis de sécurité) dans ce job, quand le service est en production. Pas maintenant : un outil de plus à installer pour un service qui ne tourne pas.

## 12. Le service Railway `porte`

Le chapitre 13 a fixé sa place (4.1, colonne de droite ; 8.2 ; 9) et laissé quatre valeurs à ce chapitre. Les voici, avec le reste de la colonne recopié.

| Réglage | `porte` | Pourquoi |
|---|---|---|
| Source, dossier racine | dépôt GitHub, `main` ; racine du dépôt | Le contexte doit contenir `certs/` (section 10) |
| `builder` | Dockerfile, `RAILWAY_DOCKERFILE_PATH=services/porte/Dockerfile` | Chapitre 13, à vérifier |
| `preDeployCommand` | aucune | La porte ne migre rien |
| `startCommand` | aucune : l'`ENTRYPOINT` de l'image | |
| `healthcheckPath` | `/sante` | Architecture, section 6 |
| `healthcheckTimeout` | **`30`** | Le binaire démarre en quelques millisecondes ; `/sante` passe à 200 après une première lecture de `porte_secret` (section 9.4), qui ouvre une connexion TLS vers RDS. 30 secondes laissent Railway démarrer le conteneur et la base répondre ; au-delà, le déploiement échoue et l'ancienne version reste (fixé ici) |
| `overlapSeconds` | `"0"` | Comme `web` et `worker` |
| `drainingSeconds` | **`"5"`** | Une requête dure au plus `REQUEST_TIMEOUT` (3 s, section 9.4), plus une marge (fixé ici) |
| `restartPolicyType` | `ON_FAILURE` | |
| Répliques | 1 | Les caches et la limite sont en mémoire (section 8) ; deux instances resteraient sûres, chacune avec ses caches |
| Domaines publics | aucun avant la bascule, sauf le domaine fourni par Railway pour les essais ; `porte.<domaine>` après (section 13) | |
| Région | celle de `web` et `worker` | La latence vers RDS (chapitre 13, section 12) |
| Chemins surveillés (facultatif) | `services/porte/**` et `certs/rds-eu-central-1-bundle.pem` | Une PR qui ne touche que le TypeScript ne reconstruit pas la porte ; mais un `fournisseurs.json` régénéré, si (il est sous `services/porte/`) |
| Attendre la CI | oui, si l'option existe | Le job `porte` (section 11) |

**Les variables du service `porte`** (le chapitre 13, section 9, en laisse les noms à ce chapitre) :

| Variable | Valeur | Partagée avec |
|---|---|---|
| `DATABASE_URL_PORTE` | `postgres://leon_porte:<mot de passe>@<hôte RDS>:5432/leon?sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem` : la même chaîne que sur `web` (chapitre 13, 10.2) | `web`, jusqu'à l'extinction de la route Hono (13.6) |
| `LEON_PORTE_KEY` | partagée, identique | `web`, `worker` |
| `LEON_PORTE_URL` | `https://porte.<domaine>`, partagée. **Avant la bascule aussi** : la signature HubSpot couvre cette adresse, même quand le service est essayé par son domaine Railway | `web`, `worker` |
| `LEON_IP_HEADER` | `x-real-ip`, comme `web` (chapitre 13, 9) | `web`, `worker`. Le chapitre 13 met « — » pour `porte` : écart E15-4 |
| `LEON_OAUTH_HUBSPOT_SECRET` | partagée | `web`, `worker` |
| `LEON_PORTE_SECRET_<OUTIL>` | le jour où un outil en demande un (Linear, GitHub : chapitre 03, écart E-h) | `web`, jusqu'à 13.6 |
| `SENTRY_DSN` | partagée | `web`, `worker` |
| `RAILWAY_DOCKERFILE_PATH` | `services/porte/Dockerfile` | |
| `PORT`, `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_ENVIRONMENT_NAME` | posées par Railway | |

Rien d'autre. En particulier ni `DATABASE_URL`, ni `DATABASE_URL_ADMIN`, ni `LEON_CONNECTORS_KEY`, ni `BETTER_AUTH_SECRET` : le binaire ne les lit pas, et le service ne doit pas les avoir.

**Les connexions Postgres** : 5 pour le service (section 8), comme le chapitre 13 (8.2) les a comptées. `web` rend ses 2 de `portePool` à l'extinction de la route Hono (13.6).

**Sentry** : le même projet que `web` et `worker`, l'étiquette `role = porte` (section 9.4). À créer dans Sentry, à la main : une alerte sur `event:porte.base` (une panne de base vue par la porte, ou une base injoignable au démarrage, `etape: demarrage`) et une sur `event:porte.secret_illisible` (une clé `LEON_PORTE_KEY` qui ne correspond plus, chapitre 03, section 5). Chaque événement part au plus une fois par minute (section 9.4) : les deux alertes se règlent sur la première occurrence, pas sur un nombre d'événements.

## 13. La bascule du domaine

L'architecture (section 3) : « `LEON_PORTE_URL` est un domaine à part dès le premier jour. Il pointe d'abord sur `web` […], puis sur le service Rust. Aucun abonnement n'est à recréer chez un éditeur. » Le chapitre 13 (section 11) a posé `porte.<domaine>` sur `web`, avec une durée de vie DNS de 60 secondes. Cette section le déplace.

Ce que la bascule ne touche pas : aucune adresse d'abonnement, aucun secret, aucune ligne en base, aucun code TypeScript. La route Hono reste déployée dans `web`, prête à reprendre, jusqu'à 13.6.

### 13.1 Avant : le service tourne, sans domaine à lui

1. La décision est écrite dans la PR : la mesure qui l'a déclenchée (section 4), avec ses chiffres, ou la décision de David.
2. Le service `porte` est créé et déployé (section 12), avec toutes ses variables, `LEON_PORTE_URL` comprise. Il n'a que le domaine que Railway lui donne pour les essais (forme exacte à vérifier dans la documentation de l'éditeur ; Exemple fictif : `https://porte-production.up.railway.app`).
3. `/sante` répond `{"ok":true}` sur ce domaine. Le journal du service montre `porte.demarree` avec les outils attendus.
4. **La comparaison.** `services/porte/comparer.sh` envoie aux deux portes les mêmes requêtes sans secret (abonnement inconnu, outil inconnu, adresse mal formée, écho de validation, écho dont la clé est encodée, caractère de contrôle, corps trop gros avec `content-length` et envoyé par morceaux sans lui, corps illisible, signature HubSpot fausse, méthode `GET`) et compare statut et corps. Toutes les lignes doivent dire « pareil », sauf « méthode GET », qui dit « attendu » (405 ici ; 404 ou 405 côté `web`, section 9.4). Une ligne « DIFFÉRENT » arrête la bascule :

```bash
services/porte/comparer.sh https://porte.<domaine> https://porte-production.up.railway.app
```

Essayé en local entre le binaire d'avant la relecture et celui d'après (section 15.4) : toutes les lignes disent « pareil », sauf le corps trop gros envoyé par morceaux vers un outil inconnu (401 avant, 413 après, comme le `bodyLimit` de Hono). C'est la correction de l'étape 1 (section 19).

5. **Une répétition**, une fois, pour connaître la durée du trou sans toucher aux éditeurs : un sous-domaine d'essai, `porte-essai.<domaine>`, posé sur `web` (mêmes gestes que le chapitre 13, section 11), puis déplacé sur `porte` en suivant 13.3 avec la sonde. Le trou mesuré va dans la PR. Puis le sous-domaine est retiré.

```bash
#!/usr/bin/env bash
# Compare deux mises en œuvre de la porte sur des requêtes qui ne demandent aucun secret (dossier agents,
# chapitre 15, section 13). Usage : services/porte/comparer.sh https://porte.<domaine> https://<service porte>.up.railway.app
# Chaque ligne : la requête, puis le statut et le corps de chaque côté. Toute différence est signalée, sauf celles que
# le chapitre 15 (section 9.4) attend : la ligne dit alors « attendu » et ce qui est attendu.
set -euo pipefail
a="${1:?adresse de la porte en service}"
b="${2:?adresse de la porte à essayer}"
inconnu="00000000-0000-4000-8000-000000000000"
gros="$(mktemp)"
trap 'rm -f "$gros"' EXIT
head -c 262145 /dev/zero | tr '\0' 'a' > "$gros"

essai() {
  local nom="$1"; shift
  local ra rb
  ra="$(curl -sS -o - -w ' %{http_code}' "$@" "$a$CHEMIN" || true)"
  rb="$(curl -sS -o - -w ' %{http_code}' "$@" "$b$CHEMIN" || true)"
  if [[ "$ra" == "$rb" ]]; then echo "pareil      $nom : $ra"
  elif [[ -n "${ATTENDU:-}" ]]; then echo "attendu     $nom : [$ra] contre [$rb] ($ATTENDU)"
  else echo "DIFFÉRENT   $nom : [$ra] contre [$rb]"; fi
}

CHEMIN="/h/outlook/$inconnu"            essai "abonnement inconnu" -X POST -H 'content-type: application/json' -d '{"value":[]}'
CHEMIN="/h/inconnu/$inconnu"            essai "outil inconnu" -X POST -d '{}'
CHEMIN="/h/outlook/ABC"                 essai "abonnement mal formé" -X POST -d '{}'
CHEMIN="/h/hubspot/$inconnu"            essai "outil d'application sur une adresse d'abonnement" -X POST -d '[]'
CHEMIN="/h/outlook/$inconnu?validationToken=essai%20de%20comparaison" essai "écho de validation" -X POST
CHEMIN="/h/outlook/$inconnu?validationToken=%01" essai "écho avec un caractère de contrôle" -X POST
CHEMIN="/h/outlook/$inconnu"            essai "corps trop gros" -X POST --data-binary "@$gros"
CHEMIN="/h/inconnu"                     essai "corps trop gros, par morceaux, outil inconnu" -X POST \
  -H 'transfer-encoding: chunked' --data-binary "@$gros"
CHEMIN="/h/outlook/$inconnu?validation%54oken=essai" essai "écho, clé encodée" -X POST
CHEMIN="/h/outlook/$inconnu"            essai "corps qui n'est pas de l'UTF-8" -X POST --data-binary $'\xff\xfe'
CHEMIN="/h/hubspot"                     essai "hubspot, signature fausse" -X POST \
  -H "x-hubspot-request-timestamp: $(($(date +%s) * 1000))" -H 'x-hubspot-signature-v3: AAAA' -d '[{"portalId":1}]'
CHEMIN="/h/outlook/$inconnu" ATTENDU="405 ici ; 404 ou 405 côté web, selon Next" essai "méthode GET" -X GET
```

### 13.2 La sonde

`services/porte/sonde.sh` dit, toutes les 500 ms, qui répond sous une adresse : `/sante` répond 200 sur le service Rust et 404 sur `web` (Next n'a pas cette page) ; un abonnement inconnu doit recevoir 401 des deux. Toute autre réponse est comptée dans le trou. Essayée en local contre le binaire : « rust … ok » quand il tourne, « aucun … TROU » quand il est arrêté (section 15.4).

```bash
#!/usr/bin/env bash
# La sonde de la porte (dossier agents, chapitre 15, sections 4 et 13). Toutes les 500 ms, deux requêtes sans secret :
#   GET /sante : 200, c'est le service Rust ; 404, c'est web (Next n'a pas de page /sante) ;
#   POST d'un abonnement inconnu : 401, la porte refuse comme prévu, quelle qu'elle soit.
# Toute autre réponse (000 : pas de réponse en 2 s) est le trou. Usage : services/porte/sonde.sh https://porte.<domaine>
# Ctrl-C pour arrêter ; le résumé compte les secondes de trou.
set -uo pipefail
adresse="${1:?adresse de la porte, sans / final}"
inconnu="/h/outlook/00000000-0000-4000-8000-000000000000"
total=0
trou=0
resume() { echo "sondes : $total, dans le trou : $trou (environ $((trou / 2)) s)"; exit 0; }
trap resume INT TERM
while true; do
  sante="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$adresse/sante" || true)"
  refus="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 -X POST -d '{}' "$adresse$inconnu" || true)"
  case "$sante" in 200) qui=rust ;; 404) qui=web ;; *) qui=aucun ;; esac
  total=$((total + 1))
  if [[ "$refus" != 401 || "$qui" == aucun ]]; then
    trou=$((trou + 1))
    etat="TROU"
  else
    etat="ok"
  fi
  printf '%s %-5s sante=%s refus=%s %s\n' "$(date -u +%H:%M:%S.%3N)" "$qui" "$sante" "$refus" "$etat"
  sleep 0.5
done
```

La même sonde sert avant de décider (section 4) : lancée pendant une mise en ligne ordinaire de `web`, elle dit si la porte en Hono a un trou, et combien de secondes.

### 13.3 Les gestes, dans l'ordre

À une heure creuse, hors des heures de réunion des clients (Fathom envoie à la fin d'une réunion et ne documente aucune reprise, note 05), pas pendant une mise en ligne de `web`. Deux personnes : l'une fait les gestes, l'autre regarde la sonde et le journal.

1. Lancer la sonde sur `https://porte.<domaine>`. Elle doit dire « web … ok ».
2. Railway, service `web` : retirer le domaine personnalisé `porte.<domaine>`. Service `porte` : l'ajouter. Railway donne une nouvelle cible DNS (forme, et possibilité d'ajouter le domaine au second service avant de le retirer du premier : à vérifier dans la documentation de l'éditeur ; si c'est possible, ajouter d'abord, retirer ensuite).
3. Chez le registraire, changer l'enregistrement de `porte.<domaine>` vers la nouvelle cible. Durée de vie : 60 secondes, posée depuis le chapitre 13.
4. Attendre que Railway marque le domaine comme vérifié et son certificat comme émis. La sonde passe de « web » à « rust », avec un trou entre les deux.
5. Arrêter la sonde quand elle dit « rust … ok » depuis 10 minutes. Noter dans la PR le nombre de secondes de trou.
6. **La relève forcée**, obligatoire, dès que la sonde dit « rust … ok », sans attendre les 10 minutes du geste 5 : sous le rôle propriétaire, avancer la prochaine relève de chaque connexion des trois outils de la porte. Le tic de chaque minute (`connector-tick`, `connector_syncs_due()`, existent) les reprend aussitôt, au lieu d'attendre jusqu'à 15 minutes. C'est le geste de « Synchroniser maintenant » (`requestSyncNow`, `src/server/connectors/connections.ts:297`, existe), pour toutes les connexions à la fois. Noter dans la PR le nombre de connexions relevées.

```sql
-- Après le trou de la bascule : chaque connexion Outlook, HubSpot et Fathom en service est relevée au prochain tic.
-- Des comptes seulement, aucun identifiant.
with relevees as (
  update connections set next_sync_at = now(), updated_at = now()
   where provider = any (array['outlook', 'hubspot', 'fathom']) and status = any (array['active', 'error'])
  returning provider
)
select provider, count(*) from relevees group by 1;
```

Pendant le trou, une livraison échoue (pas de réponse, 404 ou erreur de certificat). Graph et HubSpot réessaient (notes 04 et 05, sources tierces : HubSpot jusqu'à 10 fois en 24 heures ; Graph, à vérifier) ; pour Fathom, rien n'est trouvé. La relève forcée du geste 6 rattrape ce qui a été créé ou modifié pendant le trou, en une minute plutôt qu'en quinze : l'ingestion est idempotente (architecture, section 5). Elle ne rattrape pas une suppression HubSpot, que seul le webhook apporte (chapitre 03, 12.2) : celle-là ne revient que si HubSpot réessaie.

### 13.4 Vérifier

Dans l'heure qui suit :

```bash
# Le journal du service porte : des livraisons acceptées, par outil (export du journal, section 4.3).
jq -c 'select(.fields.event == "porte.reponse") | .fields' journal-porte.txt | jq -s 'group_by(.outil) | map({outil: .[0].outil, n: length, ok: map(select(.statut == 202)) | length})'
```

```sql
-- Sous le rôle propriétaire : des livraisons déposées depuis la bascule, par outil. Des comptes, aucun contenu.
select outil, genre, count(*), max(recu_le)
  from boite_entree_webhooks
 where recu_le > now() - interval '1 hour'
 group by 1, 2;
```

Et dans Sentry : aucun `porte.base`, aucun `porte.secret_illisible`, aucun `porte.secret_appli_absent` sous `role:porte`. Puis `comparer.sh` une dernière fois, entre `https://porte.<domaine>` (désormais le service Rust) et le domaine de Railway : tout « pareil ».

### 13.5 Revenir en arrière

Quand : une rafale de `porte.base` ou de `porte.secret_illisible`, une ligne « DIFFÉRENT » de `comparer.sh`, des livraisons qui n'arrivent plus (requête de 13.4 vide alors que la relève trouve du nouveau), ou une mesure de la section 4 pire qu'avec la porte en Hono.

Comment : les gestes 2 à 4 de 13.3 à l'envers, **puis le geste 6** (la relève forcée), pour la même raison. La route Hono est toujours déployée dans `web`, avec `DATABASE_URL_PORTE` : elle reprend dès que le domaine revient. Aucun abonnement n'a changé. Le trou est le même qu'à l'aller.

### 13.6 Quand la route Hono s'éteint

Le chapitre 13 (15.6) laisse ce jour à ce chapitre. **Quatorze jours après la bascule, sans retour arrière** :

- retirer `DATABASE_URL_PORTE` et les `LEON_PORTE_SECRET_<OUTIL>` du service `web`. La route Hono répond alors 503 à toute livraison d'une adresse de bonne forme (`store: null`, chapitre 03, 6.2 ; le refus uniforme et l'écho ne changent pas) : elle n'en reçoit plus, sauf par l'adresse du site, qu'aucun éditeur ne connaît (chapitre 13, section 11). `web` rend ses 2 connexions de `portePool` ;
- garder `LEON_OAUTH_HUBSPOT_SECRET` sur `web` : le branchement OAuth s'en sert ;
- **garder le code** : `hono-gate.ts`, `verify.ts`, la réécriture de `next.config.ts` et leurs tests. `providers-json.ts` importe `PORTE_LIMITS` et `PORTE_KEPT_HEADERS` de `hono-gate.ts`, `hono-gate.test.ts` rejoue les cas `gate` de `vecteurs.json`, et la route Hono reste le retour arrière (remettre la variable, puis 13.5). `verify.ts` sert aussi la route des clics Slack (chapitre 07).

Supprimer la route Hono pour de bon demande de déplacer ces deux constantes et de garder un interprète TypeScript qui passe les vecteurs. Ce n'est pas à faire avant six mois de service Rust sans retour arrière (proposition).

## 14. Les autres candidats Rust : la mesure de chacun

Quatre pièces, toutes **après** le jalon 1. **Ce chapitre ne les fixe pas** : la ligne 15 du découpage (architecture, section 11) ne fixe que la porte, et leur verdict est celui de l'architecture (section 3), recopié en 3.4. Pour chacune : ce qui existe, la mesure qui rouvrirait la question, comment la prendre, ce qu'on essaie avant Rust, et le prix. Aucun code n'est à construire ici. Une première version de cette section donnait des esquisses de code, non compilées et écrites de mémoire ; elles sont retirées (relecture, section 19), pour qu'aucun agent ne les prenne pour un plan.

### 14.1 Un module `napi-rs` pour `maskSecrets` et `chunkText`

**Ce qui existe.** `maskSecrets` (`src/capture/mask-secrets.ts:188`, existe) masque les secrets reconnaissables à leur forme ; il est appelé pour chaque tour normalisé (`src/server/connectors/normalize.ts:322`, `:387`, existe), pour les documents, les rappels et la capture. `chunkText` (`src/server/search/chunk.ts:66`, existe) découpe un tour en passages de 1 000 à 1 600 caractères, appelé par l'indexation (`src/server/search/index-run.ts:66`, existe). Les deux sont purs : ni base, ni réseau. C'est le seul genre de code où un module natif peut gagner (note 02, 2.2).

**La mesure qui déclenche** (architecture, section 3) : un profil du worker qui montre plus de 20 % du temps processeur dans `normalizeItem` ou `chunkText` pendant une première relève, ou un incident de regex bloquante. Le second est peu probable : les motifs de `maskSecrets` sont écrits pour rester linéaires « même sur une entrée piégée » (en-tête de `mask-secrets.ts`, lignes 13 à 15, existe).

**Comment la prendre.** Sur un poste, avec une copie de base qui a une grosse connexion à relever (jamais la base de production) :

```bash
# Le worker seul, profilé par V8 ; un fichier .cpuprofile par processus à l'arrêt (Ctrl-C).
LEON_ROLE=worker NODE_OPTIONS='--cpu-prof --cpu-prof-dir=/tmp/profil-worker' pnpm start
# Puis : ouvrir le .cpuprofile dans l'onglet Performance de Chrome (chrome://inspect), trier par « Self time »,
# additionner maskSecrets, ses fonctions de remplacement, chunkText et stripHighlightMarks. Seuil : 20 % du total.
```

**Ce qu'on essaie avant Rust** : réordonner les motifs de `WHOLE_SECRETS` pour sortir plus tôt sur un texte sans chiffres ni tirets ; ne masquer que les tours nouveaux (l'empreinte du texte existe déjà, architecture 5) ; mettre la normalisation d'une page dans un `worker_threads`. Ces trois-là gardent une seule langue.

**Ce que ce serait**, si la mesure le demandait : une caisse `napi-rs` publiée comme paquet du dépôt, chargée par le serveur seulement, derrière une variable qui permet de la couper sans redéployer ; le TypeScript reste la référence et le repli (module absent : `maskSecrets` en TypeScript), et ses tests (`mask-secrets.test.ts`, `mask-secrets.audit6.test.ts`, `chunk.test.ts`) tournent contre les deux mises en œuvre. Trois pièges connus : la caisse `regex`, qui donne le temps linéaire qu'on viendrait chercher, n'a pas de lookbehind, que des motifs de `maskSecrets` emploient ; `chunkText` compte en unités UTF-16 (`text.slice`), Rust en octets UTF-8 ; `stripHighlightMarks` (`src/lib/highlight.ts`, existe) serait à porter aussi. Et autour : `serverExternalPackages` (`next.config.ts:13`, existe : `['officeparser', 'pdfjs-dist']`) gagne `@leon/natif` ; le traçage `standalone` de Next 16 a laissé des paquets externes de côté (tickets 88844 et 91654, note 02, 2.2 ; état en 16.4 non vérifié) ; un binaire par plateforme (Linux glibc pour Railway, macOS arm64 pour les postes) ; un plantage natif tue le processus Node entier. **Verdict : non maintenant.**

### 14.2 La relève des connecteurs

**Verdict de l'architecture** : non, aucune mesure réaliste. La relève attend le réseau et les limites de débit des éditeurs (HubSpot : 110 requêtes par 10 secondes, note 06), pas le processeur. Aucun concurrent ne l'écrit en Rust (Nango, Dust `connectors`, Pipedream : note 01).

**Ce que ce serait** : pas un module, une réécriture. Le contrat `Connector<Config>` (`src/server/connectors/types.ts:100-117`, existe) deviendrait un trait, et chacun des 42 connecteurs, avec son client, son schéma zod, sa pagination, son OAuth et ses tests de contrat (`vendor-specs`), serait à refaire ; puis `normalizeItem`, `maskSecrets`, `ingestConnectorItems`, `ensureFreshTokens` (verrou `renew_lock_at`), le déchiffrement par `LEON_CONNECTORS_KEY`, et la lecture des jobs `connector-sync` : pg-boss n'a pas de client Rust stable (note 02, 3.3).

**La mesure qui rouvrirait la question** : le worker saturé en processeur sur du décodage JSON, profil à l'appui (même commande qu'en 14.1 ; seuil : `JSON.parse` et la validation zod au-dessus de la moitié du temps pendant une relève). **Ce qu'on essaie avant** : des pages plus petites (`$top`, `limit`), ne demander que les champs lus, la validation zod sur les seuls champs utiles, un second worker (architecture, section 4 : « plusieurs instances », d'abord les gardes en base).

### 14.3 Le moteur de recherche

**Ce qui existe.** La recherche avec mots passe par le plein texte de Postgres (`websearch_to_tsquery`, `ts_rank_cd` : `src/server/search/search.ts:104`, `:382`, existe ; `searchPassages`, `:536`). Sous la sécurité par ligne, Postgres n'utilise pas l'index GIN (`@@` n'est pas « leakproof ») : chaque recherche lit tous les passages visibles de l'organisation (carte 06, coût de la recherche ; en-tête de `search.ts`).

**La mesure qui déclenche** : une recherche avec mots au-dessus d'une seconde au p95 sur le corpus d'un client, **après avoir épuisé Postgres**. Pour la prendre, une ligne de journal autour de `searchPassages` (`src/server/search/search.ts:536`, existe), au format `console.info('[leon]', 'recherche.duree', …)` : la durée, le nombre de mots et le nombre de sources rendues, jamais les mots cherchés ni les résultats. À écrire le jour où la question se pose.

**Ce qu'on essaie avant**, dans Postgres : une fonction `security definer` qui pose elle-même le filtre de droits (`acl && principals`, comme la politique `tenant_acl`) et laisse ainsi l'index GIN servir ; un index partiel par organisation pour les plus grosses ; `tsvector` précalculé (déjà en colonne `tsv`, carte 06). Chacune garde les droits dans Postgres, ce qui est la règle de l'architecture (section 2 : « La RLS porte les droits »).

**Si Postgres ne suffit plus** : acheter un moteur écrit en Rust (Meilisearch, Qdrant pour les vecteurs, turbopuffer), ne pas l'écrire (note 01). Le prix : une base de plus à opérer, une double écriture, et les droits à refaire hors RLS, filtre par filtre. Chaque passage y porterait sa liste de droits, et chaque requête devrait l'intersecter avec les principaux de la personne, sinon une recherche lit ce que la personne n'a pas le droit de voir : c'est là que tout le risque se loge. **Verdict : non.** Et si un jour oui, un service acheté.

### 14.4 L'exécution isolée en WebAssembly

**Le besoin** n'existe pas : une fiche d'agent est une donnée sans fonction (architecture, 8.5 et D6), et aucun agent n'exécute de code. Il naîtrait avec l'éditeur d'agents, si l'on décidait d'exécuter du code écrit par un client ou généré par un modèle.

**La mesure qui déclenche** : cette décision produit, écrite. Rien d'autre.

**Ce qu'on fait alors, d'abord** : acheter un bac à sable (conteneur ou microVM chez un fournisseur), plutôt que d'en écrire un (note 01, « Exécution isolée de code d'agent : Oui, mais à acheter »). Un module WebAssembly ne lance ni Python natif ni shell (note 02, 3.10).

**Si l'on tenait à le faire nous-mêmes** : un service séparé (un plantage reste isolé, comme la porte), appelé par le moteur sur le réseau privé de Railway, qui exécute un module sans aucun import (ni fichier, ni réseau, ni horloge), borné en mémoire, en instructions (le « carburant » de `wasmtime`) et en temps (l'interruption par époque). Ce que cela ne règle pas, et qui est le vrai travail : qui écrit le module (un modèle ? un client ?), comment il est relu, ce qu'il a le droit de lire de la mémoire de Leon (rien, sauf ce que le moteur lui passe en entrée, sous les droits de la personne), et comment sa sortie entre dans `needsClick` (comme un « texte libre », architecture 9.5). **Verdict : non avant l'éditeur d'agents, et alors acheter d'abord.**

## 15. Tests à écrire

### 15.1 La liste

Tous dans la caisse, lancés par `cargo test --locked` (job `porte`, section 11). Aucun ne demande de base ni de réseau ; ceux qui parlent de temps tournent sur l'horloge suspendue de `tokio` (`start_paused`) et restent instantanés. État au 20/11/2026, après la relecture : 35 passent, l'essai différentiel est lancé à la main (section 5.4).

| Test | Fichier | Ce qu'il prouve |
|---|---|---|
| `vecteurs_de_verification` | `src/tests.rs` | Les 22 cas `verification` de `vecteurs.json` : même verdict que `verify.ts` |
| `vecteurs_de_dechiffrement` | `src/tests.rs` | Les 2 cas `decryption` : le clair attendu, ou l'échec (même secret lu pour un autre abonnement) |
| `vecteurs_de_la_porte` | `src/tests.rs` | Les 11 cas `gate` : statut, corps exact, type de contenu, liste exacte des appels à `porte_deposer` |
| `fournisseurs_est_dans_la_version_connue` | `src/tests.rs` | `version` 1 lue ; une version 2, un champ inconnu dans une spec, ou dans la vérification de chaque outil (donc dans chaque mode du fichier), arrêtent le démarrage |
| `le_refus_attend_au_moins_200_ms` | `src/tests.rs` | Le refus uniforme attend `refusalMinDelayMs` (temps de `tokio` suspendu : le test reste instantané) |
| `le_cache_negatif_evite_une_seconde_lecture` | `src/tests.rs` | Trois livraisons vers une adresse inconnue : une seule lecture de `porte_secret` |
| `au_dela_de_la_limite_une_adresse_hors_cache_recoit_503` | `src/tests.rs` | 300 lectures vides depuis un même /64 ; la suivante, même vers un abonnement vivant, reçoit 503 sans lire la base ; une autre adresse IP lit toujours |
| `un_corps_trop_gros_recoit_413` | `src/tests.rs` | Un corps de `bodyMaxBytes` + 1 octets (bâti depuis `fournisseurs.json`, comme le demandait le chapitre 03, relecture « Code 6 ») : 413, aucune lecture |
| `un_corps_trop_gros_recoit_413_avant_l_adresse` | `src/tests.rs` | Sans `content-length`, vers un outil inconnu et pour un écho de validation : 413, comme le `bodyLimit` de Hono |
| `un_corps_interrompu_recoit_400_et_non_413` | `src/tests.rs` | Un corps dont la lecture échoue (client qui coupe) : 400, aucune lecture de base |
| `de_l_utf8_invalide_recoit_400` | `src/tests.rs` | Des octets qui ne sont pas de l'UTF-8 : 400 (l'octet nul est dans les vecteurs) |
| `l_echo_fait_1_024_caracteres_au_plus` | `src/tests.rs` | Un écho de 1 024 unités UTF-16 passe, un de 1 025 reçoit 400 (le caractère de contrôle est dans les vecteurs) |
| `le_cache_positif_expire_apres_60_s` | `src/tests.rs` | Un abonnement retiré de la base reste servi 59 s par le cache, puis est refusé à 61 s après une seconde lecture |
| `un_secret_illisible_est_un_refus_et_non_une_panne` | `src/tests.rs` | Un secret `v1:` indéchiffrable : refus uniforme (401), aucun dépôt |
| `un_compte_illisible_est_accepte_sans_depot` | `src/tests.rs` | Une livraison HubSpot signée sans `portalId` : 202, aucun dépôt (le cas « plusieurs comptes » est dans les vecteurs) |
| `une_base_lente_recoit_503_en_2_s` | `src/tests.rs` | Une base qui ne répond plus : 503 au bout de 2 s exactement |
| `une_requete_ne_dure_jamais_plus_de_3_s` | `src/tests.rs` | Deux appels de 1,6 s chacun : 503 au bout de 3 s (`porte.delai`), aucun dépôt |
| `une_panne_de_base_n_est_pas_un_refus` | `src/tests.rs` | Base en panne : 503, jamais 401 |
| `sans_leon_porte_url_une_signature_sur_l_adresse_recoit_503` | `src/tests.rs` | HubSpot sans `LEON_PORTE_URL` : 503 |
| `le_bilan_de_sante_attend_la_premiere_lecture_de_la_base` | `src/tests.rs` | `/sante` : 503 `{"ok":false}` sans lire la base ; base injoignable, une lecture par seconde et toujours 503 ; base revenue, 200 `{"ok":true}` ; puis panne en régime, toujours 200, sans lecture |
| `sentry_recoit_un_envoi_par_minute_et_par_evenement` | `src/tests.rs` | Un envoi, 59 tus, puis un envoi qui les compte ; un autre événement a sa propre fenêtre |
| `sentry_ne_recoit_aucun_texte_recu` | `src/tests.rs` | Une panique qui citerait un corps sort masquée, sans requête ni extra ; un message de `log_error` garde son texte et ses seuls identifiants |
| `cle_d_adresse_ip` | `src/tests.rs` | Les cas de `ipKey` du chapitre 03 (13.3), plus `::ffff:` en hexadécimal et une zone |
| `les_secrets_d_application_sont_les_seuls_lus` | `src/tests.rs` | Seules les variables nommées par `fournisseurs.json` sont lues ; `LEON_CONNECTORS_KEY` ne l'est jamais ; une `LEON_PORTE_KEY` mal formée arrête le démarrage |
| `differentiel_avec_verify_ts` | `src/tests.rs`, ignoré par défaut | L'essai différentiel (15.3) |
| `vecteurs_de_dechiffrement` (suite) | `src/tests.rs` | La même clé en base64url sans remplissage, le même secret réécrit en base64 standard avec remplissage : même résultat, comme sous Node |
| `base64_tolere_les_bits_de_fin_comme_node`, `pointeur_avec_etoile_et_entiers_surs`, `formulaire_payload`, `une_moitie_de_paire_seule_devient_u_fffd_comme_dans_node` | `src/verifier.rs` | Les endroits où Rust et Node diffèrent d'habitude |
| `chaque_mode_refuse_un_champ_inconnu` | `src/verifier.rs` | Les quatre modes, le morceau signé littéral et le secret : un champ de plus est refusé |
| `la_cle_fait_32_octets`, `la_cle_se_lit_dans_les_deux_alphabets_comme_node`, `un_format_inconnu_est_illisible` | `src/secret.rs` | Le format `v1:` et la clé, dans les deux alphabets ; un caractère hors alphabet est refusé |
| `memo_expire_et_evince_la_plus_ancienne`, `la_fenetre_ne_se_prolonge_pas`, `une_erreur_de_base_ne_garde_aucun_message` | `src/depot.rs` | Les caches comme `Memo` et `Counters` ; aucun message de Postgres au journal |

Nommage : en français, en phrase, comme les titres de tests du dépôt (`it('…')`) ; les fonctions de test Rust ne peuvent pas porter d'espaces ni d'apostrophes, d'où les tirets bas.

Des tests **à ajouter côté TypeScript**, dans la PR de la section 4 : la ligne `porte.reponse` de `hono-gate.ts`, pour une réponse 202, 413 et 500 (section 4.1).

### 15.2 `src/tests.rs` (à créer), en entier

Rattaché par `#[cfg(test)] mod tests;` dans `main.rs` : il ne compile qu'en test. Il lit `vecteurs.json` par `include_str!`, au chemin où le chapitre 03 le génère.

```rust
// Les cas de services/porte/vecteurs.json, rejoués par le service Rust : les mêmes que verify.test.ts et
// hono-gate.test.ts (chapitre 03, section 13). Un verdict qui change ici change aussi en TypeScript, ou l'une des deux
// mises en œuvre a tort. Puis ce que les vecteurs ne mesurent pas : le délai du refus, la limite par adresse IP, les
// caches, la taille et la lecture du corps, une base en panne ou lente, le bilan de santé, ce qui part vers Sentry.
//
// Le fichier est généré par `pnpm porte:generer` (src/server/webhooks/providers-json.ts) ; Exemple fictif : ses
// secrets, clés, identifiants et corps sont inventés.

use std::collections::BTreeMap;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::task::{Context, Poll};
use std::time::Duration;

use axum::body::{Body, Bytes, HttpBody, to_bytes};
use axum::http::{Request as HttpRequest, StatusCode};
use axum::response::Response;
use base64::Engine as _;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;
use tower::ServiceExt;

use crate::depot::{Deposit, PorteStore, StoreError, SubscriptionRow};
use crate::secret::{open_subscription_secret, parse_porte_key};
use crate::verifier::{BodyFormat, VerifyInput, WebhookVerification, verify_webhook};
use crate::{
    Clock, PROVIDERS_JSON, Porte, Providers, SentryThrottle, ip_key, load_providers,
    porte_settings, router, scrub_event,
};

const VECTORS_JSON: &str = include_str!("../vecteurs.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vectors {
    version: u64,
    #[serde(rename = "generatedBy")]
    _generated_by: String,
    verification: Vec<VerificationCase>,
    decryption: Vec<DecryptionCase>,
    gate: Gate,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerificationCase {
    name: String,
    verification: WebhookVerification,
    body_format: BodyFormat,
    secret: String,
    method: String,
    uri: String,
    headers: BTreeMap<String, String>,
    body: String,
    now: i64,
    expected: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecryptionCase {
    name: String,
    key: String,
    aad: String,
    stored: String,
    plain: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Gate {
    env: BTreeMap<String, String>,
    store: GateStore,
    cases: Vec<GateCase>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateStore {
    subscriptions: Vec<StoredSubscription>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredSubscription {
    outil: String,
    id: String,
    tenant_id: String,
    stored: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateCase {
    name: String,
    env: Option<BTreeMap<String, String>>,
    request: GateRequest,
    now: i64,
    expected: GateExpected,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateRequest {
    method: String,
    path: String,
    query: String,
    headers: BTreeMap<String, String>,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GateExpected {
    status: u16,
    content_type: Option<String>,
    body: String,
    deposits: Vec<Value>,
}

fn vectors() -> Vectors {
    serde_json::from_str(VECTORS_JSON).expect("vecteurs.json illisible")
}

fn providers() -> Providers {
    load_providers(PROVIDERS_JSON).expect("fournisseurs.json illisible")
}

// La fausse base des vecteurs : porte_secret lit store.subscriptions, porte_deposer note ses arguments et rend 1.
// `broken` : chaque appel échoue tout de suite. `delay` : chaque appel attend d'abord (une base lente).
#[derive(Default)]
struct FakeStore {
    subscriptions: StdMutex<Vec<StoredSubscription>>,
    deposits: StdMutex<Vec<Deposit>>,
    lookups: AtomicUsize,
    broken: AtomicBool,
    delay: Duration,
}

impl FakeStore {
    fn with(subscriptions: &[StoredSubscription]) -> Self {
        Self {
            subscriptions: StdMutex::new(subscriptions.to_vec()),
            ..Default::default()
        }
    }

    async fn call(&self) -> Result<(), StoreError> {
        if !self.delay.is_zero() {
            tokio::time::sleep(self.delay).await;
        }
        if self.broken.load(Ordering::SeqCst) {
            return Err(StoreError("PoolTimedOut".into()));
        }
        Ok(())
    }
}

impl PorteStore for Arc<FakeStore> {
    async fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> Result<Option<SubscriptionRow>, StoreError> {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        self.call().await?;
        Ok(self
            .subscriptions
            .lock()
            .unwrap()
            .iter()
            .find(|row| row.outil == outil && row.id == abonnement)
            .map(|row| SubscriptionRow {
                tenant_id: row.tenant_id.clone(),
                secret: row.stored.clone(),
            }))
    }

    async fn deposit(&self, deposit: &Deposit) -> Result<i32, StoreError> {
        self.call().await?;
        self.deposits.lock().unwrap().push(deposit.clone());
        Ok(1)
    }
}

fn porte_with_clock(
    env: &BTreeMap<String, String>,
    store: Arc<FakeStore>,
    clock: Clock,
) -> Arc<Porte<Arc<FakeStore>>> {
    let providers = providers();
    let settings = porte_settings(&providers, |name| env.get(name).cloned()).expect("réglages");
    Arc::new(Porte::new(providers, settings, store, clock))
}

fn porte_with(
    env: &BTreeMap<String, String>,
    store: Arc<FakeStore>,
    now: i64,
) -> Arc<Porte<Arc<FakeStore>>> {
    porte_with_clock(env, store, Box::new(move || now))
}

async fn send(porte: &Arc<Porte<Arc<FakeStore>>>, request: HttpRequest<Body>) -> Response {
    router(porte.clone()).oneshot(request).await.unwrap()
}

async fn body_text(response: Response) -> String {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    String::from_utf8_lossy(&body).into_owned()
}

fn request(
    method: &str,
    path: &str,
    query: &str,
    headers: &BTreeMap<String, String>,
    body: Vec<u8>,
) -> HttpRequest<Body> {
    let uri = if query.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{query}")
    };
    let mut builder = HttpRequest::builder().method(method).uri(uri);
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder.body(Body::from(body)).unwrap()
}

#[test]
fn fournisseurs_est_dans_la_version_connue() {
    let providers = providers();
    assert_eq!(providers.version, 1);
    assert!(providers.tools.contains_key("outlook"));
    assert!(load_providers(&PROVIDERS_JSON.replace("\"version\": 1", "\"version\": 2")).is_err());
    // Un champ inconnu (un mode, une étape de plus) arrête le démarrage : il faut changer le Rust d'abord.
    assert!(
        load_providers(
            &PROVIDERS_JSON.replace("\"lifecycle\": true", "\"lifecycle\": true, \"neuf\": 1")
        )
        .is_err()
    );
    // De même un champ de plus dans la vérification de chaque outil, donc dans chaque mode que le fichier emploie
    // (jeton, hmac-sha256, standard-webhooks).
    let file: Value = serde_json::from_str(PROVIDERS_JSON).unwrap();
    for tool in file["tools"].as_object().unwrap().keys() {
        let mut changed = file.clone();
        changed["tools"][tool]["verification"]["inconnu"] = 1.into();
        assert!(load_providers(&changed.to_string()).is_err(), "{tool}");
    }
}

#[test]
fn vecteurs_de_verification() {
    let vectors = vectors();
    assert_eq!(vectors.version, 1);
    assert!(!vectors.verification.is_empty());
    for case in &vectors.verification {
        let verdict = verify_webhook(&VerifyInput {
            verification: &case.verification,
            body_format: case.body_format,
            secret: &case.secret,
            method: &case.method,
            uri: &case.uri,
            headers: &case.headers,
            body: case.body.as_bytes(),
            now_ms: case.now,
        });
        let got = match verdict {
            Ok(()) => "ok",
            Err(reason) => reason.as_str(),
        };
        assert_eq!(got, case.expected, "{}", case.name);
    }
}

// Les trois parties de `v1:` réécrites dans l'autre alphabet, avec remplissage : Buffer.from(…, 'base64url') de Node
// les lit pareil.
fn in_standard_alphabet(stored: &str) -> String {
    let parts: Vec<String> = stored
        .split(':')
        .enumerate()
        .map(|(index, part)| {
            if index == 0 {
                return part.to_string();
            }
            let mut part = part.replace('-', "+").replace('_', "/");
            while part.len() % 4 != 0 {
                part.push('=');
            }
            part
        })
        .collect();
    parts.join(":")
}

#[test]
fn vecteurs_de_dechiffrement() {
    for case in vectors().decryption {
        let key = parse_porte_key(&case.key).expect("clé de 32 octets");
        let got = open_subscription_secret(&case.stored, &case.aad, &key).ok();
        assert_eq!(got, case.plain, "{}", case.name);
        // La même clé écrite en base64url sans remplissage, le même secret écrit en base64 standard : même résultat.
        let url_key = case.key.replace('+', "-").replace('/', "_");
        let url_key = parse_porte_key(url_key.trim_end_matches('='));
        assert_eq!(url_key, Some(key), "{}", case.name);
        let standard = in_standard_alphabet(&case.stored);
        assert_ne!(standard, case.stored);
        let got = open_subscription_secret(&standard, &case.aad, &key).ok();
        assert_eq!(got, case.plain, "{} (alphabet standard)", case.name);
    }
}

#[tokio::test(start_paused = true)]
async fn vecteurs_de_la_porte() {
    let vectors = vectors();
    assert!(!vectors.gate.cases.is_empty());
    for case in &vectors.gate.cases {
        let mut env = vectors.gate.env.clone();
        env.extend(case.env.clone().unwrap_or_default());
        let store = Arc::new(FakeStore::with(&vectors.gate.store.subscriptions));
        let porte = porte_with(&env, store.clone(), case.now);
        let r = &case.request;
        let response = router(porte)
            .oneshot(request(
                &r.method,
                &r.path,
                &r.query,
                &r.headers,
                r.body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(
            response.status().as_u16(),
            case.expected.status,
            "{}",
            case.name
        );
        if let Some(content_type) = &case.expected.content_type {
            assert_eq!(
                response.headers()["content-type"],
                content_type.as_str(),
                "{}",
                case.name
            );
        }
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            String::from_utf8_lossy(&body),
            case.expected.body,
            "{}",
            case.name
        );
        let deposits: Vec<Value> = store
            .deposits
            .lock()
            .unwrap()
            .iter()
            .map(|deposit| serde_json::to_value(deposit).unwrap())
            .collect();
        assert_eq!(deposits, case.expected.deposits, "{}", case.name);
    }
}

fn outlook_delivery() -> (BTreeMap<String, String>, Arc<FakeStore>, String, String) {
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name == "outlook : livraison juste")
        .unwrap();
    let store = Arc::new(FakeStore::with(&vectors.gate.store.subscriptions));
    (
        vectors.gate.env.clone(),
        store,
        case.request.path.clone(),
        case.request.body.clone(),
    )
}

#[tokio::test(start_paused = true)]
async fn le_refus_attend_au_moins_200_ms() {
    let (env, store, _, body) = outlook_delivery();
    let porte = porte_with(&env, store, 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let unknown = "/h/outlook/00000000-0000-4000-8000-000000000000";
    let response = router(porte)
        .oneshot(request(
            "POST",
            unknown,
            "",
            &BTreeMap::new(),
            body.into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(started.elapsed() >= std::time::Duration::from_millis(200));
}

#[tokio::test(start_paused = true)]
async fn le_cache_negatif_evite_une_seconde_lecture() {
    let (env, store, _, body) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let unknown = "/h/outlook/00000000-0000-4000-8000-000000000000";
    for _ in 0..3 {
        let response = router(porte.clone())
            .oneshot(request(
                "POST",
                unknown,
                "",
                &BTreeMap::new(),
                body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    assert_eq!(store.lookups.load(Ordering::SeqCst), 1);
}

#[tokio::test(start_paused = true)]
async fn au_dela_de_la_limite_une_adresse_hors_cache_recoit_503() {
    let (mut env, store, path, body) = outlook_delivery();
    env.insert("LEON_IP_HEADER".into(), "x-real-ip".into());
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let cap = providers().limits.lookup_misses_per_ip;
    // Deux adresses du même /64 comptent ensemble.
    for index in 0..cap {
        let headers = BTreeMap::from([(
            "x-real-ip".to_string(),
            format!("2001:db8:1:2::{:x}", index % 2 + 1),
        )]);
        let unknown = format!("/h/outlook/00000000-0000-4000-8000-{index:012x}");
        let response = router(porte.clone())
            .oneshot(request(
                "POST",
                &unknown,
                "",
                &headers,
                body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let headers = BTreeMap::from([("x-real-ip".to_string(), "2001:db8:1:2::9".to_string())]);
    // Même un abonnement vivant, hors cache, reçoit 503 : l'éditeur rejouera, la base n'est plus lue.
    let response = router(porte.clone())
        .oneshot(request(
            "POST",
            &path,
            "",
            &headers,
            body.clone().into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(store.lookups.load(Ordering::SeqCst), cap as usize);
    // Une autre adresse IP lit toujours la base.
    let other = BTreeMap::from([("x-real-ip".to_string(), "203.0.113.7".to_string())]);
    let response = router(porte)
        .oneshot(request("POST", &path, "", &other, body.into_bytes()))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
}

#[tokio::test(start_paused = true)]
async fn un_corps_trop_gros_recoit_413() {
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let size = providers().limits.body_max_bytes + 1;
    let response = router(porte)
        .oneshot(request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            vec![b'a'; size],
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn un_corps_trop_gros_recoit_413_avant_l_adresse() {
    // Comme le bodyLimit de hono-gate.ts, qui lit un corps sans content-length avant toute autre étape : même vers un
    // outil inconnu, même pour un écho de validation.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let size = providers().limits.body_max_bytes + 1;
    for (path, query) in [("/h/inconnu", ""), (path.as_str(), "validationToken=x")] {
        let big = request("POST", path, query, &BTreeMap::new(), vec![b'a'; size]);
        assert!(!big.headers().contains_key("content-length"));
        let response = send(&porte, big).await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE, "{path}");
        assert_eq!(
            body_text(response).await,
            r#"{"error":"Request too large"}"#
        );
    }
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

// Un corps qui échoue au milieu de sa lecture : un client qui coupe la connexion.
struct CutBody;

impl HttpBody for CutBody {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        _: &mut Context<'_>,
    ) -> Poll<Option<Result<http_body::Frame<Bytes>, std::io::Error>>> {
        Poll::Ready(Some(Err(std::io::Error::other("connexion coupée"))))
    }
}

#[tokio::test(start_paused = true)]
async fn un_corps_interrompu_recoit_400_et_non_413() {
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let cut = HttpRequest::post(path).body(Body::new(CutBody)).unwrap();
    let response = send(&porte, cut).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn de_l_utf8_invalide_recoit_400() {
    // L'octet nul est dans les vecteurs (cas « octet nul dans le corps ») ; un octet invalide ne peut pas y être.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let invalid = request(
        "POST",
        &path,
        "",
        &BTreeMap::new(),
        vec![b'{', 0xff, 0xfe, b'}'],
    );
    let response = send(&porte, invalid).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_text(response).await, r#"{"error":"Invalid request"}"#);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn l_echo_fait_1_024_caracteres_au_plus() {
    // Le caractère de contrôle est dans les vecteurs ; la longueur, comptée en unités UTF-16 comme en JavaScript.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let max = providers().limits.echo_max_chars;
    let fits = format!("validationToken={}", "é".repeat(max));
    let response = send(
        &porte,
        request("POST", &path, &fits, &BTreeMap::new(), vec![]),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_text(response).await.chars().count(), max);
    let too_long = format!("validationToken={}", "a".repeat(max + 1));
    let response = send(
        &porte,
        request("POST", &path, &too_long, &BTreeMap::new(), vec![]),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn le_cache_positif_expire_apres_60_s() {
    // Un abonnement résilié (ou une personne partie) cesse d'être servi au plus 60 s après : porte_secret est relu.
    let (env, store, path, body) = outlook_delivery();
    let now = Arc::new(AtomicI64::new(1_795_165_200_000));
    let clock = now.clone();
    let porte = porte_with_clock(
        &env,
        store.clone(),
        Box::new(move || clock.load(Ordering::SeqCst)),
    );
    let deliver = || {
        request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            body.clone().into_bytes(),
        )
    };
    assert_eq!(send(&porte, deliver()).await.status(), StatusCode::ACCEPTED);
    store.subscriptions.lock().unwrap().clear();
    now.fetch_add(59_000, Ordering::SeqCst);
    assert_eq!(send(&porte, deliver()).await.status(), StatusCode::ACCEPTED);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 1);
    now.fetch_add(2_000, Ordering::SeqCst);
    assert_eq!(
        send(&porte, deliver()).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(store.lookups.load(Ordering::SeqCst), 2);
}

#[tokio::test(start_paused = true)]
async fn un_secret_illisible_est_un_refus_et_non_une_panne() {
    let (env, _, path, body) = outlook_delivery();
    let mut subscriptions = vectors().gate.store.subscriptions;
    for row in &mut subscriptions {
        row.stored = Some("v1:AQEBAQEBAQEBAQEB:AAAA:AAAA".into());
    }
    let store = Arc::new(FakeStore::with(&subscriptions));
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn un_compte_illisible_est_accepte_sans_depot() {
    // Signé par HubSpot, mais sans portalId : rien à ranger. 202, comme la route Hono (chapitre 03, 6.1, étape 9) ;
    // le cas « plusieurs comptes » est dans les vecteurs.
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name.starts_with("hubspot : livraison juste"))
        .unwrap();
    let secret = &vectors.gate.env["LEON_OAUTH_HUBSPOT_SECRET"];
    let body = r#"[{"eventId":1001,"objectId":3001}]"#;
    let stamp = &case.request.headers["x-hubspot-request-timestamp"];
    let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(
        format!(
            "POST{}/h/hubspot{body}{stamp}",
            vectors.gate.env["LEON_PORTE_URL"]
        )
        .as_bytes(),
    );
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let mut headers = case.request.headers.clone();
    headers.insert("x-hubspot-signature-v3".into(), signature);
    let store = Arc::new(FakeStore::default());
    let porte = porte_with(&vectors.gate.env, store.clone(), case.now);
    let response = send(
        &porte,
        request("POST", "/h/hubspot", "", &headers, body.into()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn une_base_lente_recoit_503_en_2_s() {
    // Une base qui ne répond plus : 503 au bout de DB_CALL_TIMEOUT, pas au bout du délai de l'éditeur.
    let (env, _, path, body) = outlook_delivery();
    let mut store = FakeStore::with(&vectors().gate.store.subscriptions);
    store.delay = Duration::from_secs(60);
    let porte = porte_with(&env, Arc::new(store), 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(started.elapsed(), Duration::from_secs(2));
}

#[tokio::test(start_paused = true)]
async fn une_requete_ne_dure_jamais_plus_de_3_s() {
    // Deux appels de 1,6 s chacun, sous la limite d'un appel : c'est le délai de la requête qui coupe (porte.delai).
    let (env, _, path, body) = outlook_delivery();
    let mut store = FakeStore::with(&vectors().gate.store.subscriptions);
    store.delay = Duration::from_millis(1_600);
    let store = Arc::new(store);
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body_text(response).await, r#"{"error":"Unavailable"}"#);
    assert_eq!(started.elapsed(), Duration::from_secs(3));
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn une_panne_de_base_n_est_pas_un_refus() {
    let (env, _, path, body) = outlook_delivery();
    let store = Arc::new(FakeStore {
        broken: AtomicBool::new(true),
        ..Default::default()
    });
    let porte = porte_with(&env, store, 1_795_165_200_000);
    let response = router(porte)
        .oneshot(request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            body.into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test(start_paused = true)]
async fn sans_leon_porte_url_une_signature_sur_l_adresse_recoit_503() {
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name.starts_with("hubspot : livraison juste"))
        .unwrap();
    let mut env = vectors.gate.env.clone();
    env.remove("LEON_PORTE_URL");
    let porte = porte_with(&env, Arc::new(FakeStore::default()), case.now);
    let r = &case.request;
    let response = router(porte)
        .oneshot(request(
            "POST",
            &r.path,
            "",
            &r.headers,
            r.body.clone().into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test(start_paused = true)]
async fn le_bilan_de_sante_attend_la_premiere_lecture_de_la_base() {
    let store = Arc::new(FakeStore {
        broken: AtomicBool::new(true),
        ..Default::default()
    });
    let porte = porte_with(&BTreeMap::new(), store.clone(), 0);
    let sante = || HttpRequest::get("/sante").body(Body::empty()).unwrap();
    // Avant toute lecture réussie : 503. /sante elle-même ne lit jamais la base.
    let response = send(&porte, sante()).await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body_text(response).await, r#"{"ok":false}"#);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
    // Base injoignable (mauvais mot de passe, certificat absent…) : une lecture par seconde, /sante reste à 503, et
    // Railway garde l'ancienne version.
    let waiting = tokio::spawn({
        let porte = porte.clone();
        async move { porte.wait_for_base().await }
    });
    tokio::time::sleep(Duration::from_millis(3_500)).await;
    assert!(!porte.is_ready());
    assert_eq!(store.lookups.load(Ordering::SeqCst), 4);
    assert_eq!(
        send(&porte, sante()).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    // La base répond : /sante passe à 200.
    store.broken.store(false, Ordering::SeqCst);
    waiting.await.unwrap();
    let response = send(&porte, sante()).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_text(response).await, r#"{"ok":true}"#);
    // Puis une panne en régime : /sante reste à 200, sans lire la base. Les livraisons reçoivent 503.
    store.broken.store(true, Ordering::SeqCst);
    let lookups = store.lookups.load(Ordering::SeqCst);
    assert_eq!(send(&porte, sante()).await.status(), StatusCode::OK);
    assert_eq!(store.lookups.load(Ordering::SeqCst), lookups);
}

#[test]
fn sentry_recoit_un_envoi_par_minute_et_par_evenement() {
    let mut throttle = SentryThrottle::new();
    let start = std::time::Instant::now();
    let at = |seconds: u64| start + Duration::from_secs(seconds);
    assert_eq!(throttle.admit("porte.base", at(0)), Some(0));
    for second in 1..60 {
        assert_eq!(throttle.admit("porte.base", at(second)), None);
    }
    // Un autre événement a sa propre fenêtre : une panne de base ne tait pas une clé illisible.
    assert_eq!(throttle.admit("porte.secret_illisible", at(30)), Some(0));
    // La minute passée : un envoi, qui compte les 59 tus.
    assert_eq!(throttle.admit("porte.base", at(60)), Some(59));
    assert_eq!(throttle.admit("porte.base", at(61)), None);
}

#[test]
fn sentry_ne_recoit_aucun_texte_recu() {
    use sentry::protocol::{Event, Exception};
    let body = r#"{"value":[{"clientState":"exemple-fictif"}]}"#;
    // Une panique dont le message citerait le corps : masquée, comme tout ce qui ne vient pas de log_error.
    let mut panic = Event {
        message: Some(format!("byte index 3 is out of bounds of `{body}`")),
        request: Some(Default::default()),
        ..Default::default()
    };
    panic.exception.values.push(Exception {
        ty: "panic".into(),
        value: Some(body.into()),
        ..Default::default()
    });
    panic.extra.insert("corps".into(), body.into());
    let scrubbed = scrub_event(panic);
    assert!(
        !serde_json::to_string(&scrubbed)
            .unwrap()
            .contains("clientState")
    );
    assert_eq!(scrubbed.message.as_deref(), Some("[masqué]"));
    assert!(scrubbed.request.is_none());
    // Un message de log_error (étiquette `event`) : gardé, avec ses seuls identifiants.
    let mut ours = Event {
        message: Some("porte.base: PoolTimedOut".into()),
        ..Default::default()
    };
    ours.tags.insert("event".into(), "porte.base".into());
    ours.extra.insert("outil".into(), "outlook".into());
    ours.extra.insert("corps".into(), body.into());
    let kept = scrub_event(ours);
    assert_eq!(kept.message.as_deref(), Some("porte.base: PoolTimedOut"));
    assert_eq!(kept.extra.keys().collect::<Vec<_>>(), ["outil"]);
}

#[test]
fn cle_d_adresse_ip() {
    // Les cas de hono-gate.test.ts (chapitre 03, 13.3), et ceux qui départagent les deux mises en œuvre.
    assert_eq!(
        ip_key("2001:db8:1:2:aaaa::1").as_deref(),
        Some("2001:db8:1:2::/64")
    );
    assert_eq!(
        ip_key("2001:0DB8:0001:0002:bbbb:cccc:dddd:eeee").as_deref(),
        Some("2001:db8:1:2::/64")
    );
    assert_ne!(ip_key("2001:db8:1:3::1"), ip_key("2001:db8:1:2::1"));
    assert_ne!(ip_key("203.0.113.7"), ip_key("203.0.113.8"));
    assert_eq!(ip_key("::ffff:203.0.113.7").as_deref(), Some("203.0.113.7"));
    assert_eq!(
        ip_key("0:0:0:0:0:ffff:203.0.113.7").as_deref(),
        Some("203.0.113.7")
    );
    assert_eq!(ip_key("fe80::1%eth0").as_deref(), Some("fe80:0:0:0::/64"));
    // Écrite en hexadécimal, une IPv4 dans une IPv6 reste une IPv6 pour ipKey : même choix ici.
    assert_eq!(ip_key("::ffff:cb00:7107").as_deref(), Some("0:0:0:0::/64"));
    assert_eq!(ip_key("pas une adresse"), None);
    assert_eq!(ip_key("01.2.3.4"), None);
}

#[test]
fn les_secrets_d_application_sont_les_seuls_lus() {
    let providers = providers();
    let env = BTreeMap::from([
        ("LEON_OAUTH_HUBSPOT_SECRET".to_string(), "s".to_string()),
        ("LEON_CONNECTORS_KEY".to_string(), "jamais lue".to_string()),
    ]);
    let settings = porte_settings(&providers, |name| env.get(name).cloned()).unwrap();
    assert_eq!(
        settings.app_secrets.keys().collect::<Vec<_>>(),
        ["LEON_OAUTH_HUBSPOT_SECRET"]
    );
    let bad = BTreeMap::from([("LEON_PORTE_KEY".to_string(), "trop court".to_string())]);
    assert!(porte_settings(&providers, |name| bad.get(name).cloned()).is_err());
}

// Essai différentiel, hors CI : des cas tirés autour des vecteurs par un script Node, jugés par verify.ts, dans le
// format de la section « verification » (chapitre 15, section 15.3). Les cas nommés « écart connu » sont ceux où
// serde_json refuse ce que JSON.parse accepte : ils doivent diverger, et seulement eux.
#[derive(Deserialize)]
struct Differential {
    verification: Vec<VerificationCase>,
}

#[test]
#[ignore = "à la main : PORTE_DIFFERENTIEL=<cas.json> cargo test -- --ignored"]
fn differentiel_avec_verify_ts() {
    let path =
        std::env::var("PORTE_DIFFERENTIEL").expect("PORTE_DIFFERENTIEL : le fichier des cas");
    let cases: Differential =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut differ = Vec::new();
    for case in &cases.verification {
        let verdict = verify_webhook(&VerifyInput {
            verification: &case.verification,
            body_format: case.body_format,
            secret: &case.secret,
            method: &case.method,
            uri: &case.uri,
            headers: &case.headers,
            body: case.body.as_bytes(),
            now_ms: case.now,
        });
        let got = verdict.map_or_else(|reason| reason.as_str(), |()| "ok");
        if got != case.expected {
            differ.push(format!(
                "{} : Rust {got}, TypeScript {}",
                case.name, case.expected
            ));
        }
    }
    let unexpected: Vec<&String> = differ
        .iter()
        .filter(|line| !line.starts_with("écart connu"))
        .collect();
    println!(
        "{} cas, {} divergences : {differ:#?}",
        cases.verification.len(),
        differ.len()
    );
    assert!(unexpected.is_empty(), "{unexpected:#?}");
}
```

### 15.3 L'essai différentiel

Les vecteurs couvrent 35 cas choisis. Pour chercher ce qu'ils ne couvrent pas, un script Node tire 425 cas autour d'eux (un caractère du corps ou d'un en-tête changé, l'heure décalée, le secret raccourci, puis des bords : moitiés de paires UTF-16, nombres, clés en double, BOM, horodatages à la milliseconde près de la tolérance, bits de fin d'une signature base64, entrées de `webhook-signature` vides ou inconnues), les fait juger par le `verify.ts` du chapitre 03 (section 4.3, recopié tel quel), et écrit le verdict attendu. Le test ignoré `differentiel_avec_verify_ts` les rejoue en Rust.

Le script, tel qu'il a tourné (Node 22.23, `--experimental-strip-types`, `verify.ts` du chapitre 03 avec ses types remplacés par un bouchon). Exemple fictif : secrets et corps inventés.

```ts
// Essai différentiel : des cas tirés autour des vecteurs, jugés par verify.ts (chapitre 03). Le service Rust doit
// rendre le même verdict (test ignoré differentiel_avec_verify_ts). Exemple fictif : secrets et corps inventés.
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyWebhook } from './verify.ts';

const v = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out: any[] = [];
let seed = 42;
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const judge = (c: any) => {
  const got = verifyWebhook({ verification: c.verification, bodyFormat: c.bodyFormat, secret: c.secret, method: c.method,
    uri: c.uri, headers: c.headers, body: Buffer.from(c.body, 'utf8'), nowMs: c.now });
  out.push({ ...c, expected: got.ok ? 'ok' : got.reason });
};
const byName = (n: string) => structuredClone(v.verification.find((c: any) => c.name.startsWith(n)));

// 1. Mutations au hasard : un caractère du corps, d'un en-tête, de l'heure.
for (let i = 0; i < 400; i++) {
  const c = structuredClone(v.verification[rand(v.verification.length)]);
  const what = rand(4);
  if (what === 0 && c.body.length > 0) { const at = rand(c.body.length); c.body = c.body.slice(0, at) + String.fromCharCode(32 + rand(95)) + c.body.slice(at + 1); }
  if (what === 1) { const names = Object.keys(c.headers); const n = names[rand(names.length)]; if (n) { const val = c.headers[n]; const at = rand(val.length || 1); c.headers[n] = val.slice(0, at) + 'Az09+/=,'[rand(8)] + val.slice(at + 1); } }
  if (what === 2) c.now += (rand(2) ? 1 : -1) * rand(700_000);
  if (what === 3) c.secret = c.secret.slice(0, Math.max(0, c.secret.length - rand(3)));
  c.name = `hasard ${i} (${c.name})`;
  judge(c);
}
// 2. Les bords.
const o = byName('outlook : clientState juste');
const s = o.secret;
for (const [name, body] of [
  ['jeton : moitié de paire seule ailleurs', `{"value":[{"clientState":"${s}","x":"\\ud800"}]}`],
  ['jeton : moitié de paire seule dans le jeton', `{"value":[{"clientState":"${s}\\udc00"}]}`],
  ['jeton : paire complète', `{"value":[{"clientState":"${s}","x":"\\ud83d\\ude00"}]}`],
  ['jeton : nombre au lieu du texte', `{"value":[{"clientState":12345678}]}`],
  ['jeton : nombre flottant entier', `{"value":[{"clientState":12345678.0}]}`],
  ['jeton : clé en double, la dernière gagne', `{"value":[{"clientState":"faux","clientState":"${s}"}]}`],
  ['jeton : value n est pas un tableau', `{"value":{"clientState":"${s}"}}`],
  ['jeton : BOM en tête', `﻿{"value":[{"clientState":"${s}"}]}`],
  ['écart connu : nombre hors des f64', `{"value":[{"clientState":"${s}"}],"n":1e400}`],
  ['écart connu : 129 niveaux', `{"value":[{"clientState":"${s}"}],"n":${'['.repeat(129)}${']'.repeat(129)}}`],
] as const) judge({ ...o, name, body, secret: name.includes('nombre au') || name.includes('flottant') ? '12345678' : s });
const h = byName('hubspot : méthode');
const sign = (c: any) => createHmac('sha256', c.secret).update(c.method + c.uri + c.body + c.headers['x-hubspot-request-timestamp']).digest('base64');
for (const delta of [-300_000, -300_001, 300_000, 300_001, 0]) {
  const c = structuredClone(h); c.headers['x-hubspot-request-timestamp'] = String(c.now + delta); c.headers['x-hubspot-signature-v3'] = sign(c);
  c.name = `hubspot : écart de ${delta} ms`; judge(c);
}
{ const c = structuredClone(h); const sig = c.headers['x-hubspot-signature-v3']; const last = sig[42];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  c.headers['x-hubspot-signature-v3'] = sig.slice(0, 42) + alphabet[(alphabet.indexOf(last) ^ 1)] + '=';
  c.name = 'hubspot : bits de fin non nuls dans la signature'; judge(c); }
{ const c = structuredClone(h); c.headers['x-hubspot-request-timestamp'] = '1'.repeat(17); c.name = 'hubspot : 17 chiffres'; judge(c); }
{ const c = structuredClone(h); c.headers['x-hubspot-request-timestamp'] = ' ' + c.headers['x-hubspot-request-timestamp']; c.name = 'hubspot : espace devant l horodatage'; judge(c); }
const f = byName('fathom : standard');
for (const sig of ['v2,abc v1,' + f.headers['webhook-signature'].slice(3), 'v1,', 'v1', ' ' + f.headers['webhook-signature'], f.headers['webhook-signature'] + ' ']) {
  judge({ ...structuredClone(f), headers: { ...f.headers, 'webhook-signature': sig }, name: `fathom : signatures « ${sig.slice(0, 12)} »` });
}
judge({ ...structuredClone(f), secret: f.secret.slice('whsec_'.length), name: 'fathom : secret sans whsec_' });
judge({ ...structuredClone(f), secret: 'whsec_@@@@', name: 'fathom : secret illisible' });
writeFileSync(process.argv[3], JSON.stringify({ verification: out }, null, 1));
console.log(`${out.length} cas écrits`);
```

Le résultat :

```bash
node --experimental-strip-types --no-warnings generer.ts services/porte/vecteurs.json /tmp/cas.json   # 425 cas écrits
PORTE_DIFFERENTIEL=/tmp/cas.json cargo test --locked differentiel -- --ignored --nocapture
```

```text
    Finished `test` profile [unoptimized + debuginfo] target(s) in 5.18s
     Running unittests src/main.rs (target/debug/deps/porte-ea8cf251fcf9d1a9)

running 1 test
425 cas, 2 divergences : [
    "écart connu : nombre hors des f64 : Rust format, TypeScript ok",
    "écart connu : 129 niveaux : Rust format, TypeScript ok",
]
test tests::differentiel_avec_verify_ts ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 0.02s
```

Deux divergences, celles qui étaient attendues (section 6, écart E15-6). La sortie ci-dessus est celle du passage refait après la relecture, sur les mêmes 425 cas : le résultat n'a pas changé (la relecture n'a touché, dans `verifier.rs`, que la lecture de `fournisseurs.json`). Un premier passage, avant `replace_lone_surrogates`, en trouvait une troisième : une moitié de paire UTF-16 seule ailleurs dans un corps Outlook faisait refuser en Rust ce que `verify.ts` acceptait. C'est cet essai qui l'a montrée.

**Proposition** (chapitre 03, après la PR W5) : faire entrer ce tirage dans le dépôt comme `src/server/webhooks/porte-differentiel.test.ts` (projet `unit`, ne tourne que si `LEON_PORTE_DIFFERENTIEL` donne un chemin de sortie), pour le relancer à chaque mode ou outil nouveau. Pas dans la CI : des cas tirés au hasard ne doivent pas faire échouer une PR sans rapport.

### 15.4 L'essai de bout en bout

Le binaire de production (`cargo build --release`), lancé contre une base **Postgres 16** jetable, sur la machine de la session : la 17 de `docker-compose.yml` (`pgvector/pgvector:pg17`) et de RDS n'était pas installable (pas de paquet, pas de démon Docker). Deux passages : le premier avec le code d'avant la relecture, le second avec celui d'après (fin de section). La base ne porte que ce que les deux fonctions lisent : des tables réduites pour `organization`, `"user"`, `member` et `connections`, puis, **recopiés sans changement**, les tables `abonnements_webhook` et `boite_entree_webhooks` de `0083` et les fonctions `porte_secret` et `porte_deposer` du chapitre 01 (section 11), avec leurs droits. Rien de l'application n'a tourné : ni serveur, ni migration.

```sql
-- Essai local du service Rust : le strict nécessaire de 0083 pour porte_secret et porte_deposer (chapitre 01).
create role leon_porte login password 'leon_porte' nobypassrls;
create table organization (id uuid primary key);
create table "user" (id uuid primary key, deleted_at timestamptz);
create table member ("organizationId" uuid not null, "userId" uuid not null);
create table connections (tenant_id uuid not null, id uuid not null, created_by uuid, unique (tenant_id, id));
grant usage on schema public to leon_porte;
-- Puis, recopiés : les tables abonnements_webhook et boite_entree_webhooks de 0083 (sans leurs politiques, qui citent
-- app_tenant()), et porte_secret, porte_deposer, avec leurs revoke et grant, tels que le chapitre 01 (section 11) les écrit.
```

Les données : une organisation (celle des vecteurs) avec un abonnement Outlook et un abonnement Fathom, dont les secrets chiffrés sont ceux de `vecteurs.json` ; une ligne d'écoute HubSpot pour le portail `12345678` dans cette organisation, et une autre dans une seconde organisation. Le lancement :

```bash
#!/usr/bin/env bash
# Lance le binaire de la porte contre la base d'essai locale (valeurs fictives des vecteurs).
export DATABASE_URL_PORTE='postgres://leon_porte:leon_porte@127.0.0.1:54331/essai?sslmode=disable'
export LEON_PORTE_KEY='CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk='
export LEON_PORTE_URL='https://porte.exemple.test'
export LEON_OAUTH_HUBSPOT_SECRET='exemple-fictif-secret-client-hubspot'
export LEON_IP_HEADER='x-real-ip'
export PORT=18080
exec "$1"
```

Les requêtes : les corps des vecteurs, signés à l'heure de l'essai pour HubSpot et Fathom (leurs horodatages ont une tolérance de 300 secondes).

```python
# Essai de bout en bout : le binaire de la porte, la base d'essai, des livraisons signées maintenant.
# Exemple fictif : secrets et corps viennent de vecteurs.json.
import base64, hashlib, hmac, json, subprocess, time, urllib.request

PORTE = 'http://127.0.0.1:18080'
BASE = 'https://porte.exemple.test'
v = json.load(open('../porte-build/vecteurs.json'))
cases = {c['name']: c for c in v['gate']['cases']}

def post(path, body, headers=None, query=''):
    url = PORTE + path + (('?' + query) if query else '')
    req = urllib.request.Request(url, data=body.encode(), method='POST', headers=headers or {})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode(), int((time.monotonic() - start) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), int((time.monotonic() - start) * 1000)

def lignes():
    out = subprocess.run(['psql', '-h', '127.0.0.1', '-p', '54331', '-U', 'postgres', '-d', 'essai', '-Atc',
        "select outil, portee, genre, coalesce(compte, '-'), left(livraison, 16), statut from boite_entree_webhooks order by recu_le, tenant_id"],
        capture_output=True, text=True).stdout.strip()
    return out.splitlines()

ok = cases['outlook : livraison juste']['request']
print('outlook, livraison      ', post(ok['path'], ok['body'], {'content-type': 'application/json'}))
print('outlook, la même        ', post(ok['path'], ok['body'], {'content-type': 'application/json'}))
print('outlook, écho           ', post(ok['path'], '', query='validationToken=jeton%20exemple'))
print('outlook, inconnu        ', post('/h/outlook/00000000-0000-4000-8000-000000000000', ok['body']))
print('outlook, cycle de vie   ', post(ok['path'] + '/cycle', ok['body'], {'content-type': 'application/json'}))

hub = cases['hubspot : livraison juste, deux organisations écoutent le compte']['request']
ts = str(int(time.time() * 1000))
sig = base64.b64encode(hmac.new(b'exemple-fictif-secret-client-hubspot',
    ('POST' + BASE + '/h/hubspot' + hub['body'] + ts).encode(), hashlib.sha256).digest()).decode()
h = {'content-type': 'application/json', 'x-hubspot-request-timestamp': ts, 'x-hubspot-signature-v3': sig}
print('hubspot, signé maintenant', post('/h/hubspot', hub['body'], h))
h['x-hubspot-request-timestamp'] = str(int(ts) - 301_000)
print('hubspot, vieux de 301 s  ', post('/h/hubspot', hub['body'], h))

fat = cases['fathom : livraison juste, identifiée par webhook-id']['request']
secret = base64.b64decode('ZXhlbXBsZS1maWN0aWYtZmF0aG9tLTMyLW9jdGV0cyE=')
ts = str(int(time.time()))
sig = base64.b64encode(hmac.new(secret, f'msg_essai_0001.{ts}.{fat["body"]}'.encode(), hashlib.sha256).digest()).decode()
h = {'content-type': 'application/json', 'webhook-id': 'msg_essai_0001', 'webhook-timestamp': ts, 'webhook-signature': 'v1,' + sig}
print('fathom, signé maintenant ', post(fat['path'], fat['body'], h))
for ligne in lignes():
    print('  ', ligne)
```

Ce qu'il a rendu au premier passage (statut, corps, durée en millisecondes ; puis les lignes de `boite_entree_webhooks`) :

```text
outlook, livraison       (202, '', 18)
outlook, la même         (202, '', 2)
outlook, écho            (200, 'jeton exemple', 0)
outlook, inconnu         (401, '{"error":"Invalid signature"}', 202)
outlook, cycle de vie    (202, '', 1)
hubspot, signé maintenant (202, '', 2)
hubspot, vieux de 301 s   (401, '{"error":"Invalid signature"}', 202)
fathom, signé maintenant  (202, '', 2)
   outlook|abonnement|livraison|-|e80a1ac0c7a48455|recue
   hubspot|app|livraison|12345678|4b907cad4007b804|recue
   hubspot|app|livraison|12345678|4b907cad4007b804|recue
   fathom|abonnement|livraison|-|msg_essai_0001|recue
```

Ce que cela montre :

- Outlook : déposée ; la même livraison rejouée répond 202 sans seconde ligne (`on conflict do nothing`). La notification de cycle de vie, envoyée ici avec le **même corps** que la livraison, n'a pas créé de ligne : même identifiant de livraison (SHA-256 du corps), et la clé unique de `boite_entree_webhooks` ne contient pas `genre`. Une vraie notification de cycle de vie a un autre corps ; c'est noté en section 18.
- HubSpot : une livraison, deux lignes, une par organisation qui écoute le portail (`porte_deposer`, portée `app`). Vieille de 301 secondes : refusée, en 202 ms.
- Fathom : déposée sous l'identifiant `webhook-id`.
- Une adresse inconnue : refus uniforme, en 202 ms.

Le réveil du worker : une session `psql` en `LISTEN leon_porte` a reçu, pendant une livraison, `Asynchronous notification "leon_porte" with payload "d7a31ed4-…" received` : l'identifiant de la ligne, comme le chapitre 01 le prévoit.

Le journal du service pendant le premier passage (lignes JSON, sur la sortie standard) :

```json
{"timestamp":"2026-11-20T15:28:48.717801Z","level":"INFO","fields":{"message":"[leon]","event":"porte.demarree","port":18080,"outils":"fathom,hubspot,outlook"}}
{"timestamp":"2026-11-20T15:28:49.776330Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":202,"ms":10}}
{"timestamp":"2026-11-20T15:28:49.779181Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":202,"ms":2}}
{"timestamp":"2026-11-20T15:28:49.779668Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":200,"ms":0}}
{"timestamp":"2026-11-20T15:28:49.981271Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":401,"ms":201}}
{"timestamp":"2026-11-20T15:28:49.983421Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":202,"ms":1}}
{"timestamp":"2026-11-20T15:28:49.985691Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"hubspot","statut":202,"ms":1}}
{"timestamp":"2026-11-20T15:28:49.986036Z","level":"INFO","fields":{"message":"[leon]","event":"porte.refus","outil":"hubspot","raison":"horodatage"}}
{"timestamp":"2026-11-20T15:28:50.187438Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"hubspot","statut":401,"ms":201}}
{"timestamp":"2026-11-20T15:28:50.191572Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"fathom","statut":202,"ms":2}}
{"timestamp":"2026-11-20T15:28:50.244393Z","level":"INFO","fields":{"message":"[leon]","event":"porte.arret"}}
```

La mémoire résidente du processus après ces requêtes (`/proc/<pid>/status`) : **7,6 Mo** (`VmRSS: 7644 kB`, pic identique). Sur la machine de la session, sans charge : c'est un ordre de grandeur, pas une mesure de production. L'arrêt sur `SIGTERM` a écrit `porte.arret` et rendu la main en moins d'une seconde. Sans `DATABASE_URL_PORTE`, ou avec une `LEON_PORTE_KEY` de travers, le binaire sort en code 1 avec `porte.demarrage` et la raison.

**Le second passage, après la relecture.** Le binaire corrigé, sur une base neuve (même schéma, mêmes données) qui demande cette fois un mot de passe en TCP, pour pouvoir en donner un faux. `lancer.sh` prend le binaire, le mot de passe et le port :

```bash
#!/usr/bin/env bash
# Lance un binaire de la porte contre la base d'essai locale (valeurs fictives des vecteurs).
# Usage : lancer.sh <binaire> [mot de passe] [port]
export DATABASE_URL_PORTE="postgres://leon_porte:${2:-leon_porte}@127.0.0.1:54331/essai?sslmode=disable"
export LEON_PORTE_KEY='CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk='
export LEON_PORTE_URL='https://porte.exemple.test'
export LEON_OAUTH_HUBSPOT_SECRET='exemple-fictif-secret-client-hubspot'
export LEON_IP_HEADER='x-real-ip'
export PORT="${3:-18080}"
exec "$1"
```

Trois essais. **Un mot de passe faux** : le service démarre, `/sante` reste en 503, une livraison reçoit 503, et le journal dit pourquoi, une fois par seconde, sans aucun message de Postgres (seulement son code, `28P01` : échec d'authentification). Un déploiement ainsi réglé échouerait au bilan de santé.

```text
$ curl -s -w ' %{http_code}' http://127.0.0.1:18080/sante          # 3,5 s après le démarrage
{"ok":false} 503
$ curl … -X POST …/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f
503
{"timestamp":"2026-11-20T18:31:49.482303Z","level":"INFO","fields":{"message":"[leon]","event":"porte.demarree","port":18080,"outils":"fathom,hubspot,outlook"}}
{"timestamp":"2026-11-20T18:31:49.486593Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"etape\":\"demarrage\"}","error":"Database code=28P01"}}
{"timestamp":"2026-11-20T18:31:50.493756Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"etape\":\"demarrage\"}","error":"Database code=28P01"}}
{"timestamp":"2026-11-20T18:31:51.502130Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"etape\":\"demarrage\"}","error":"Database code=28P01"}}
{"timestamp":"2026-11-20T18:31:52.508606Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"etape\":\"demarrage\"}","error":"Database code=28P01"}}
{"timestamp":"2026-11-20T18:31:52.998415Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"outil\":\"outlook\"}","error":"Database code=28P01"}}
{"timestamp":"2026-11-20T18:31:52.998468Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":503,"ms":5}}
{"timestamp":"2026-11-20T18:31:52.999531Z","level":"INFO","fields":{"message":"[leon]","event":"porte.arret"}}
```

**Le bon mot de passe**, et le script d'essai du premier passage (seuls changent le chemin de `vecteurs.json` et l'accès de `psql`, par le socket local). Mêmes réponses, mêmes lignes en base ; `porte.prete` apparaît 9 ms après le démarrage, et `/sante` répond 200. Mémoire résidente : **7,4 Mo** (`VmRSS: 7428 kB`).

```text
{"ok":true} 200
outlook, livraison       (202, '', 25)
outlook, la même         (202, '', 3)
outlook, écho            (200, 'jeton exemple', 0)
outlook, inconnu         (401, '{"error":"Invalid signature"}', 205)
outlook, cycle de vie    (202, '', 1)
hubspot, signé maintenant (202, '', 4)
hubspot, vieux de 301 s   (401, '{"error":"Invalid signature"}', 202)
fathom, signé maintenant  (202, '', 4)
   outlook|abonnement|livraison|-|e80a1ac0c7a48455|recue
   hubspot|app|livraison|12345678|4b907cad4007b804|recue
   hubspot|app|livraison|12345678|4b907cad4007b804|recue
   fathom|abonnement|livraison|-|msg_essai_0001|recue
```

**Une base lente** : `porte_secret` remplacée, le temps de l'essai, par une fonction qui dort 5 secondes avant d'appeler la vraie (sauf pour la lecture de démarrage). La livraison reçoit 503 au bout de 2 s ; Postgres a arrêté la requête de lui-même (`statement_timeout`), et son journal le dit.

```text
$ curl -s -w ' %{http_code} en %{time_total} s' -X POST … …/h/outlook/5d2f8e14-3b6a-4c7d-8e9f-0a1b2c3d4e5f
{"error":"Unavailable"} 503 en 2.001814 s
{"timestamp":"2026-11-20T18:31:56.595984Z","level":"ERROR","fields":{"message":"[leon]","event":"porte.base","details":"{\"outil\":\"outlook\"}","error":"Database code=57014"}}
{"timestamp":"2026-11-20T18:31:56.596039Z","level":"INFO","fields":{"message":"[leon]","event":"porte.reponse","outil":"outlook","statut":503,"ms":2000}}
-- journal de Postgres :
ERROR:  canceling statement due to statement timeout
```

Avant le filtre du journal (section 9.4), ce même essai avait aussi écrit deux lignes de `sqlx` : un avertissement « slow statement » avec le texte SQL, et « error occurred while testing the connection on-release » avec le message de Postgres. C'est ce qui a fait limiter le journal aux lignes de la porte.

**`comparer.sh`**, entre le binaire d'avant la relecture (port 18081) et celui d'après (port 18080), tous deux sur la même base :

```text
pareil      abonnement inconnu : {"error":"Invalid signature"} 401
pareil      outil inconnu : {"error":"Invalid signature"} 401
pareil      abonnement mal formé : {"error":"Invalid signature"} 401
pareil      outil d'application sur une adresse d'abonnement : {"error":"Invalid signature"} 401
pareil      écho de validation : essai de comparaison 200
pareil      écho avec un caractère de contrôle : {"error":"Invalid request"} 400
pareil      corps trop gros : {"error":"Request too large"} 413
DIFFÉRENT   corps trop gros, par morceaux, outil inconnu : [{"error":"Invalid signature"} 401] contre [{"error":"Request too large"} 413]
pareil      écho, clé encodée : essai 200
pareil      corps qui n'est pas de l'UTF-8 : {"error":"Invalid request"} 400
pareil      hubspot, signature fausse : {"error":"Invalid signature"} 401
pareil      méthode GET :  405
```

Une seule différence, celle que la relecture a voulue (étape 1, section 9.4). « méthode GET » dit « pareil » ici, puisque les deux côtés sont le service Rust ; contre `web`, elle dira « attendu ».

## 16. Ordre de mise en œuvre

Rien de ceci n'est dans le jalon 1. Une PR par sujet (`CLAUDE.md`), branche `<prenom>/<sujet>` dans un worktree. Le code de `dossier/code/porte/` se recopie tel quel dans `services/porte/` ; seuls `fournisseurs.json` et `vecteurs.json` ne se recopient pas : le dépôt a déjà les siens, générés par la PR W5 du chapitre 03, et ce sont eux que le Rust doit passer.

| # | Sujet | Fichiers | Tests | Dépend de | Effet en production |
|---|---|---|---|---|---|
| P0 | La mesure dans la porte en Hono | `src/server/webhooks/hono-gate.ts` : l'intergiciel `measure`, en tête des trois routes (4.1) | `hono-gate.test.ts` : une ligne `porte.reponse` par réponse, 202, 413 et 500 compris, sans corps ni abonnement | W5 du chapitre 03 (ou dans W5) | une ligne de journal par livraison. **Début de la mesure : 7 jours au moins** |
| — | La décision | aucune : la mesure qui déclenche (section 4), ses chiffres, ou la décision de David (Q1), écrits dans la description de P1 | | P0 et 7 jours | aucun |
| P1 | Le service Rust et son job de CI | `services/porte/Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.gitignore`, `README.md`, `src/main.rs`, `src/verifier.rs`, `src/depot.rs`, `src/secret.rs`, `src/tests.rs` ; `.github/workflows/tests.yml` (job `porte`, section 11) | `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, `cargo test --locked` ; à la main, l'essai différentiel (15.3) contre le `verify.ts` du dépôt | la décision ; `fournisseurs.json` et `vecteurs.json` dans `services/porte/` (W5) | aucun : rien ne le construit ni ne le lance |
| P2 | L'image et les outils de bascule | `services/porte/Dockerfile`, `Dockerfile.dockerignore`, `comparer.sh`, `sonde.sh` | `docker build -f services/porte/Dockerfile .` puis `/sante` sur un poste (section 10) ; `bash -n` des deux scripts | P1 | aucun |
| O1 | Le service Railway (opération, sans PR) | tableau de bord : section 12 ; alertes Sentry | `/sante`, `comparer.sh` tout « pareil », répétition sur `porte-essai.<domaine>` avec la sonde (13.1) | P2 | un service de plus, sans trafic ; 5 connexions de plus au plus |
| O2 | La bascule (opération) | DNS et domaines Railway : 13.3 | sonde, 13.4 | O1 | le domaine de `LEON_PORTE_URL` mène au service Rust ; un trou de la durée mesurée en O1 |
| P3 | Les textes | `README.md` (« En ligne » : trois services, la porte se déploie à part, le retour arrière de 13.5) | `pnpm test:unit` (les contrats de documentation existants) | O2 | aucun |
| O3 | L'extinction de la route Hono (opération, 14 jours après O2) | variables de `web` : 13.6 | la requête de 13.4 montre toujours des livraisons | O2 + 14 jours | `web` rend 2 connexions ; la route Hono répond 503 à ce qui lui arriverait encore |

Pourquoi P1 avant l'image : `cargo test` en CI prouve que le service tient le contrat tel que le dépôt le génère ce jour-là. L'image ne prouve que la construction. Pourquoi deux opérations sans PR : un domaine et des variables ne vivent pas dans le dépôt (chapitre 13, écart E13-7).

Durée (estimation de ma part) : P0, une heure. P1 et P2, une journée en tout, puisque le code est écrit et compile : relire, recopier, faire passer la CI, essayer l'image. O1 et O2, une demi-journée chacune, répétition comprise.

## 17. Écarts avec l'architecture

Aucun nom de l'architecture n'est changé : fonctions SQL, rôle, variables, fichiers, types de `WebhookVerification` et événements de journal sont les siens ou ceux du chapitre 03. Ce qui suit ne pouvait pas être suivi à la lettre, ou précise ce qu'elle ne dit pas.

| # | Ce que dit l'architecture (ou un chapitre) | Ce qui heurte, et la preuve | Ce qui est écrit ici, et ma proposition |
|---|---|---|---|
| E15-1 | Section 2 : les caisses du service Rust, « `aes-gcm` : version à vérifier » | Le mode `hmac-sha1` de `WebhookVerification` (8.3) demande `sha1`, absent de la liste. Décoder `validationToken` et le champ `payload` comme `URLSearchParams` demande un décodeur de formulaire. `tower-http` ne sert pas : la limite et le délai se font sans lui, pour garder les réponses de la route Hono | `sha1` 0.11.0, `form_urlencoded` 1.2.2 ajoutées ; `aes-gcm` fixée à 0.11.1 ; `tower` et `http-body` 1.1.0 en test seulement ; `tower-http` retirée. Proposition : recopier le tableau 5.1 dans la ligne « Passerelle de webhooks » de la section 2 |
| E15-2 | Section 6 : `src/main.rs` : « routes `/h/:outil` et `/h/:outil/:abonnement`, `/sante` » | La section 8.3 fixe l'adresse de cycle de vie `…/<abonnement_id>/cycle` (même constat que le chapitre 03, écart E-i). Et axum 0.8 écrit `{outil}`, pas `:outil` | Trois routes de livraison plus `/sante`, lues dans `fournisseurs.json` (`paths`, qui écrit déjà `{outil}`) et vérifiées au démarrage. Proposition : corriger la ligne de la section 6 |
| E15-3 | Section 6 : les fichiers de `services/porte/` | Les tests ont besoin d'un module (`src/tests.rs`) ; la caisse a besoin de son `.gitignore` (celui de la racine, existe, ne couvre pas `target/`) ; l'image d'un fichier d'exclusion ; la bascule de deux scripts | `src/tests.rs`, `.gitignore`, `README.md`, `Dockerfile.dockerignore`, `comparer.sh`, `sonde.sh` en plus. Proposition : les ajouter à l'arborescence de la section 6 |
| E15-4 | Chapitre 13, tableau 9 : `LEON_IP_HEADER` « — » pour `porte` ; `DATABASE_URL_PORTE`, `LEON_PORTE_KEY`, `LEON_PORTE_URL` « après la bascule » ; tableau 4.1 : chemins surveillés « `services/porte/**` seulement » | Le service Rust applique la limite par adresse IP du chapitre 03 (6.1) : sans `LEON_IP_HEADER`, toutes ses lectures vides partagent un plafond que n'importe qui peut épuiser. Les autres variables doivent être posées **avant** la bascule : le service est essayé par son domaine Railway, et la signature HubSpot couvre `LEON_PORTE_URL` dès ce moment (13.1). L'image copie `certs/rds-eu-central-1-bundle.pem` | `LEON_IP_HEADER=x-real-ip` sur `porte` ; toutes ses variables posées à l'opération O1 ; chemins surveillés : `services/porte/**` et le certificat (section 12). Proposition : corriger les deux tableaux du chapitre 13 |
| E15-5 | Section 3 : trois mesures déclenchent la construction ; chapitre 03 : la porte en Hono n'écrit rien au journal quand une livraison passe | Sans une ligne par réponse, ni la part de 5xx ni le p95 ne se mesurent : le service Rust ne se déclencherait que sur la décision de David | Une ligne `porte.reponse` (outil, statut, durée) dans `hono-gate.ts`, écrite par un intergiciel en tête de chaque route pour compter aussi les 413 et les 500 (section 4.1, PR P0), et la même dans le service Rust. Proposition : l'ajouter au code du chapitre 03 dans la PR W5 |
| E15-6 | Section 3 : « Les deux mises en œuvre passent le même jeu de vecteurs » ; chapitre 03 : les deux rendent le même verdict | Elles le rendent sur les 35 cas des vecteurs et sur 423 des 425 cas de l'essai différentiel. Deux corps restent jugés différemment : un nombre hors des `f64` (« 1e400 ») et plus de 128 niveaux d'imbrication. `JSON.parse` les accepte, `serde_json` les refuse (section 15.3) | Le service Rust refuse ces deux corps (raison `format`, ou compte illisible). Aucun éditeur du premier lot n'en envoie dans un corps signé (déduit). Proposition : aligner le TypeScript, plus simple à durcir que `serde_json` à assouplir : `parseBodyJson` (`verify.ts`) rend `undefined` pour un document qui contient un nombre non fini ou plus de 128 niveaux, puis ajouter ces deux cas à `vecteurs.json` par le générateur |
| E15-7 | Chapitre 13, 15.6 : « `DATABASE_URL_PORTE` et `LEON_PORTE_SECRET_<OUTIL>` ne restent sur `web` que tant que la route Hono y répond (le chapitre 15 dit quand elle s'éteint) » | | Quatorze jours après la bascule, sans retour arrière ; le code de la route Hono reste (13.6). Pas un écart : la réponse à la question laissée ouverte |
| E15-8 | Section 3 (tableau, ligne « La porte ») : « plus de 0,1 % de livraisons en 5xx ou hors délai sur 7 jours, ou un p95 de réponse au-dessus d'une seconde » | Au bas du volume d'un client de Leon (quelques dizaines de livraisons par semaine quand Outlook n'est pas branché, estimation), un seul 503 dépasse 0,1 % de la semaine, et un p95 calculé sur trente réponses ne dit rien. La règle telle quelle déclencherait au hasard (relecture, section 19) | Une règle d'effectif (section 4) : M2 en part à partir de 1 000 livraisons dans la semaine, en nombre en dessous (plus de 3 en 5xx ou hors délai) ; M3 à partir de 1 000 livraisons acceptées seulement ; M1 reste le déclencheur principal. Proposition : recopier la règle dans la ligne « La porte » du tableau de la section 3 |
| E15-9 | Chapitre 03 (6.2, `hono-gate.ts` et `portePool`) : `porte.trop_gros` part dans Sentry par `logError` à chaque occurrence ; `logError` n'a pas de limite ; `portePool` attend une connexion 5 s (`connectionTimeoutMillis: 5_000`), sans délai de requête | Un gros corps, que n'importe qui peut envoyer avant toute vérification, et une panne de base, une erreur par livraison, remplissent le quota de Sentry et noient ses alertes. Une base lente tient chaque livraison 5 s, au-delà du plus court délai d'éditeur (3 s, section 4). Les deux portes doivent se mesurer pareil (M2) | Dans le service Rust : `porte.trop_gros` au journal seulement, un envoi Sentry par événement et par minute (`SentryThrottle`), 2 s par appel de base (`DB_CALL_TIMEOUT`, `statement_timeout`), 3 s par requête (section 9.4). Proposition : les mêmes règles dans `hono-gate.ts` et `portePool` à la PR W5 |

Précisions, sans écart :

- Le service Rust **refuse de démarrer** sans `DATABASE_URL_PORTE`, là où la route Hono répond 503 ; avec une base qui refuse ou ne répond pas, il démarre mais `/sante` répond 503 jusqu'à la première lecture réussie (section 9.4). C'est ce qui fait échouer un déploiement mal réglé au bilan de santé, au lieu de répondre 503 en production.
- Il ajoute des **délais** (3 s par requête, `porte.delai` ; 2 s par appel de base, `porte.base`) et six événements d'information (`porte.reponse`, `porte.refus`, `porte.demarree`, `porte.prete`, `porte.arret`, `porte.corps_interrompu`) ; les événements d'erreur gardent les noms de `hono-gate.ts`.
- La colonne `porte` du chapitre 13 (4.1) laissait `healthcheckTimeout` et `drainingSeconds` à ce chapitre : `30` et `"5"` (section 12).
- Le chemin du certificat dans l'image est celui de `web` (`/app/certs/rds-eu-central-1-bundle.pem`) : `DATABASE_URL_PORTE` est la même chaîne sur les deux services (section 10).

## 18. Ce que je n'ai pas vérifié

- **L'image Docker** : non construite (pas de démon Docker dans la session). Les étiquettes `rust:1.97.0-slim-bookworm` et `gcr.io/distroless/cc-debian12:nonroot`, la lecture de `Dockerfile.dockerignore` par Railway, `RAILWAY_DOCKERFILE_PATH` : à vérifier le jour de P2. La taille de l'image n'est pas mesurée (la note 02 dit 30 à 80 Mo, déduit).
- **Railway** (documentation injoignable, comme pour le chapitre 13) : déplacer un domaine personnalisé d'un service à l'autre (ordre des gestes, cible DNS, vérification, délai d'émission du certificat), la forme du domaine fourni pour les essais, la présence de `x-real-ip` devant un service construit par Dockerfile, l'écoute en IPv6 sur le réseau de Railway, l'export et la durée de rétention des journaux (section 4.3), l'option « attendre la CI », le sens exact de `drainingSeconds`.
- **TLS vers RDS** : la base de l'essai était locale, sans TLS. `sslmode=verify-full` avec `sslrootcert`, lus par `sqlx` 0.9.1 avec `rustls` et `ring`, contre les autorités de `certs/rds-eu-central-1-bundle.pem` (dont une ECC384) : non essayé. Premier geste de O1 : `/sante` le dit désormais (503 tant que la première lecture échoue, `porte.base` au journal avec son résumé).
- **Postgres 17** : les deux passages de l'essai ont tourné sur Postgres 16 ; le dépôt (`docker-compose.yml`) et RDS sont en 17, que la session ne pouvait pas installer. Les deux fonctions sont du SQL et du PL/pgSQL ordinaires, et `statement_timeout` existe dans les deux versions. Rejouer 15.4 sur `pgvector/pgvector:pg17` à la PR P1.
- **Le bilan de santé ne sert qu'au déploiement** : le chapitre 13 le dit, à vérifier. Si Railway l'interrogeait aussi au redémarrage d'un service planté pendant une panne de base, la nouvelle instance resterait à 503 sur `/sante` (elle servirait quand même les livraisons, en 503) ; ce que Railway en ferait n'est pas lu. Et que Railway garde l'ancienne version quand le bilan échoue : à vérifier aussi (chapitre 13).
- **`statement_timeout` passé à l'ouverture de la connexion** : essayé en local, sans intermédiaire. Un pooler devant RDS (RDS Proxy, PgBouncer) pourrait refuser ou ignorer l'option ; aucun n'est prévu (chapitre 13).
- **La latence** entre Railway et RDS, et le coût de `test_before_acquire` (un aller-retour de plus par livraison) : à lire dans `porte.reponse` après la bascule.
- **La charge** : aucun essai de charge. Les 7,4 Mo de mémoire sont ceux d'un processus qui a servi une dizaine de requêtes. Ni coupe-circuit ni borne des requêtes en vol (section 9.4) : sans mesure, on ne sait pas s'il en faut.
- **Les seuils de la règle d'effectif** (1 000 livraisons, plus de 3 en 5xx ou hors délai : section 4, écart E15-8) sont une proposition, sans mesure du volume réel d'un client.
- **Les éditeurs pendant le trou** : ce que font Graph, HubSpot et Fathom d'un 404 ou d'une erreur de certificat, et combien de temps ils réessaient (notes 04 et 05 : sources tierces pour HubSpot, rien pour Fathom). La relève forcée (13.3, geste 6) rattrape les créations et modifications, pas une suppression HubSpot, que seul le webhook apporte.
- **HubSpot et plusieurs portails dans une requête** : la porte écarte (202, `porte.comptes_multiples`) une livraison qui mêle des portails, et (202, `porte.compte_illisible`) une livraison signée sans `portalId`, comme la route Hono (chapitre 03, 6.1, étape 9). Rien ne la rattrape, sauf la relève de 15 minutes pour ce qu'elle couvre. Que HubSpot ne mêle jamais les portails n'est pas vérifié (la note 04 dit seulement « 100 événements par requête ») ; c'est la question de l'étape W3-0 du chapitre 03 (12.2). Si la documentation dit le contraire, le chapitre 03 change le contrat (un dépôt par portail, `fournisseurs.json` en version 2, des cas `gate`), et le Rust suit les vecteurs.
- **Deux notifications Graph aux mêmes octets** : pour Outlook, l'identifiant de livraison est le SHA-256 du corps (pas de `deliveryHeader`), gardé 7 jours, et la clé unique de la boîte d'entrée ne contient pas `genre` (chapitre 01). Si Graph envoyait deux fois exactement le même corps pour deux changements, le second serait écarté en 202, sans trace. Ce que Graph met dans le corps pour distinguer deux changements n'est pas lu (la note 04 parle de « doublons et désordre ») : avant le premier abonnement Outlook, relever un vrai corps, et voir s'il porte un horodatage ou un `@odata.etag` qui varie.
- **Le mode `jeton` n'a aucune fenêtre de rejeu** : ni horodatage ni identifiant signé. Un corps Outlook capturé peut être rejoué sans limite, et redevient neuf après la purge des 7 jours. L'effet est borné : une livraison n'est qu'un signal, et la relève qu'elle déclenche est idempotente et relit l'objet chez l'éditeur.
- **Les secrets que tient la porte** : aucun jeton d'outil, mais les secrets de signature de toutes les organisations (`LEON_PORTE_KEY`, `LEON_OAUTH_HUBSPOT_SECRET`, section 3.2). Un compromis du processus permet de forger des signaux pour toutes les organisations, pas de lire ni d'écrire dans un outil. Ni une clé par organisation, ni une rotation sans coupure ne sont prévues (chapitre 03, section 5).
- **Rust 1.94** : `rust-version` le promet, seul 1.97.0 a tourné. `Swatinem/rust-cache@v2` et son option `save-if`, `rustup toolchain install … --component` sur les machines de GitHub : de mémoire.
- **La route Hono n'a pas tourné.** Ce que 9.4 dit de Hono (le `bodyLimit` qui lit un corps sans `content-length` avant la route, la clé de requête décodée quand l'adresse contient « % » ou « + ») est lu dans le code de hono 4.13.18 (`dist/`, copie hors du dépôt), pas essayé contre `hono-gate.ts`. L'intergiciel `measure` de 4.1 a tourné contre hono 4.13.18, hors du dépôt, sans le reste de `hono-gate.ts`. La chaîne de requête réencodée par `new URL`, et 404 ou 405 pour un `GET` derrière Next, ne sont pas essayés. Le code TypeScript comparé (essai différentiel) est celui du chapitre 03, recopié de son texte ; celui qui sera fusionné en W1 et W5 peut différer : relancer l'essai différentiel sur lui (P1).
- **`ipKey`** : les cas du chapitre 03 et trois de plus passent. Les formes IPv6 rares (zones, notations mixtes inhabituelles) peuvent être lues différemment par `isIP` de Node et par la bibliothèque standard de Rust ; sans conséquence de sécurité (une clé différente ne fait que compter à part).
- **Les fichiers du contrat** : `fournisseurs.json` est l'exemple de la section 7.1 du chapitre 03 (deux valeurs de `limits` y ont été reportées à la main par son auteur) ; `vecteurs.json` est la sortie du générateur de la section 7.3, rejoué hors du dépôt. Les vrais fichiers seront ceux de W5 ; `cargo test` dira s'ils diffèrent.
- **Sentry** : aucun envoi essayé (pas de DSN). Le transport `ureq` avec `rustls` et l'intégration des paniques compilent ; leur fonctionnement n'est pas vu. `scrub_event` et `SentryThrottle` sont essayés en test, sur des événements construits à la main, pas sur un envoi réel : que l'intégration des paniques passe bien par `before_send` (c'est ce que dit le code de `sentry-core` 0.49.6, lu) n'est pas vu. Le message d'une panique part aussi sur la sortie d'erreur par le crochet de panique de Rust, donc au journal de Railway : non masqué là.
- **Une notification de cycle de vie au même corps qu'une livraison** n'est pas déposée (section 15.4) : la clé unique de `boite_entree_webhooks` (chapitre 01) ne contient pas `genre`. Sans effet tant qu'un éditeur ne réutilise pas le même corps ; la forme réelle des notifications de cycle de vie de Graph n'a pas été lue.
- **Les durées** (section 16) sont des estimations de ma part.

## 19. Relecture contradictoire

Deux relectures, l'une sur la fidélité au code, l'autre sur le fond et la faisabilité : 19 objections, aucune bloquante. Chacune a été vérifiée dans le dépôt, dans le code de hono 4.13.18 ou de Node, ou en lançant le binaire. Le code corrigé est dans `dossier/code/porte/`, recopié ici à l'identique, et repasse `cargo check`, `cargo fmt --check`, `cargo clippy` et `cargo test` (35 tests, section 5.4) ; l'essai de bout en bout a été refait (section 15.4).

| # | Objection | Verdict | Ce qui a changé, ou pourquoi |
|---|---|---|---|
| Code 1 | Une `LEON_PORTE_KEY` en base64url passe `env.ts` mais pas le Rust, qui ne démarrerait pas le jour de la bascule | Retenue | Vrai : `Buffer.from(…, 'base64')` lit les deux alphabets (essayé sous Node 22.23). `decode_like_node` (`secret.rs`) pour la clé et les trois parties de `v1:` ; tests `la_cle_se_lit_dans_les_deux_alphabets_comme_node` et `vecteurs_de_dechiffrement` (autre alphabet) ; phrase de la section 7 corrigée |
| Code 2 | Une base mal réglée passe le bilan de santé : `/sante` ne lit pas la base, le pool s'ouvre à la demande | Retenue, autrement | Pas de sortie en échec au démarrage (un redémarrage pendant une panne de base tournerait en boucle) : `/sante` répond 503 jusqu'à la première lecture réussie (`wait_for_base`), puis 200 pour toujours. Test `le_bilan_de_sante_attend_la_premiere_lecture_de_la_base`, essai avec un mot de passe faux (15.4) ; 9.1, 9.4, 12, 17 et 18 corrigées |
| Code 3 | `deny_unknown_fields` manque sur les modes `standard-webhooks` et `jeton` et sur le morceau littéral | Retenue | Posé sur les énumérations `WebhookVerification` et `SignedPart` (même effet que des structures nommées, moins de code). Test `chaque_mode_refuse_un_champ_inconnu`, vu en échec sans la correction ; `fournisseurs_est_dans_la_version_connue` essaie chaque outil |
| Code 4 | Sentry n'a aucun filet : ni `before_send`, ni nettoyage, alors que le dépôt coupe tout ce qui pourrait citer une conversation | Retenue | `scrub_event` en `before_send` (message masqué hors `log_error`, ni requête ni utilisateur ni fil d'Ariane, extras réduits aux identifiants), `max_breadcrumbs = 0` ; test `sentry_ne_recoit_aucun_texte_recu`. La sortie d'erreur du crochet de panique reste, écrite en section 18 |
| Code 5 | `measured` n'écrit rien quand `receive` lève : le 500 échappe à M2 | Retenue, plus loin | Un intergiciel `measure` en tête de route, avant `bodyLimit` : il compte aussi le 413 et le 500 d'un flux coupé. Essayé contre hono 4.13.18 (202, 413, 500, 500). 4.3 dit que M2 ne voit pas les 502 du proxy |
| Code 6 | Hono refuse en 413 un gros corps sans `content-length` avant tout ; le Rust le lisait après l'adresse et l'écho | Retenue | Vrai, lu dans `dist/middleware/body-limit/index.js` de hono 4.13.18. Le corps est lu à l'étape 1 (`read_body`) ; test `un_corps_trop_gros_recoit_413_avant_l_adresse` ; ligne de `comparer.sh` « par morceaux », seule différence entre l'ancien et le nouveau binaire (15.4) |
| Code 7 | L'essai a tourné sur Postgres 16, le dépôt et RDS sont en 17 | Retenue en partie | La 17 n'était pas installable (ni paquet, ni démon Docker). La réserve est écrite dès l'en-tête, en 15.4 et en 18 ; rejouer 15.4 sur `pgvector/pgvector:pg17` à la PR P1 |
| Code 8 | Le README du code renvoie à la « section 14 » pour l'essai différentiel | Retenue | « section 15.3 » dans `README.md` et dans `tests.rs` |
| Fond 1 | Une base lente tient chaque livraison jusqu'à 10 s, le délai de Graph ; aucun délai de requête SQL | Retenue | 2 s par appel de base (`DB_CALL_TIMEOUT`, `acquire_timeout`, `statement_timeout`), 3 s par requête, `drainingSeconds` à 5. Tests `une_base_lente_recoit_503_en_2_s` et `une_requete_ne_dure_jamais_plus_de_3_s` ; essai réel : 503 en 2,0 s, requête arrêtée par Postgres (`57014`). Ni coupe-circuit ni borne des requêtes en vol : sans mesure de charge, non écrits (9.4, 18) |
| Fond 2 | N'importe qui remplit le quota Sentry (`porte.trop_gros` à chaque requête, `porte.base` à chaque livraison en panne) ; une lecture coupée devient un 413 | Retenue | `porte.trop_gros` au journal seulement ; un envoi Sentry par événement et par minute (`SentryThrottle`) ; lecture coupée : 400 et `porte.corps_interrompu`. Tests `sentry_recoit_un_envoi_par_minute_et_par_evenement`, `un_corps_interrompu_recoit_400_et_non_413`. Proposition au chapitre 03 : écart E15-9 |
| Fond 3 | Un lot HubSpot mêlant des portails, ou sans compte lisible, est acquitté et perdu ; aucun test | Retenue en partie | Le cas « plusieurs comptes » est déjà un cas `gate` des vecteurs ; le cas « compte illisible » a son test (`un_compte_illisible_est_accepte_sans_depot`) ; l'hypothèse est écrite en 18. Écarté : déposer par portail ou répondre 500 ici. C'est le contrat du chapitre 03 (6.1, étape 9 ; question W3-0 et sa relecture « Fond 10 »), tenu par les vecteurs : le Rust ne peut pas en changer seul |
| Fond 4 | La bascule ouvre le trou qu'elle veut éviter, sans parade pour Fathom | Retenue | Geste 6 obligatoire en 13.3 et au retour arrière (13.5) : une relève forcée de chaque connexion Outlook, HubSpot et Fathom (`next_sync_at = now()`, comme `requestSyncNow`), plutôt que `connector-fetch`, qui demande un objet précis. Bascule hors des heures de réunion ; coût écrit en 3.2 et 3.3 |
| Fond 5 | À l'échelle de Leon, 0,1 % et un p95 ne se mesurent pas ; l'export des journaux n'est pas vérifié | Retenue | Règle d'effectif (1 000 livraisons, sinon plus de 3 en nombre ; M3 seulement au-delà de 1 000 acceptées), calculée par le programme de 4.3 ; M1 reste le déclencheur principal ; sans export, M2 et M3 ne se mesurent pas. Écart E15-8 |
| Fond 6 | Des comportements affirmés n'ont aucun test | Retenue en partie | L'octet nul et le caractère de contrôle de l'écho sont déjà des cas `gate` des vecteurs. Ajoutés : UTF-8 invalide, longueur de l'écho, expiration du cache positif, secret illisible, compte illisible, base lente, délai de requête (15.1) |
| Fond 7 | Deux notifications Graph aux mêmes octets se confondent ; le mode `jeton` n'a aucune fenêtre de rejeu | Retenue | Deux points en section 18, avec la vérification à faire sur un vrai corps Graph avant le premier abonnement Outlook. Pas de changement de code : l'identifiant de livraison est fixé par le chapitre 03 |
| Fond 8 | « Ne tient aucun jeton » est trop fort : la porte tient les secrets de signature de toutes les organisations | Retenue | Ligne de 3.2 réécrite (forger des signaux, pas lire ni écrire dans un outil), et un point en 18 |
| Fond 9 | La section 14 donne du code hors de la colonne « Fixe » | Retenue | Les esquisses sont retirées ; la section garde la mesure de chaque candidat et son prix. Pas d'annexe : ce chapitre ne peut créer que lui-même et `code/porte/`. Section 1, point 5, et tableau 3.4 corrigés |
| Fond 10 | Trois renvois internes faux, qui entreraient dans le dépôt avec le code | Retenue | `README.md` et `tests.rs` : « section 15.3 » ; `main.rs` : « section 9.1 » |
| Fond 11 | « Mêmes réponses » est trop fort ; `comparer.sh` ne teste ni `GET` ni la clé encodée ; deux formats de journal | Retenue en partie | En-têtes de `Cargo.toml` et `main.rs` : « mêmes réponses sur chaque cas de `vecteurs.json` ». `comparer.sh` gagne `GET` (marqué « attendu »), la clé encodée et le corps par morceaux. La différence sur `validation%54oken` était fausse : hono 4.13.18 décode aussi la clé (9.4 corrigée). Un seul programme `jq` lit les deux formats (4.3). Écarté : changer la ligne de Hono, qui suit la règle de journal du dépôt (`console.info('[leon]', …)`) |
| Essai refait | Hors objection : au second passage, `sqlx` a écrit au journal un message de Postgres (« canceling statement due to statement timeout ») | Corrigé | Le journal ne garde que les lignes de la porte (filtre `Targets`, section 9.4) |

