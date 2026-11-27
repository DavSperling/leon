# 13. Infrastructure et mise en ligne

20 novembre 2026 · chapitre 13 du dossier de conception · à relire par David et Amos

Ce chapitre suit `00-architecture.md` (sections 2, 4, 4.1, 7.4, 11, 14.3). Il en recopie les noms. Ce qui s'en écarte est en fin de chapitre, sous « Écarts avec l'architecture ».

Convention : **existe** (lu dans le dépôt, avec chemin et ligne, commit `b075333`), **à créer**, **à vérifier** (vient d'une note de recherche non confirmée, ou d'une bibliothèque absente : `node_modules` n'est pas installé ici). Rien n'a été lancé : ni serveur, ni test, ni migration, ni commande Railway. La documentation de Railway n'a pas pu être ouverte depuis cette session (hôte `docs.railway.com` hors du réseau permis) : tout réglage Railway qui ne vient pas de `railway.json` ou de la note 02 porte la mention « à vérifier dans la documentation de l'éditeur ».

## 1. Ce que ce chapitre fixe

1. **La PR n° 0** : les neuf réglages de `railway.json` reportés dans les réglages du service Railway, puis `railway.json` retiré, avant le 1er décembre 2026, sans changer le comportement.
2. **Deux services sur la même image**, `web` et `worker`, choisis par `LEON_ROLE` (`src/server/env.ts`, `src/server/role.ts`, `runsWorkers()`), avec la configuration Railway de chacun ; le troisième, `porte`, quand le service Rust existe.
3. **L'arrêt propre du worker** : `src/server/shutdown.ts` (`stoppingSignal`, `isStopping`, `onShutdown`, `registerShutdown`, `createShutdown`, le vidage de Sentry avant la sortie), `stopBoss` dans `src/server/pipeline/queue.ts`, `NEXT_MANUAL_SIG_HANDLE`, et les modifications de `src/instrumentation-node.ts`.
4. **Les pools et les variables** : `max` 16 ou 4 et `connectionTimeoutMillis` dans `src/server/db/client.ts`, le compte des connexions, le tableau des variables par service, `leon_porte` et `DATABASE_URL_PORTE` en production, le domaine de `LEON_PORTE_URL` et sa restriction à la porte, la vérification de `LEON_IP_HEADER`, la mesure de latence (`pnpm db:latence`), Sentry, la montée de pg-boss à 12.38.2.
5. **La surveillance en continu** : le pouls du worker (`src/server/pouls.ts`, moniteur Sentry `worker-pouls`), les comptes d'exploitation des exécutions (`compteurs_exploitation()`, `surveillerExecutions()`), les règles d'alerte de Sentry, et ce que d'autres chapitres attendent d'ici (`CLOCK_CATCH_UP_MINUTES`, `porte.secret_illisible`, `journal_vide`).
6. **La marche à suivre** : une mise en ligne ordinaire, commande par commande ; la bascule unique d'un service à deux ; le changement de modèle de vecteurs ; le retour arrière.

## 2. Vue d'ensemble

```mermaid
flowchart LR
  GH[GitHub, branche main] -- "build Railpack (x2)" --> W
  GH -- "build Railpack (x2)" --> K
  GH -. "après : Dockerfile" .-> P
  N[Navigateurs, CLI, extension, MCP] -- "domaine du site" --> W
  E[Éditeurs : webhooks] -- "porte.domaine (LEON_PORTE_URL)" --> W
  E -. "après la bascule (chapitre 15)" .-> P
  subgraph Railway
    W["web : pnpm start<br/>LEON_ROLE=web"]
    K["worker : pnpm start<br/>LEON_ROLE=worker<br/>NEXT_MANUAL_SIG_HANDLE=true"]
    P["porte : binaire Rust (après)"]
  end
  W -- "4 + 2 (porte) + 2 + 1 = 9" --> DB[("RDS Postgres 17, Francfort")]
  K -- "16 + 2 + 1 + 1 = 20" --> DB
  P -. "5" .-> DB
```

| Pièce | Fichier ou lieu | État | Jalon | PR |
|---|---|---|---|---|
| Réglages Railway du service actuel | tableau de bord Railway ; `railway.json` retiré | `railway.json` existe | 1 | 0 |
| pg-boss 12.38.2 et son test de contrat | `package.json`, `pnpm-lock.yaml`, `src/server/pipeline/pgboss.db.test.ts` | pg-boss 12.37.1 existe ; test à créer | 1 | 1 |
| `LEON_ROLE` | `src/server/env.ts`, `.env.example` | à créer | 1 | 2 |
| `runsWorkers()` | `src/server/role.ts` | à créer | 1 | 2 |
| Arrêt propre | `src/server/shutdown.ts`, `stopBoss` dans `src/server/pipeline/queue.ts` | à créer | 1 | 2 |
| Démarrage selon le rôle | `src/instrumentation-node.ts` | existe, à modifier | 1 | 2 |
| Pool selon le rôle, délai, écouteur d'erreur | `src/server/db/client.ts` | existe, à modifier | 1 | 2 |
| Étiquette `role` dans Sentry | `src/sentry.server.config.ts` | existe, à modifier | 1 | 2 |
| README « En ligne », « Une instance » | `README.md` | existe, à modifier | 1 | 0 et 2 |
| Service `worker` sur Railway | tableau de bord | à créer | 1 | bascule après la PR 2 |
| Pouls du worker | `src/server/pouls.ts`, une ligne dans `src/server/search/worker.ts` | à créer | 1 | 2 |
| Mesure de latence | `src/server/db/latence.ts`, `src/server/db/latence-cli.ts`, script `db:latence` | à créer | 1 (aller-retour seul), puis avant les webhooks | 2b |
| Comptes d'exploitation des exécutions | migration `compteurs_exploitation()`, `surveillerExecutions()` dans `src/server/pouls.ts` | à créer | 1, après 0079 et la PR 6b | 2c |
| `leon_porte` en production, `DATABASE_URL_PORTE` | RDS, variables de `web` | à créer | après (webhooks) | opération, avec la PR de 0083 |
| Domaine de `LEON_PORTE_URL` | DNS, domaine du service `web` | à créer | après (webhooks) | opération, avec la PR de la porte en Hono |
| Restriction de l'hôte de la porte | `next.config.ts` | existe, à modifier | après (webhooks) | 2d, entre la porte en Hono et le premier abonnement |
| Service `porte` | tableau de bord, `services/porte/Dockerfile` (chapitre 15) | à créer | après (service Rust) | chapitre 15 |

## 3. La PR n° 0 : ce qui remplace `railway.json`

**Jalon 1, seule, avant le 1er décembre 2026** (architecture, écart E7, 14.3). Elle ne change aucun comportement : elle déplace neuf réglages.

### 3.1 Ce qui existe

`railway.json` (existe, racine du dépôt, lignes 1-16) :

| Champ | Valeur | Ce qu'il fait aujourd'hui |
|---|---|---|
| `build.builder` | `RAILPACK` | Railway construit l'image lui-même ; il n'y a pas de Dockerfile (carte 08, 3) |
| `build.buildCommand` | `pnpm build` | `pnpm build:cli && next build --webpack` (`package.json`, script `build`) |
| `deploy.preDeployCommand` | `["pnpm db:migrate"]` | Applique les migrations avant de démarrer la nouvelle version. Ne lit que `DATABASE_URL_ADMIN` (`src/server/db/migrate-cli.ts:4`). Verrou consultatif `LOCK_KEY = 7_270_331` (`src/server/db/migrate.ts:6`, `:19`) |
| `deploy.startCommand` | `pnpm start` | `next start` (`package.json`) |
| `deploy.healthcheckPath` | `/api/health` | `app.get('/health', (c) => c.json({ ok: true }))` (`src/server/api/app.ts:31`). Ne touche pas la base |
| `deploy.healthcheckTimeout` | `120` | Secondes laissées à la nouvelle version pour répondre |
| `deploy.overlapSeconds` | `"0"` | Recouvrement réduit au temps du démarrage (README, « En ligne ») |
| `deploy.drainingSeconds` | `"10"` | Délai entre `SIGTERM` et `SIGKILL` de l'ancienne version (lecture de l'architecture, 4.1 ; à vérifier dans la documentation de l'éditeur) |
| `deploy.restartPolicyType` | `ON_FAILURE` | Redémarre le service s'il sort en erreur |

Ce fichier est cité ailleurs : `README.md:60` (« `railway.json` décrit le service »), `docs/guides/comptes.md:7` (« `preDeployCommand` de `railway.json` »), `docs/guides/mcp-distant-essais.md:10` (même mention). Aucun code ni aucun test ne le lit (`grep -rn railway src` ne rend rien).

### 3.2 Ce que l'on sait du remplaçant

Note 02, section 5 (source officielle citée : `https://docs.railway.com/reference/config-as-code`) : « `railway.toml` et `railway.json` sont dépréciés, lus jusqu'au 2026-12-01 pour les services existants ; remplaçant `.railway/railway.ts` appliqué par `railway config apply` ». La note conseille de ne pas bâtir sur `railway.toml`.

Ce que la note ne dit pas, et qui est **à vérifier dans la documentation de l'éditeur** avant d'écrire la PR :

1. Le format de `.railway/railway.ts` : son import, ses champs, s'il décrit un service ou tout un projet.
2. Si `railway config apply` se lance à la main (poste ou CI) ou si Railway lit le fichier à chaque déploiement.
3. Ce que deviennent, au 1er décembre, les réglages d'un service dont `railway.json` dictait les valeurs : gardés, ou remis aux défauts.
4. Si un réglage du fichier de configuration l'emporte sur celui du tableau de bord tant que le fichier est lu.

Ce qui est sûr sans la documentation : chaque réglage du tableau 3.1 existe aussi dans les réglages du service, sur le tableau de bord de Railway (c'est là que `railway.json` les pose). La PR n° 0 prend donc le chemin qui ne dépend d'aucune réponse : **les réglages vivent dans le tableau de bord, service par service, et le README les recopie**. `.railway/railway.ts` n'entre dans le dépôt que si la lecture du jour confirme son format ; ce chapitre n'en donne pas le code, parce que je ne l'ai pas lu.

Raison de plus : un `railway.json` à la racine vaut pour tout service construit depuis ce dépôt. Dès la PR 2, `web` et `worker` ont des `drainingSeconds` différents (section 4). Un seul fichier à la racine ne peut pas les porter (un chemin de fichier par service existe peut-être : à vérifier, et sans objet après le 1er décembre).

### 3.3 Les gestes, dans l'ordre

Qui fait quoi. Le contenu de la PR (un fichier supprimé, trois textes) peut être écrit par un agent de code. Tout le reste se fait sur le tableau de bord de Railway et dans sa documentation, que ni un agent ni cette session n'atteignent : c'est **un humain qui a les droits sur le projet Railway (David ou Amos)** qui fait les gestes 1 à 3 et 5 à 8, et qui fusionne.

Le risque à couvrir : le déploiement que lance la fusion est le premier sans `railway.json`. S'il part avec des réglages remis aux défauts (question 3 de 3.2), il n'a ni pré-déploiement, ni bilan de santé, ni les drainages du tableau 3.1. Le code étant le même que celui qui tourne et la PR n'ayant aucune migration, le pire est court (quelques secondes où la nouvelle version reçoit du trafic avant d'être prête, des jobs en cours coupés comme aujourd'hui), mais rien ne doit partir sans que les neuf champs aient été relus.

**Premier temps, avant la fusion** (l'humain, sur le tableau de bord) :

1. Lire la page de la documentation citée en 3.2. Noter les réponses aux quatre questions dans la description de la PR, avec le lien et la date de lecture.
2. Ouvrir le service actuel, onglet des réglages. Prendre une capture des neuf champs du tableau 3.1 et la joindre à la PR. Pour chaque ligne, vérifier que la valeur affichée est celle du tableau. Noter les champs verrouillés par le fichier (« défini dans le code » ou équivalent).
3. Noter aussi, pour le tableau de la section 4 : la région du service, l'état de la mise en veille (« Serverless », ou ancien « App Sleeping » : à vérifier), le nombre de répliques, les domaines publics.

La PR (branche `<prenom>/railway-config`) :

4. Supprimer `railway.json`. Modifier les trois documents qui le citent (textes en 3.4).

**Second temps, la fusion, à un moment choisi** (hors des heures où les clients travaillent). Ce qui précède la fusion dépend de la réponse aux questions 3 et 4 :

| Réponse lue au geste 1 | 5. Avant de fusionner | 6. Juste après la fusion |
|---|---|---|
| Les réglages du tableau de bord sont **gardés** quand le fichier disparaît | rien de plus | relire les neuf champs |
| Remis aux défauts, ou la page ne le dit pas, mais le tableau de bord laisse **modifier** un champ verrouillé tant que le fichier est lu (question 4) | retaper chaque champ verrouillé sur le tableau de bord, à la valeur du tableau 3.1 | relire les neuf champs |
| Remis aux défauts (ou inconnu), et les champs restent **verrouillés** tant que le fichier existe | couper le déploiement automatique du service (déconnecter la branche, ou le réglage équivalent : à vérifier) | retaper les champs, les relire, rebrancher la branche, puis lancer un redéploiement à la main |
| Comme la ligne précédente, mais le déploiement automatique **ne se coupe pas** | rien : on fusionne hors des heures de travail | annuler le déploiement lancé par la fusion s'il est encore en construction (action à vérifier) ; retaper, relire, redéployer à la main. S'il est déjà en ligne : retaper, relire, redéployer aussitôt |

7. Contrôler le déploiement qui porte les réglages relus (section 15.1, gestes 6 à 8) : la phase de pré-déploiement apparaît dans son journal (`Base à jour.`, `src/server/db/migrate-cli.ts:11`), le bilan de santé passe, l'ancienne version s'arrête.
8. Prendre une seconde capture des neuf champs et la joindre à la PR, en commentaire.

Si la documentation confirme `.railway/railway.ts` et qu'on veut la configuration dans le dépôt, c'est une PR à part, après celle-ci, qui recopie le tableau de la section 4.

### 3.4 Les textes à changer

`README.md` (existe), section « En ligne (Railway) », premier point (`:60-61`). Remplacer :

```markdown
- Les réglages du service vivent sur le tableau de bord de Railway (`railway.json`, déprécié, a été retiré
  par la PR n° 0 du dossier des agents) : construction Railpack, `pnpm build` ; avant chaque mise en ligne, les migrations (`pnpm db:migrate`,
  avec `DATABASE_URL_ADMIN`) ; puis `pnpm start`, et `/api/health` pour savoir qu'il est prêt (délai 120 s) ;
  recouvrement 0 s, drainage 10 s, redémarrage en cas d'échec. Les valeurs sont recopiées dans
  `docs/etudes/agents-2026-11/dossier/13-infrastructure-et-mise-en-ligne.md`, section 4 : toute modification sur le
  tableau de bord passe aussi par une PR qui les met à jour ici.
```

`docs/guides/comptes.md:7` (existe) : « (`preDeployCommand` de `railway.json`) » devient « (commande de pré-déploiement du service Railway) ».

`docs/guides/mcp-distant-essais.md:10` (existe) : « (`preDeployCommand` de `railway.json`) » devient « (commande de pré-déploiement du service Railway) ».

Ce que l'autre vérifie à la relecture : les réponses du geste 1 et la capture du geste 2 sont dans la description de la PR, avec la ligne du tableau de 3.3 qui s'applique ; aucun fichier ne cite plus `railway.json` (`git grep -n railway.json -- ':!docs/etudes'` ne rend rien).

## 4. Les services Railway et leur configuration

Architecture, section 4 : deux services sur la même image d'abord, un troisième quand le service Rust existe. Une instance de chaque (« un seul worker par base »).

### 4.1 Le tableau des réglages

| Réglage (nom de `railway.json` quand il en a un) | `web` | `worker` | `porte` (après, chapitre 15) |
|---|---|---|---|
| Source | dépôt GitHub, branche `main` | idem | idem |
| Dossier racine | racine du dépôt | racine du dépôt | racine du dépôt : le contexte du Dockerfile contient `services/porte` (note 02, 8.3, à vérifier) |
| `builder` | `RAILPACK` | `RAILPACK` | Dockerfile : variable `RAILWAY_DOCKERFILE_PATH=services/porte/Dockerfile` (note 02, section 5 ; à vérifier) |
| `buildCommand` | `pnpm build` | `pnpm build` | sans objet (le Dockerfile construit) |
| `preDeployCommand` | `pnpm db:migrate` | `pnpm db:migrate` | aucune : la porte ne migre rien |
| `startCommand` | `pnpm start` | `pnpm start` ; si `SIGTERM` ne traverse pas `pnpm` (6.1, à vérifier au geste 8 de 15.2) : `node node_modules/next/dist/bin/next start` | le point d'entrée de l'image |
| `healthcheckPath` | `/api/health` | `/api/health` | `/sante` (architecture, section 6) |
| `healthcheckTimeout` | `120` | `120` | fixé au chapitre 15 |
| `overlapSeconds` | `"0"` | `"0"` | `"0"` |
| `drainingSeconds` | `"35"` (PR 2) ; `"10"` jusque-là | `"60"` | fixé au chapitre 15 |
| `restartPolicyType` | `ON_FAILURE` | `ON_FAILURE` | `ON_FAILURE` |
| Répliques | 1 | 1 | 1 |
| Mise en veille sans trafic (« Serverless », à vérifier) | coupée | **coupée** : le worker ne reçoit aucune requête et dormirait | coupée |
| Domaines publics | le domaine du site ; `porte.<domaine>` jusqu'à la bascule du chapitre 15 (section 11) | **aucun** | `porte.<domaine>` après la bascule |
| Région | celle du service actuel (geste 3 de 3.3) | la même | la même |
| Variable `LEON_ROLE` | `web` | `worker` | sans objet |
| Variable `NEXT_MANUAL_SIG_HANDLE` | absente | `true` (section 6) | sans objet |
| Attendre la CI avant de déployer (à vérifier) | oui, si l'option existe | oui | oui |
| Chemins surveillés (à vérifier, facultatif) | tout sauf `services/porte/**` et `docs/**` | idem | `services/porte/**` seulement |

Pourquoi ces valeurs :

- **Les deux services migrent** (architecture 4.1, règle 6). Railway construit et démarre `web` et `worker` séparément, à partir du même commit, sans ordre garanti. Celui qui arrive le premier applique les migrations ; l'autre attend le verrou consultatif (`pg_advisory_lock`, `migrate.ts:19`), puis ne trouve plus rien (`Base à jour.`). Aucun des deux ne démarre donc avec un code en avance sur le schéma. Le prix : `DATABASE_URL_ADMIN` est posée sur les deux services (section 9).
- **`drainingSeconds` du worker à 60.** `shutdown.ts` laisse 45 s aux jobs en cours, 5 s par crochet (l'écoute de `leon_porte`, après), 2 s de marge à pg-boss, puis 2,5 s au plus pour vider Sentry : 54,5 s au plus, sous les 60 (section 6.3). Le tic des vecteurs peut dépasser ces 45 s (45 s de lots plus l'appel au fournisseur, `src/server/pipeline/queue.ts:26-28`) : coupé, pg-boss le reprend à l'expiration du job (6.2), et sa file est `stately`, un seul tic à la fois.
- **Le bilan de santé ne sert qu'au déploiement** (à vérifier dans la documentation de l'éditeur), et `ON_FAILURE` ne redémarre qu'un processus sorti en erreur. Un worker vivant mais figé n'est vu par aucun des deux : c'est le rôle du pouls (section 13.2).
- **`drainingSeconds` de `web` à 35** : 30 s de délai HTTP d'une écriture au clic (`TIMEOUT_MS`, `src/server/connectors/http.ts:71`), plus une marge. Ce délai ne sert que si Next attend les requêtes en cours avant de sortir (section 6.1, à vérifier). `shutdown.ts` ne s'enregistre pas dans `web`.
- **`overlapSeconds` à 0** : comme aujourd'hui. L'ancienne version reçoit `SIGTERM` dès que la nouvelle passe son bilan de santé. Pendant le drainage, deux workers tournent : c'est admis (architecture 4.1, règle 5).
- **Aucun domaine pour le worker.** Il sert pourtant les pages, puisqu'il lance Next (architecture 4). Sans domaine, seul le bilan de santé de Railway l'atteint (à vérifier : que le bilan de santé passe sans domaine public).
- **Mise en veille coupée.** Un service sans trafic entrant peut être endormi par Railway si l'option est active (nom et défaut à vérifier). Endormi, le worker ne relève plus rien et aucun tic ne part.
- **Attendre la CI.** `tests.yml` tourne sur chaque poussée sur `main` (« c'est ce que Railway déploie », `.github/workflows/tests.yml:10-11`). Si Railway sait attendre que les vérifications GitHub passent (à vérifier), on l'active sur les deux services : un `main` rouge ne part pas.
- **Chemins surveillés.** Facultatif. Évite de reconstruire `web` et `worker` pour un commit qui ne touche que `docs/` ou `services/porte/`, et la porte pour un commit qui ne la touche pas. À n'activer qu'après avoir vu, dans la documentation, comment une règle d'exclusion s'écrit : une règle fausse empêcherait un déploiement.

### 4.2 Ce que coûte le second service

Railway facture 10 $ par Go de RAM et 20 $ par vCPU, par mois (note 02, section 5). Le worker lance un second processus Next : sa mémoire au repos s'ajoute à celle de `web`. Je n'ai aucune mesure de la mémoire de Leon en production. Le chiffre se lit dans les métriques du service actuel avant la bascule, puis dans celles des deux services une semaine après ; il va dans la description de la PR 2.

Chaque commit sur `main` est construit deux fois (une par service). La durée d'un build n'est pas mesurée ici.

### 4.3 Le troisième service

Le service `porte` n'existe que quand une des mesures de l'architecture (section 3) le demande, ou sur décision de David (question Q1). Le chapitre 15 écrit le Dockerfile, le binaire et la bascule du domaine. Ce chapitre fixe seulement sa place : réglages dans la colonne de droite du tableau 4.1, variables dans la section 9, connexions dans la section 8. Il ne lit aucune file et ne migre rien.

## 5. `LEON_ROLE` et `src/server/role.ts`

**Jalon 1, PR 2.** Architecture, section 4 : « `LEON_ROLE` (à créer, lue par `src/server/env.ts`, valeurs `web`, `worker`, `tout`, défaut `tout`) ». `tout` garde le comportement d'aujourd'hui pour le développement, les tests et le service unique d'avant la bascule.

### 5.1 `src/server/env.ts` (existe)

La liste des rôles vit dans `env.ts`, pas dans `role.ts` : `role.ts` lit `env`, et `env.ts` ne doit dépendre que de ses feuilles (`src/test/contracts/env-contract.test.ts:99-115` garde déjà ce principe pour les fournisseurs de vecteurs). Une liste dans `role.ts` fermerait le cycle `env` → `role` → `env`.

Après `emptyIsAbsent` (`:6`) :

```ts
// Ce que lance ce processus (dossier agents, chapitre 13). La liste vit ici : role.ts lit env, et env ne lit rien
// qui le lise à son tour.
export const LEON_ROLES = ['web', 'worker', 'tout'] as const;
export type LeonRole = (typeof LEON_ROLES)[number];
```

Dans `EnvSchema`, après `NEXT_PHASE` (`:45`) :

```ts
    // Le rôle du processus : web (pages, API, MCP, la porte en Hono ; met des jobs en file sans en lire), worker (toutes
    // les files et tous les tics) ou tout (les deux). Absent : tout, comme avant (développement, tests, service unique).
    // Un nom inconnu empêche le démarrage : « Worker » ne doit pas tout lancer en silence.
    LEON_ROLE: z.preprocess(
      emptyIsAbsent,
      z.enum(LEON_ROLES, { error: () => 'LEON_ROLE : web, worker ou tout' }).optional(),
    ),
```

Aucune règle croisée dans `superRefine` : un `tout` en production est permis (le service unique d'avant la bascule, section 15.2). `instrumentation-node.ts` le dit dans le journal (section 7).

### 5.2 `src/server/role.ts` (à créer), en entier

```ts
import { env, type LeonRole } from '@/server/env';

// Un code, une image, deux services Railway (dossier agents, architecture 4 ; chapitre 13). Le rôle dit ce que ce
// processus démarre. Il se relit à chaque appel, jamais gardé : les tests changent env d'un cas à l'autre.
export function leonRole(): LeonRole {
  return env.LEON_ROLE ?? 'tout';
}

// Vrai pour worker et tout : ce processus lit les files, lance les tics, ouvre le grand pool (db/client.ts) et
// s'arrête proprement sur SIGTERM (shutdown.ts). Faux pour web : il sert les requêtes et met des jobs en file.
export function runsWorkers(): boolean {
  return leonRole() !== 'web';
}
```

Qui l'appelle :

| Appelant | Ce qu'il en fait | Section |
|---|---|---|
| `src/instrumentation-node.ts` | démarre les `startXWorker` et enregistre l'arrêt propre seulement si `runsWorkers()` | 7 |
| `src/server/db/client.ts` | `max` du pool : 16 si `runsWorkers()`, 4 sinon | 8 |
| `src/sentry.server.config.ts` | ne l'importe pas (il se charge avant tout) : il lit `process.env.LEON_ROLE` | 13 |

`role.ts` n'est appelé par aucun module métier. Un module qui voudrait savoir s'il tourne dans `web` a un défaut de conception : ce qui ne doit tourner que dans le worker est un `boss.work`, et il est déjà gardé.

### 5.3 `.env.example` (existe)

La ligne du chapitre 01 (section 15.4), recopiée, après `BETTER_AUTH_URL` (`:6`). Elle entre dans la PR 2, avec le code qui la lit (le chapitre 01 la range dans la PR n° 0 : écart E13-1).

```bash
# Le rôle du processus : web (pages, API, la porte en Hono), worker (les files) ou tout (développement, tests). Vide : tout.
LEON_ROLE=
```

Et, dans le bloc des variables « posées par » (après `# RAILWAY_GIT_COMMIT_SHA=`, `:119`) :

```bash
# Posée sur le seul service worker de Railway (true) : Next laisse alors SIGTERM à Leon, qui attend la fin des jobs
# en cours avant de sortir (src/server/shutdown.ts). Jamais sur web, jamais en local.
# NEXT_MANUAL_SIG_HANDLE=
```

`env-contract.test.ts` lit `# NOM=` comme une variable documentée (`:17`, motif `^#?\s*…=`) et `process.env.NEXT_MANUAL_SIG_HANDLE` comme une variable lue (`:25`) : les deux sens tiennent.

## 6. L'arrêt propre : `src/server/shutdown.ts`

**Jalon 1, PR 2.** Le dépôt n'a aucun arrêt propre : ni `SIGTERM`, ni `process.on(`, ni `boss.stop` dans `src/server` hors tests (recherche du 20/11 : seul `src/test/briefing-points.ts:55` appelle `boss.stop()`). Architecture 4.1, règle 1 : sur `SIGTERM`, lever le drapeau `stopping`, puis `boss.stop({ graceful: true, timeout: 45_000 })`.

### 6.1 Pourquoi `NEXT_MANUAL_SIG_HANDLE`

Le worker lance Next (`pnpm start`, architecture 4). Or `next start` pose ses propres gestionnaires de `SIGTERM` et de `SIGINT`, qui ferment son serveur HTTP puis sortent du processus. Il ne les pose pas si la variable `NEXT_MANUAL_SIG_HANDLE` est vraie ; c'est alors au code de l'application de sortir. (Ce comportement est décrit dans la documentation de Next sur l'hébergement par soi-même, « Manual Graceful Shutdowns » ; je ne l'ai pas relu dans `node_modules/next/dist/server/lib/start-server.js` pour la 16.4.5 : **à vérifier** au premier essai, gestes 7 et 8 de 15.2.)

Encore faut-il que `SIGTERM` atteigne le processus Node. La commande de démarrage est `pnpm start` : `pnpm` lance le script `start` (`"next start"`, `package.json:14`), sans doute par un `sh -c`, et c'est le processus de Next qui doit recevoir le signal. Que `pnpm` le transmette à son enfant, et que le shell intermédiaire ne l'avale pas, **n'est pas vérifié** (ni pour `pnpm` 11.0.8, ni pour la façon dont Railpack lance la commande). Si le signal n'arrive pas, `shutdown.ts` ne s'exécute jamais, quelle que soit `NEXT_MANUAL_SIG_HANDLE`. Le geste 8 de 15.2 sépare les deux causes par ce que le journal montre (tableau en 15.2) ; si c'est le signal, la commande de démarrage du seul `worker` devient `node node_modules/next/dist/bin/next start` (le binaire local de Next, sans `pnpm` ni shell ; chemin à vérifier dans le paquet).

Si les deux gestionnaires tournent, celui de Next sort dès que son serveur HTTP est fermé. Dans le worker, qui ne sert que le bilan de santé, c'est immédiat : `boss.stop` serait coupé au milieu. D'où :

| Service | `NEXT_MANUAL_SIG_HANDLE` | Qui gère `SIGTERM` | Ce qui se passe |
|---|---|---|---|
| `worker` | `true` (variable Railway) | `shutdown.ts` seul | Le moteur ne commence plus d'étape, pg-boss cesse de prendre des jobs après les crochets, les jobs en cours finissent (45 s au plus), Sentry est vidé, puis `process.exit(0)` |
| `web` | absente | Next seul | Next ferme son serveur HTTP (les requêtes en cours, dont un clic qui écrit, finissent si Next les attend : à vérifier), puis sort. `shutdown.ts` n'est pas enregistré : `web` ne lit aucune file |
| `tout` (local, tests, service unique d'avant la bascule) | absente | les deux | Comme aujourd'hui : Next sort vite. `registerShutdown` prévient dans le journal en production |

La documentation de Next demande de poser la variable dans le script de démarrage, pas dans un fichier `.env`, parce que Next lit ses fichiers `.env` trop tard. Une variable de service Railway est une vraie variable du processus dès son lancement : elle convient (à vérifier, gestes 7 et 8 de 15.2). On ne la met pas dans le script `start` de `package.json` : elle s'appliquerait aussi à `web`, qui perdrait l'arrêt de Next.

### 6.2 La séquence

| Instant | Ce qui se passe | Qui |
|---|---|---|
| 0 | Railway envoie `SIGTERM` à l'ancien worker (la nouvelle version a passé son bilan de santé) | Railway |
| 0 | `stoppingSignal` est levé. Le moteur ne commence plus d'étape ; un appel au modèle en cours est annulé par ce signal, son étape reste `intention` ; l'exécution passe `en-attente`, `reveil_le = now()` (chapitre 04, 5.1, ligne `SIGTERM`) | `shutdown.ts`, moteur |
| 0 à 5 s par crochet | Les crochets inscrits par `onShutdown`, dans l'ordre : après les webhooks, l'arrêt de l'écoute de `leon_porte` (chapitre 03, 8.3) | `shutdown.ts` |
| puis, 45 s au plus | `boss.stop` : pg-boss ne prend plus de job ; les jobs en cours finissent. Une écriture déjà partie a ses 30 s (`TIMEOUT_MS`). Jusque-là, les lecteurs pg-boss (indexation, relève, point du matin…) peuvent encore prendre un job : seul le moteur a cessé de commencer | `stopBoss` |
| puis | `[leon] arrêt fini en … ms` | `shutdown.ts` |
| puis, 2,5 s au plus | `Sentry.flush` : les erreurs journalisées pendant l'arrêt (`shutdown.hook`, `shutdown.queues`) partent avant la sortie ; sans lui, `process.exit` les perdrait (`logError` ne fait que les mettre en file, `src/server/log.ts:37-41`). Puis `process.exit(0)` | `shutdown.ts` |
| 60 s | `SIGKILL` si le processus vit encore | Railway |

Un second `SIGTERM` (ou un second appel à `stop`) sort tout de suite, code 1.

Ce que deviennent les jobs des workers existants, qui ne lisent pas le signal :

| Job | S'il finit en 45 s | S'il est coupé |
|---|---|---|
| `pipeline-index`, tics des vecteurs et de reprise | fini | pg-boss le reprend à l'expiration du job ; le run reste `running` jusque-là (délai d'expiration par défaut de pg-boss : à vérifier) |
| `connector-sync` (relève) | fini | job expiré après 1 800 s (`src/server/connectors/worker.ts:10`) ; la connexion garde son verrou `sync_lock_at` 30 minutes (`0019-corrections-audit.sql:62`) : sa relève suivante attend jusqu'à 30 minutes. L'ingestion est idempotente : rien n'est perdu ni doublé |
| point du matin, résumés, fils | fini | repris à l'expiration du job ; un appel au modèle déjà payé est refait |
| `agent-executer` | rend la main tout de suite (`en-attente`, `reveil_le = now()`) | sans objet : le moteur lit le signal |

Après le jalon 1 : passer `stoppingSignal` à `runConnectorSync` pour qu'une relève s'arrête entre deux pages et rende `sync_lock_at`. Le signal est là ; c'est une PR de connecteurs, hors de ce chapitre.

### 6.3 Le budget de temps

| Étape | Plafond | Constante |
|---|---|---|
| Crochets | 5 s chacun ; un seul prévu (l'écoute de `leon_porte`) | `HOOK_TIMEOUT_MS` |
| Jobs en cours | 45 s | `QUEUES_STOP_TIMEOUT_MS` |
| Marge au-delà du délai de pg-boss | 2 s | `QUEUES_STOP_MARGIN_MS` |
| Vidage de Sentry | 2 s, plus 0,5 s de marge | `FLUSH_TIMEOUT_MS`, `FLUSH_MARGIN_MS` |
| **Total** | **54,5 s**, sous les 60 s de `drainingSeconds` du worker | |

Un crochet de plus coûte 5 s : dès le second crochet (59,5 s), relever `drainingSeconds` du worker dans la même PR.

### 6.4 Le code, en entier

```ts
// src/server/shutdown.ts (à créer)
import * as Sentry from '@sentry/nextjs';
import { logError } from '@/server/log';
import { stopBoss } from '@/server/pipeline/queue';

// L'arrêt propre du processus qui lit les files (dossier agents, architecture 4.1 ; chapitre 13, section 6).
// Railway envoie SIGTERM à l'ancienne version dès que la nouvelle passe son bilan de santé, puis SIGKILL après
// drainingSeconds (60 s pour le service worker). Entre les deux : ne plus rien commencer, laisser finir ce qui tourne,
// sortir avant SIGKILL.
// Next sort de lui-même sur SIGTERM, sans attendre les jobs, sauf si NEXT_MANUAL_SIG_HANDLE est posée : le service
// worker la pose. Le service web ne l'a pas et garde l'arrêt de Next ; il ne lit aucune file, ce module n'y est pas
// enregistré (instrumentation-node.ts : seulement si runsWorkers()).

// Le temps laissé aux jobs en cours. Avec un crochet, la marge et le vidage de Sentry, l'arrêt tient en 54,5 s, sous
// les 60 s de drainage du service worker : changer l'un, c'est changer l'autre (chapitre 13, tableau 4.1).
export const QUEUES_STOP_TIMEOUT_MS = 45_000;
// Chaque crochet (l'écoute de leon_porte) a ce temps au plus : un crochet bloqué ne prend pas celui des jobs.
export const HOOK_TIMEOUT_MS = 5_000;
// Au-delà de son propre délai, on attend encore pg-boss ce temps-là, puis on sort quand même.
const QUEUES_STOP_MARGIN_MS = 2_000;
// logError ne fait que mettre l'événement en file dans le SDK de Sentry : sans vidage, process.exit perdrait
// justement les erreurs de l'arrêt (shutdown.hook, shutdown.queues). Sentry a ce temps, plus la marge.
export const FLUSH_TIMEOUT_MS = 2_000;
const FLUSH_MARGIN_MS = 500;

export class ShutdownTimeout extends Error {
  override name = 'ShutdownTimeout';
  constructor(readonly step: string) {
    super(`Shutdown step timed out: ${step}`);
  }
}

export type ShutdownDeps = {
  // Arrête la lecture des files et attend les jobs en cours, timeoutMs au plus (stopBoss en production).
  stopQueues(timeoutMs: number): Promise<void>;
  // Envoie ce que Sentry garde en file, timeoutMs au plus (Sentry.flush en production).
  flush(timeoutMs: number): Promise<void>;
  exit(code: number): void;
  now(): number;
};

export type Shutdown = {
  // Levé au premier signal. Le moteur d'agents le regarde avant chaque étape et annule par lui l'appel en cours
  // (chapitre 04, EngineDeps.stopping).
  readonly signal: AbortSignal;
  // Inscrit un geste à faire avant d'arrêter les files, dans l'ordre d'inscription. Ignoré une fois l'arrêt commencé.
  onShutdown(name: string, run: () => Promise<void>): void;
  // Le premier appel arrête, puis sort (code 0). Un second appel (un second signal) sort tout de suite, code 1 : en
  // local, un second Ctrl+C n'attend pas 45 s.
  stop(reason: string): Promise<void>;
};

// Rend la main quand `work` finit, ou lève ShutdownTimeout après `ms` (même forme qu'embedQuery, search/search.ts).
async function bounded(step: string, work: () => Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ShutdownTimeout(step)), ms);
  });
  try {
    // Promise.resolve().then : une fonction qui lève tout de suite devient un rejet, pas une exception ici.
    await Promise.race([Promise.resolve().then(work), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createShutdown(deps: ShutdownDeps): Shutdown {
  const controller = new AbortController();
  const hooks: Array<{ name: string; run: () => Promise<void> }> = [];
  let running: Promise<void> | null = null;

  async function run(reason: string): Promise<void> {
    const started = deps.now();
    controller.abort(new Error(`stopping: ${reason}`));
    // Le moteur cesse tout de suite (il lit le signal) ; pg-boss ne cesse de prendre des jobs qu'après les crochets.
    console.info(`[leon] arrêt demandé (${reason}) : le moteur ne commence plus d'étape.`);
    for (const hook of hooks) {
      await bounded(hook.name, hook.run, HOOK_TIMEOUT_MS).catch((error) =>
        logError('shutdown.hook', error, { hook: hook.name }),
      );
    }
    await bounded(
      'files',
      () => deps.stopQueues(QUEUES_STOP_TIMEOUT_MS),
      QUEUES_STOP_TIMEOUT_MS + QUEUES_STOP_MARGIN_MS,
    ).catch((error) => logError('shutdown.queues', error));
    console.info(`[leon] arrêt fini en ${deps.now() - started} ms.`);
    await bounded(
      'sentry',
      () => deps.flush(FLUSH_TIMEOUT_MS),
      FLUSH_TIMEOUT_MS + FLUSH_MARGIN_MS,
    ).catch(() => console.error('[leon] shutdown.flush : Sentry n’a peut-être pas tout reçu.'));
    deps.exit(0);
  }

  return {
    signal: controller.signal,
    onShutdown(name, work) {
      if (!controller.signal.aborted) hooks.push({ name, run: work });
    },
    stop(reason) {
      if (running) {
        deps.exit(1);
        return running;
      }
      running = run(reason);
      return running;
    },
  };
}

// Une instance par processus, sur globalThis : Next compile ce module en plusieurs copies (comme db/client.ts), et le
// moteur doit lire le signal même que SIGTERM lève.
const globalForShutdown = globalThis as typeof globalThis & {
  leonShutdown?: Shutdown;
  leonShutdownRegistered?: boolean;
};
globalForShutdown.leonShutdown ??= createShutdown({
  stopQueues: (timeoutMs) => stopBoss({ timeoutMs }),
  // Sentry.flush rend false quand le délai passe : rien à faire de plus, on sort.
  flush: async (timeoutMs) => {
    await Sentry.flush(timeoutMs);
  },
  exit: (code) => process.exit(code),
  now: () => Date.now(),
});
const shutdown = globalForShutdown.leonShutdown;

// Le signal d'arrêt du moteur d'agents (chapitre 04 : startAgentsWorker({ …, stopping: stoppingSignal })).
export const stoppingSignal: AbortSignal = shutdown.signal;

// Le drapeau `stopping` de l'architecture (4.1) : vrai dès le premier SIGTERM.
export function isStopping(): boolean {
  return shutdown.signal.aborted;
}

// Un geste à faire avant d'arrêter les files : l'arrêt de l'écoute de leon_porte (chapitre 03), inscrit par
// instrumentation-node.ts après startWebhooksWorker.
export function onShutdown(name: string, run: () => Promise<void>): void {
  shutdown.onShutdown(name, run);
}

// Branche SIGTERM. Appelée par instrumentation-node.ts dans un processus qui lit les files, avant le premier worker ;
// idempotente (le rechargement à chaud réexécute register()). `target` : process, ou un faux dans les tests.
// SIGINT n'est pas pris : en local, Ctrl+C garde le comportement de Next.
export function registerShutdown(target: Pick<NodeJS.Process, 'on'> = process): void {
  if (globalForShutdown.leonShutdownRegistered) return;
  globalForShutdown.leonShutdownRegistered = true;
  // Sans elle, Next sort sur SIGTERM dès son serveur HTTP fermé : les jobs en cours sont coupés (section 6.1).
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_MANUAL_SIG_HANDLE) {
    console.warn(
      '[leon] NEXT_MANUAL_SIG_HANDLE absente : Next coupera ce processus sans attendre ses jobs.',
    );
  }
  target.on('SIGTERM', () => {
    shutdown.stop('SIGTERM').catch(() => process.exit(1));
  });
}
```

Choix de forme, et pourquoi :

- **`createShutdown(deps)`** porte toute la logique, sans `process` : c'est lui que les tests appellent (section « Tests à écrire »). L'instance du module n'est qu'un branchement.
- **`stoppingSignal` et `isStopping()`** : le chapitre 04 attend `stoppingSignal` (`04-le-moteur.md`, 11.3, et écart E04-13, qui propose d'exporter « le drapeau et le signal ») ; l'architecture parle d'un drapeau `stopping`. Les deux lisent le même `AbortController`.
- **`onShutdown`** plutôt qu'un appel direct à `stopPorteListener` : `shutdown.ts` n'importe ainsi aucun module qui n'existe pas encore à la PR 2. C'est `instrumentation-node.ts` qui inscrit l'arrêt de l'écoute (section 7.2 ; écart E13-4 avec le chapitre 03).
- **Pas de fermeture du pool `pg`** : `process.exit` coupe les sockets, Postgres le voit. Fermer le pool avant d'avoir la certitude qu'aucun job ne tourne ferait échouer ce job.
- **Sortie en code 0** même si un crochet ou pg-boss ont échoué : l'erreur est dans le journal et dans Sentry (`logError`, puis le vidage par `deps.flush` avant `exit`). Une ancienne version n'est jamais redémarrée par Railway, quel que soit son code (à vérifier).
- **Le vidage de Sentry vient après `arrêt fini`** : la ligne du journal part même si Sentry est injoignable, et le vidage est borné (2,5 s) comme le reste. Un vidage raté ne s'écrit que dans le journal : le confier à Sentry n'aurait pas de sens.
- **`SIGINT` n'est pas pris** : en local, Next garde la main sur Ctrl+C.

### 6.5 `stopBoss` dans `src/server/pipeline/queue.ts` (existe)

`shutdown.ts` ne doit pas appeler `getBoss()` : dans un processus où pg-boss n'a jamais démarré, `getBoss()` le démarrerait pour l'arrêter. Après `getBoss` (`:109-115`) :

```ts
// L'arrêt propre (src/server/shutdown.ts) : pg-boss ne prend plus de job, laisse finir ceux en cours `timeoutMs` au
// plus, puis ferme ses connexions. Rien à faire s'il n'a jamais démarré dans ce processus.
// Le singleton n'est pas remis à zéro : un getBoss() pendant l'arrêt doit trouver le boss arrêté (et échouer), pas en
// démarrer un neuf.
export async function stopBoss(options: { timeoutMs: number }): Promise<void> {
  const starting = globalForBoss.leonBoss;
  if (!starting) return;
  const boss = await starting.catch(() => null);
  if (!boss) return;
  // `graceful` et `close` existent en 12.37.1 (pipeline/queue.db.test.ts:27). `timeout` et `wait` : à vérifier dans les
  // types de la 12.38.2 (PR 1) ; `close` vaut true par défaut (à vérifier).
  await boss.stop({ graceful: true, timeout: options.timeoutMs, wait: true });
}
```

La PR 1 (section 14) prouve, sur la 12.38.2, que cet appel attend un job en cours et qu'il rend la main à son délai.

## 7. `src/instrumentation-node.ts` (existe)

Aujourd'hui (`:3-55`) : valide l'environnement, sort pendant `next build` (`:7`), choisit le fournisseur de vecteurs (`:15`) et le modèle (`:26`), puis démarre sans condition six workers et, si `LEON_CONNECTORS_KEY` est posée, la relève (`:46-51`) ; enfin `warnIncompleteOAuthPairs()` (`:53-54`). `src/instrumentation.ts:3-11` l'appelle après avoir chargé Sentry.

### 7.1 Le fichier après la PR 2, en entier

Ce qui change : la lecture du rôle, l'avertissement d'un `tout` en production, la garde `runsWorkers()` autour des démarrages, et `registerShutdown()` avant le premier worker. Le choix du fournisseur de vecteurs et du modèle reste hors de la garde : `web` cherche avec le même fournisseur et répond avec le même modèle, et un réglage faux doit l'empêcher de démarrer lui aussi (test existant « échoue franchement au démarrage avec LEON_EMBEDDINGS=… »).

```ts
// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // Un code, deux services (dossier agents, chapitre 13) : web sert les requêtes et met des jobs en file, worker lit les
  // files. Le rôle est écrit au démarrage : deux services réglés pareil par erreur se voient dans leurs journaux.
  const { leonRole, runsWorkers } = await import('@/server/role');
  console.info(`[leon] rôle du processus : ${leonRole()}.`);
  if (leonRole() === 'tout' && env.NODE_ENV === 'production') {
    console.warn(
      '[leon] LEON_ROLE absente en production : ce processus sert les requêtes et lit les files.',
    );
  }
  // L'indexation de la recherche ne dépend d'aucun modèle : ni de la clé Anthropic, ni d'aucun appel au modèle.
  // Le plein texte tourne seul ; les vecteurs s'ajoutent dès qu'un fournisseur est réglé (LEON_EMBEDDINGS).
  // Elle démarre avant la relève des connecteurs, qui met des jobs dans sa file dès son premier passage.
  const { getEmbedder } = await import('@/server/embeddings/registry');
  // Échec franc, comme pour une variable d'environnement invalide, si le fournisseur réglé n'existe pas encore
  // (Voyage, Mistral et bge-m3 arrivent avec T30) : un fournisseur nul après un simple avertissement laisserait
  // la recherche en plein texte seul sans que personne le voie. Vrai aussi dans web, qui cherche avec ce fournisseur.
  const embedder = getEmbedder(env);
  if (!embedder) {
    console.info('[leon] LEON_EMBEDDINGS absente : la recherche se fait par le texte seul.');
  }
  const { getLlm } = await import('@/server/llm/get-llm');
  const llm = getLlm(env);
  if (!llm) {
    console.info('[leon] ANTHROPIC_API_KEY absente : les points du matin ne sont pas préparés.');
  }
  if (runsWorkers()) {
    // Avant le premier worker : un SIGTERM tombé pendant le démarrage trouve déjà l'arrêt propre (shutdown.ts).
    const { registerShutdown } = await import('@/server/shutdown');
    registerShutdown();
    const { startSearchWorker } = await import('@/server/search/worker');
    await startSearchWorker({ embedder });
    // Le point du matin (T13) : un appel au modèle par recalcul. Sans modèle, son worker démarre quand même et termine
    // chaque job sans rien faire (aucune reprise en boucle) : la route et l'outil MCP disent alors qu'aucun modèle
    // n'est réglé, et ne mettent rien en file. Avant la relève, comme l'indexation : l'indexation y signale les
    // projets touchés.
    const { startBriefingWorker } = await import('@/server/briefing/worker');
    await startBriefingWorker({ llm });
    // Le résumé des sessions (T23) : comme le point du matin, sans modèle chaque job finit sans rien faire.
    const { startResumeWorker } = await import('@/server/sessions/resume-worker');
    await startResumeWorker({ llm });
    // Le rangement des sessions en fils (T40, T41) : par les clés de leurs faits, sinon par le vecteur de leur résumé
    // avec le fournisseur de l'indexation ; sans modèle.
    const { startThreadsWorker } = await import('@/server/sessions/threads');
    await startThreadsWorker({ embedder });
    // La liaison des sources aux fils (T42) : par leurs clés exactes, sinon par la proximité de leurs vecteurs.
    const { startThreadLinksWorker } = await import('@/server/sessions/thread-links');
    await startThreadLinksWorker({ embedder });
    // L'état des fils (T43) : par le modèle après un résumé nouveau ; sans modèle, la liste déterministe.
    const { startFilStateWorker } = await import('@/server/sessions/thread-state-worker');
    await startFilStateWorker({ llm });
    // La relève des connecteurs a besoin de sa propre clé, celle qui déchiffre les clés des outils.
    if (env.LEON_CONNECTORS_KEY) {
      const { startConnectorWorker } = await import('@/server/connectors/worker');
      await startConnectorWorker();
    } else {
      console.warn('[leon] LEON_CONNECTORS_KEY absente : les connecteurs ne tournent pas.');
    }
  }
  // Une paire d'appli OAuth à moitié remplie désactive le bouton sans rien dire : on le dit (web comme worker).
  const { warnIncompleteOAuthPairs } = await import('@/server/connectors/oauth-env');
  warnIncompleteOAuthPairs();
}
```

`env.NODE_ENV` est déjà dans le schéma (`src/server/env.ts:43`). L'avertissement « `LEON_CONNECTORS_KEY` absente » ne sort plus dans `web` : la clé y sert pourtant (brancher un outil, lire en direct, écrire au clic). Le tableau de la section 9 la pose sur les deux services ; la page Connexions dit déjà, dans `web`, qu'on ne peut rien brancher sans elle (`.env.example:58-59`).

### 7.2 La forme après le jalon 1, pour situer les lignes des autres chapitres

Les lignes marquées ne sont pas de ce chapitre : chacune entre avec la PR qui l'écrit. Toutes vont **dans** le bloc `if (runsWorkers())`, dans cet ordre (le chapitre 04 place les agents après l'état des fils ; le chapitre 02 place le standard après les agents et avant la relève).

```ts
    // … startFilStateWorker({ llm }), comme en 7.1 …

    // Chapitre 04, PR 6b (11.3) : le moteur d'agents, avec le signal d'arrêt de shutdown.ts.
    const { startAgentsWorker } = await import('@/server/agents/worker');
    const { stoppingSignal } = await import('@/server/shutdown');
    await startAgentsWorker({ llm, embedder, actions: null, stopping: stoppingSignal });

    // Chapitre 02, PR 5 (section 8) : le standard. PR 5a : startStandardWorker({}) ; PR 5b : avec `engine`.
    const { startStandardWorker } = await import('@/server/standard/worker');
    await startStandardWorker({ engine });

    if (env.LEON_CONNECTORS_KEY) {
      const { startConnectorWorker } = await import('@/server/connectors/worker');
      await startConnectorWorker();
      // Chapitre 03, après le jalon 1 (8.4) : les webhooks. Ce chapitre ajoute la ligne onShutdown : l'écoute de
      // leon_porte s'arrête avant pg-boss (section 6.2).
      const { startWebhooksWorker, stopPorteListener } = await import('@/server/webhooks/worker');
      await startWebhooksWorker();
      const { onShutdown } = await import('@/server/shutdown');
      onShutdown('porte.ecoute', stopPorteListener);
    } else {
      console.warn('[leon] LEON_CONNECTORS_KEY absente : les connecteurs ne tournent pas.');
    }
```

D'où vient `engine` : le chapitre 04 le dit (« `createPgbossEngine()`, construit là où `startStandardWorker` est démarré », 11.3). Ce chapitre ne le refait pas.

## 8. Les pools et le calcul des connexions Postgres

**Jalon 1, PR 2.** Architecture, section 4 : `web` 4 + 2 (porte en Hono) + 2 (pg-boss) + 1 (écoute) = 9 ; `worker` 16 + 2 + 1 + 1 (écoute de `leon_porte`) = 20 ; total 29, 58 pendant le recouvrement.

### 8.1 `src/server/db/client.ts` (existe), après la PR 2

Aujourd'hui (`:5-15`) : un pool de 4, sans délai d'attente (`pg` attend une connexion libre sans limite de temps), sans écouteur `error`. Le chapitre 03 y ajoutera `portePool` (sa section « `src/server/db/client.ts` », après le jalon 1) ; ce chapitre change le pool de l'app.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import { logError } from '../log';
import { runsWorkers } from '../role';

// Rangé sur globalThis, en production aussi : Next compile ce module en plusieurs copies (tâches de fond, route
// API, pages), et chacune ouvrirait sinon son propre pool. En développement, le rechargement à chaud non plus.
const globalForPool = globalThis as { leonPool?: Pool };

// Connexions du pool de l'app, selon le rôle du processus (dossier agents, chapitre 13, section 8). Le worker en prend
// 16 : une trentaine de jobs à la fois au cumul des files, chacun ne tenant une connexion que le temps d'une requête ou
// d'une transaction courte (jamais pendant un appel au modèle ou à un outil). web en garde 4. S'y ajoutent pg-boss (2,
// plus 1 d'écoute, pipeline/queue.ts), la porte en Hono (2, web) et l'écoute de leon_porte (1, worker) : 9 pour web,
// 20 pour worker, le double pendant une mise en ligne. RDS (db.t4g.small) en accepte ~200.
export const poolMax = (workers: boolean): number => (workers ? 16 : 4);
// Au-delà, `pg` lève au lieu d'attendre sans fin une connexion libre : un pool saturé se voit dans le journal.
const CONNECTION_TIMEOUT_MS = 10_000;

globalForPool.leonPool ??= new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax(runsWorkers()),
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});
// Une connexion inactive que la base coupe (redémarrage de RDS, coupure du réseau) émet `error` sur le pool ; sans
// écouteur, le processus tombe (documentation de pg, à vérifier pour la 8.23.1). Un seul écouteur, même si le module
// est réimporté.
if (globalForPool.leonPool.listenerCount('error') === 0) {
  globalForPool.leonPool.on('error', (error) => logError('db.pool', error));
}
export const pool = globalForPool.leonPool;

export const db = drizzle({ client: pool });
```

`log.ts` n'importe que `@sentry/nextjs` et `drizzle-orm` (`src/server/log.ts:1-2`) : pas de cycle. `role.ts` n'importe que `env` : pas de cycle non plus. Le commentaire `shortcut:` de la ligne 11 (« relever quand le débit des tâches le demande ») disparaît : c'est fait.

En `tout` (développement, tests), le pool monte aussi à 16. Les connexions s'ouvrent à la demande : la base locale en accepte 300 (`docker-compose.yml`, carte 08), celle de la CI 100 par défaut (image `pgvector/pgvector:pg17`, défaut de Postgres) ; les tests ne tiennent jamais 16 requêtes à la fois par fichier.

### 8.2 Le compte

| Connexion | Rôle Postgres | Où (existe ou chapitre) | `web` | `worker` | `porte` (Rust) |
|---|---|---|---|---|---|
| Pool de l'app `pool` | `leon_app` | `src/server/db/client.ts` | 4 | 16 | |
| pg-boss, `max: 2` | `leon_app` | `src/server/pipeline/queue.ts:91` | 2 | 2 | |
| Écoute de pg-boss (`useListenNotify`, hors `max`) | `leon_app` | `src/server/pipeline/queue.ts:92-95` | 1 | 1 | |
| `portePool` | `leon_porte` | chapitre 03, si `DATABASE_URL_PORTE` est posée | 2 (après) | 0 : variable absente | |
| Écoute de `leon_porte` (`listenPorte`, `new Client`) | `leon_app` | chapitre 03, 8.3 | | 1 (après) | |
| Pool du service Rust | `leon_porte` | chapitre 15 | | | 5 |
| Pré-déploiement (`runMigrations`, `new Client`) | `leon_owner` | `src/server/db/migrate.ts:16` | 1, le temps de la migration | 1 | |

`web` ouvre pg-boss lui aussi : il met des jobs en file (`getBoss()`, démarré à la première mise en file). Son écoute ne lui sert à rien, puisqu'il ne lit aucune file ; la couper demanderait `useListenNotify: runsWorkers()` dans `startBoss`, une ligne. Je la laisse au compte de l'architecture, et je ne la change pas ici : une connexion de plus ne pèse rien devant 200.

| Moment | `web` | `worker` | `porte` | Total en régime | Pendant une mise en ligne |
|---|---|---|---|---|---|
| Aujourd'hui (un service) | 7 | | | 7 | 14 (README, « En ligne ») |
| Après la bascule, jalon 1 (pas de webhooks) | 7 | 19 | | 26 | 52, plus 2 de pré-déploiement |
| Après les webhooks (porte en Hono) | 9 | 20 | | 29 | 58, plus 2 |
| Avec le service Rust | 7 (rend ses 2) | 20 | 5 | 32 | 64 si les trois se recouvrent ; la porte se déploie à part, donc 59 au plus en pratique |

Ce que RDS accepte : « ~200 », d'après le commentaire `shortcut:` de `client.ts:11`. Le chiffre se vérifie en une commande (section 15.1, geste 8). La marge reste large : on peut monter le pool du worker à 24 sans approcher la limite.

### 8.3 Le signe qu'il faut monter

`connectionTimeoutMillis` fait lever `pg` quand aucune connexion ne se libère en 10 s (message de `pg` : à vérifier ; il passe par `safeErrorSummary`, qui garde le nom de l'erreur et ses champs de diagnostic, `src/server/log.ts:23-28`). Un job qui lève ainsi est repris par pg-boss. Si ces erreurs apparaissent plus d'une fois par jour dans Sentry (étiquette `role = worker`), monter `poolMax(true)` de 16 à 24 dans une PR, et vérifier d'abord qu'aucune transaction ne reste ouverte pendant un appel au modèle ou à un outil (architecture, section 4) : c'est la cause probable, pas la taille.

## 9. Les variables de chaque service

Règle : chaque service ne reçoit que ce qu'il lit. Une valeur qui doit être **identique** sur deux services (clés de chiffrement, fournisseur de vecteurs, modèles) se pose une fois, en variable partagée du projet Railway, et chaque service y renvoie (mécanisme et syntaxe des variables partagées : à vérifier dans la documentation de l'éditeur). À défaut, on la recopie, et le geste 6 de 15.2 compare les deux listes.

Légende : **oui** (posée), **—** (absente), **après** (posée avec la PR qui la lit).

| Variable | `web` | `worker` | `porte` (Rust) | Valeur ou source | Pourquoi |
|---|---|---|---|---|---|
| `DATABASE_URL` | oui | oui | — | `postgres://leon_app:…@<hôte RDS>:5432/leon?sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem` (README, « En ligne ») | Obligatoire (`env.ts:32`) |
| `DATABASE_URL_ADMIN` | oui | oui | — | rôle `leon_owner`, même forme | Lue par le seul pré-déploiement (`migrate-cli.ts:4`). Les deux services migrent (4.1) |
| `DATABASE_URL_PORTE` | après | **—** | après la bascule | rôle `leon_porte`, même forme (section 10) | La porte en Hono tourne dans `web`. Le worker n'en a pas besoin : il ne doit pas l'avoir. Retirée de `web` après la bascule du chapitre 15 |
| `BETTER_AUTH_SECRET` | oui | oui | — | partagée | Obligatoire au démarrage (`env.ts:33`) |
| `BETTER_AUTH_URL` | oui | oui | — | l'adresse publique du site, partagée | Obligatoire ; le worker bâtit les liens des e-mails |
| `NODE_ENV` | `production` | `production` | — | | Refuse `LEON_LLM=factice` et exige `LEON_IP_HEADER` (`env.ts:101`, `:111`) |
| `LEON_IP_HEADER` | `x-real-ip` | `x-real-ip` | — | `README.md:74-75` : « le proxy de Railway le remplace par l'adresse du client » ; non essayé, vérifié avant les webhooks (section 11, geste 6) | Exigée en production par `env.ts:111-122`, même dans le worker qui ne la lit pas. La limite de débit de la porte par adresse IP en dépend (chapitre 03, 6.1) |
| `LEON_ROLE` | `web` | `worker` | — | | Section 5 |
| `NEXT_MANUAL_SIG_HANDLE` | **—** | `true` | — | | Section 6.1 |
| `ANTHROPIC_API_KEY` | oui | oui | — | partagée | `web` répond ; le worker prépare les points, les résumés, les agents |
| `LEON_MODEL_REPONSE`, `_DISCUSSION`, `_POINT`, `_RESUME`, `_FIL`, `_AGENDA` | oui | oui | — | partagées, vides par défaut | La validation croisée d'OpenRouter (`env.ts:124-137`) doit voir les mêmes valeurs des deux côtés |
| `LEON_MODEL_TRI`, `_LECTURE`, `_DECISION`, `_REDACTION` | après (PR 3) | après (PR 3) | — | partagées | Chapitre 11 |
| `OPENROUTER_API_KEY` | oui | oui | — | partagée | Idem |
| `LEON_EMBEDDINGS`, `LEON_EMBEDDINGS_MODEL`, `VOYAGE_API_KEY`, `MISTRAL_API_KEY`, `LEON_BGE_URL` | oui | oui | — | **partagées, identiques** | `web` vectorise la question, le worker les passages : deux modèles différents effaceraient les vecteurs l'un de l'autre (README, « Une instance, un modèle »). Les changer suit la règle 6 de 15.3 |
| `LEON_CONNECTORS_KEY` | oui | oui | — | **partagée, identique** | `web` chiffre une clé collée, le worker la déchiffre pour relever |
| `LEON_OAUTH_<OUTIL>_ID`, `_SECRET`, `LEON_OAUTH_GITHUB_APP` | oui | oui | — | partagées | `web` mène le branchement ; le worker renouvelle les jetons (`ensureFreshTokens`), ce qui demande l'identifiant et le secret de l'appli |
| `LEON_OAUTH_HUBSPOT_SECRET` | oui | oui | après la bascule | partagée | La porte vérifie la signature v3 de HubSpot avec le secret de l'appli (chapitre 03, section « `.env.example` ») |
| `PIPEDREAM_PROJECT_ID`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_ENVIRONMENT` | oui | oui | — | partagées | Branchement dans `web`, relève dans le worker |
| `RESEND_API_KEY`, `LEON_EMAIL_FROM` | oui | oui | — | partagées | `web` : comptes, invitations. Worker : le récapitulatif (chapitre 07, après le jalon 1) |
| `GOOGLE_CLIENT_ID`, `_SECRET`, `MICROSOFT_CLIENT_ID`, `_SECRET` | oui | — | — | | Boutons de connexion : pages de `web` seulement |
| `LEON_ADMINS` | oui | — | — | | `/admin`, une page de `web` |
| `SENTRY_DSN` | oui | oui | après | partagée | Section 13 |
| `SENTRY_AUTH_TOKEN` | oui (au build) | oui (au build) | — | partagée, jamais commitée (`.env.example:111-114`) | Chaque service construit sa propre image : sans le jeton, les piles du worker resteraient illisibles (`next.config.ts:35-41`) |
| `LEON_PORTE_KEY` | après | après | après la bascule | **partagée, identique** ; jamais égale à `LEON_CONNECTORS_KEY` (règle du chapitre 03) | `web` (puis la porte) déchiffre le secret d'abonnement ; le worker le chiffre en abonnant (`subscribeConnection`) |
| `LEON_PORTE_URL` | après | après | après la bascule | `https://porte.<domaine>` (section 11), partagée | Le worker la donne aux éditeurs en abonnant ; la porte rebâtit l'`uri` signée à partir d'elle (chapitre 03) |
| `LEON_PORTE_SECRET_<OUTIL>` | après (le premier avec Linear ou GitHub, chapitre 03) | — | après la bascule | | Seul celui qui vérifie la signature la lit |
| `LEON_SLACK_CLIENT_ID`, `_CLIENT_SECRET`, `_SIGNING_SECRET` | après (chapitre 07) | — | — | | Installation et clics : routes de `web`. Le worker écrit avec le jeton du bot, lu en base et déchiffré par `LEON_CONNECTORS_KEY` |
| `RAILWAY_DOCKERFILE_PATH` | — | — | `services/porte/Dockerfile` | note 02, à vérifier | Section 4.1 |
| `PORT`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_GIT_COMMIT_SHA` | posées par Railway | posées par Railway | posées par Railway | | Ne pas les régler à la main (`.env.example:117-119`) |
| `LEON_LLM`, `LEON_URL`, `LEON_TOKEN`, `LEON_TEST_DATABASE`, `CLAUDE_CONFIG_DIR`, `CLAUDE_PROJECT_DIR`, `WXT_PUBLIC_LEON_URL` | — | — | — | | Développement, tests, CLI ou extension. `LEON_LLM=factice` empêche le démarrage en production |

Les noms exacts que lit le binaire de la porte sont fixés au chapitre 15. Ce tableau dit seulement qu'il ne reçoit rien d'autre que sa base, sa clé, son adresse et ses secrets de signature (architecture, section 3 : « Elle ne connaît ni pg-boss, ni les jetons OAuth, ni `LEON_CONNECTORS_KEY` »).

## 10. La base : `leon_porte` en production, `DATABASE_URL_PORTE`, le certificat

**Après le jalon 1**, avec la PR de la migration `0083-webhooks.sql` (chapitre 01). Le chapitre 01 écrit le bloc `do` qui arrête la migration si le rôle manque (sa section 11, `0083`), la ligne de `docker/postgres/init.sql` et la commande du README (sections 15.2 et 15.3). Ce chapitre fixe le geste en production.

### 10.1 Créer le rôle, avant de fusionner la PR de 0083

Sans le rôle, le pré-déploiement échoue sur le bloc `do` du chapitre 01, et la nouvelle version ne démarre pas (comportement de Railway quand le pré-déploiement échoue : à vérifier ; l'ancienne version devrait continuer de tourner). On le crée donc avant.

```bash
# 1. Un mot de passe en hexadécimal (rien à échapper dans une adresse). Le garder dans le gestionnaire de mots de
#    passe de l'équipe, jamais dans un fichier du dépôt.
openssl rand -hex 24

# 2. L'adresse du compte maître (AWS Secrets Manager, README « En ligne »), lue sans écho et jamais écrite sur disque.
#    Le certificat est celui du dépôt : lancer depuis la racine d'un clone.
read -rs MASTER_URL   # postgres://<maître>:<mot de passe>@<hôte RDS>:5432/leon?sslmode=verify-full&sslrootcert=certs/rds-eu-central-1-bundle.pem
export MASTER_URL

# 3. Le rôle, sans droit particulier, puis son mot de passe, saisi deux fois (\password ne le met pas dans l'historique).
psql "$MASTER_URL" -v ON_ERROR_STOP=1 \
  -c "create role leon_porte login nobypassrls" \
  -c "grant connect on database leon to leon_porte"
psql "$MASTER_URL" -c '\password leon_porte'

# 4. Vérifier : ni superutilisateur, ni bypassrls, ni createrole, ni createdb (le bloc do de 0083 refuse sinon).
psql "$MASTER_URL" -Atc "select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = 'leon_porte'"
# attendu : f|f|f|f
unset MASTER_URL
```

Les droits sur le schéma `public` et sur les deux fonctions viennent de la migration (`grant usage on schema public to leon_porte`, `grant execute on function porte_secret(text, uuid) to leon_porte`, `grant execute on function porte_deposer(…) to leon_porte` : chapitre 01, `0083`). Le rôle n'a rien d'autre.

### 10.2 `DATABASE_URL_PORTE`

Sur `web` (puis sur `porte` après la bascule) :

```
postgres://leon_porte:<mot de passe>@<hôte RDS>:5432/leon?sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem
```

Même hôte et mêmes paramètres TLS que `DATABASE_URL`. Le chemin `/app/certs/…` est celui de l'image Railpack (README, « En ligne »). L'image du service Rust a son propre chemin, que le chapitre 15 fixe en copiant le même fichier.

Vérifier, après la migration 0083, depuis un clone :

```bash
read -rs PORTE_URL    # la même adresse, avec sslrootcert=certs/rds-eu-central-1-bundle.pem
export PORTE_URL
psql "$PORTE_URL" -Atc "select current_user"                              # attendu : leon_porte
psql "$PORTE_URL" -Atc "select count(*) from sources"                      # attendu : ERROR: permission denied
psql "$PORTE_URL" -Atc "select count(*) from porte_secret('essai', gen_random_uuid())"   # attendu : 0
unset PORTE_URL
```

### 10.3 Le certificat RDS

`certs/rds-eu-central-1-bundle.pem` (existe) contient trois autorités racines d'Amazon RDS eu-central-1 (ECC384 G1, RSA2048 G1, RSA4096 G1), valables jusqu'en 2061 et 2121 (lu le 20/11 avec `openssl crl2pkcs7 -nocrl -certfile certs/rds-eu-central-1-bundle.pem | openssl pkcs7 -print_certs -text -noout | grep 'Not After'`). Rien à renouveler à l'horizon du dossier. Si AWS change d'autorité pour l'instance, la commande ci-dessus, relancée sur le nouveau fichier, dit lequel garder ; les trois adresses de base (et l'image du service Rust) changent ensemble.

## 11. Le domaine de `LEON_PORTE_URL`

**Après le jalon 1**, avec la PR de la porte en Hono (chapitre 03). Architecture, section 3 : « `LEON_PORTE_URL` est un domaine à part dès le premier jour. Il pointe d'abord sur `web` […], puis sur le service Rust. Aucun abonnement n'est à recréer chez un éditeur. »

Le nom : `porte.<domaine du site>` (le domaine du site n'est écrit nulle part dans le dépôt ; Exemple fictif : `https://porte.leon.example`). Un sous-domaine du site, pas un domaine à part : un seul registre DNS à tenir.

Les gestes, une fois :

1. Sur le service `web`, ajouter le domaine personnalisé `porte.<domaine>`. Railway donne la cible DNS à poser (un enregistrement `CNAME` ; forme exacte : à vérifier dans la documentation de l'éditeur).
2. Chez le registraire du domaine, créer l'enregistrement demandé, avec une durée de vie courte (60 s) : c'est elle qui fera la bascule rapide vers le service Rust (chapitre 15).
3. Attendre que Railway marque le domaine comme vérifié et son certificat TLS comme émis.
4. Poser `LEON_PORTE_URL=https://porte.<domaine>` sur `web` et sur `worker` (section 9).
5. Vérifier la réécriture du chapitre 03 (`/h/:chemin*` vers `/api/v1/porte/h/:chemin*`, `next.config.ts`) :

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://porte.<domaine>/h/inconnu/00000000-0000-0000-0000-000000000000
# attendu : la réponse uniforme du chapitre 03 pour une adresse inconnue (jamais 404 de Next, jamais 500)
curl -fsS https://porte.<domaine>/api/health   # attendu : {"ok":true}
```

6. **Vérifier que l'adresse IP vue par la porte est fiable.** La limite de débit de la porte compte par adresse IP, lue dans l'en-tête `LEON_IP_HEADER` (chapitre 03, 6.1, qui en fait un préalable de la mise en service). La seule source sur `x-real-ip` est le README (`README.md:74-75` : « le proxy de Railway le remplace par l'adresse du client ») ; personne ne l'a essayé, et le domaine `porte.<domaine>` passe peut-être par un autre chemin que le site. L'essai, avant tout abonnement, depuis deux postes d'adresses différentes (A, et B : un téléphone en partage de connexion, par exemple). Chaque requête vise un abonnement neuf d'un outil de portée `abonnement` (`outlook`), donc absent des caches : chacune est une lecture vide, que la porte compte, 300 par adresse sur 10 minutes.

```bash
# Poste A : 301 lectures vides, toutes avec le même en-tête forgé. Une minute environ (refus en 200 ms au moins).
for i in $(seq 1 301); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'X-Real-IP: 203.0.113.9' \
    "https://porte.<domaine>/h/outlook/$(uuidgen | tr 'A-F' 'a-f')"
done | sort | uniq -c
# attendu : 300 fois 401 (refus uniforme), puis 503 : A a atteint sa limite.

# Poste B, dans les 10 minutes, avec le même en-tête forgé :
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'X-Real-IP: 203.0.113.9' \
  "https://porte.<domaine>/h/outlook/$(uuidgen | tr 'A-F' 'a-f')"
# attendu : 401. Un 503 dit que la porte a compté l'en-tête forgé, pas l'adresse de B : LEON_IP_HEADER n'est pas fiable.
```

Si A ne voit jamais de `503`, la porte ne lit pas l'adresse (en-tête absent : toutes les requêtes partagent les 3 000 lectures) ; si B reçoit `503`, l'en-tête vient du client. Dans les deux cas, on ne donne pas `LEON_PORTE_URL` à un éditeur : on cherche dans la documentation de Railway l'en-tête qu'il pose lui-même (à vérifier), on change `LEON_IP_HEADER`, et on refait l'essai. Le résultat (les deux sorties) va dans la description de la PR de la porte en Hono.

7. **Restreindre l'hôte de la porte** (PR 2d, ci-dessous), puis vérifier.

Tant que le domaine pointe sur `web`, tout le site répondrait aussi sous `porte.<domaine>` : pages, connexion, API, MCP. Les cookies de session sont posés par hôte, une connexion faite là ne vaut pas sur le site ; mais un lien de hameçonnage pourrait se servir de ce nom pour paraître officiel. Le domaine est celui de ce chapitre : la restriction aussi. Elle entre par une petite PR, **après** la porte en Hono (chapitre 03, W5, qui crée `rewrites()`) et **avant** le premier abonnement (15.5).

`next.config.ts` (existe ; après la PR W5 du chapitre 03). Deux fonctions avant `nextConfig` :

```ts
// L'hôte d'une adresse, ou null si elle est absente ou illisible.
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// Sur l'hôte de la porte (dossier agents, chapitre 13, section 11), rien d'autre que la porte et le bilan de santé :
// toute autre adresse y mène à une page absente (404), avant même les pages (beforeFiles). Lu au build : Railway passe
// les variables du service à la construction (à vérifier). Rien quand la porte partage l'hôte du site (en local,
// LEON_PORTE_URL=http://localhost:3000) : la règle couperait le site.
function porteHostOnly() {
  const porte = hostOf(process.env.LEON_PORTE_URL);
  if (!porte || porte === hostOf(process.env.BETTER_AUTH_URL)) return [];
  return [
    {
      source: '/:chemin((?!h/|api/health$).*)',
      has: [{ type: 'host' as const, value: porte.replaceAll('.', '\\.') }],
      destination: '/porte-introuvable',
    },
  ];
}
```

Dans `nextConfig`, `rewrites()` du chapitre 03 rend un tableau (ses règles passent alors après les pages) ; elle devient :

```ts
  // La porte des webhooks (dossier agents, section 3) : l'adresse donnée aux éditeurs, <LEON_PORTE_URL>/h/…, ne change
  // jamais. Tant que la porte tient dans web, elle mène à la route Hono ; le service Rust reprendra ensuite le domaine.
  async rewrites() {
    return {
      beforeFiles: porteHostOnly(),
      afterFiles: [{ source: '/h/:chemin*', destination: '/api/v1/porte/h/:chemin*' }],
      fallback: [],
    };
  },
```

La forme objet de `rewrites()` (`beforeFiles`, `afterFiles`, `fallback`) et le motif à exclusion dans `source` sont ceux de la documentation de Next (à vérifier pour la 16.4.5). `/porte-introuvable` n'est ni une page ni une route : Next y rend sa page 404. La règle ne change rien au domaine du site.

Vérifier, après la mise en ligne de la PR 2d :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://porte.<domaine>/                 # attendu : 404
curl -s -o /dev/null -w '%{http_code}\n' https://porte.<domaine>/sign-in          # attendu : 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://porte.<domaine>/api/v1/porte/h/inconnu/x   # attendu : 404
curl -fsS https://porte.<domaine>/api/health                                      # attendu : {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://porte.<domaine>/h/inconnu/x   # attendu : 401
curl -s -o /dev/null -w '%{http_code}\n' https://<domaine>/sign-in                # attendu : 200, le site n'a pas changé
```

Si `/` rend encore la page d'accueil, c'est que `src/proxy.ts` (`matcher: '/'`, existe) réécrit `/` avant la règle (ordre à vérifier) : ajouter alors dans `proxy()`, en tête, une réponse 404 quand l'en-tête `host` vaut l'hôte de `LEON_PORTE_URL`.

Une conséquence demeure : la porte répond aussi sous le domaine du site (`https://<domaine>/h/…`), puisque la réécriture `afterFiles` ne regarde pas l'hôte. On ne donne jamais cette adresse à un éditeur : seule `LEON_PORTE_URL` sort de Leon.

La bascule vers le service Rust (déplacer le domaine, mesurer le trou) est au chapitre 15.

## 12. La mesure de latence vers RDS

Architecture, section 11 : « La mesure de latence d'un `porte_deposer` depuis Railway, avant de promettre une réponse en moins d'une seconde. » Note 02, section 5 : « prévoir la latence réseau entre Railway et RDS […]. Non évalué ici. » Aucune mesure n'existe.

**Jalon 1 pour l'aller-retour simple** (une PR 2b, petite, après la bascule) : il dit si la région du service est la bonne, et il ne coûte rien. **Avant les webhooks pour la porte** : la partie `porte_secret` + `porte_deposer` ne tourne qu'une fois la migration 0083 appliquée et `DATABASE_URL_PORTE` posée.

### 12.1 Ce qu'on mesure

| Mesure | Ce qu'elle dit | Rôle |
|---|---|---|
| Connexion TLS neuve, 10 fois | Le prix d'une connexion que le pool a fermée (inactive 10 s par défaut dans `pg` : à vérifier) | `leon_app` |
| `select 1`, 100 fois, sur une connexion ouverte | L'aller-retour réseau entre le conteneur et RDS | `leon_app` |
| Porte à vide : `porte_secret` puis `porte_deposer`, 100 fois, sur un abonnement tiré au hasard | Une borne basse : deux allers-retours et deux lectures d'index. La fonction ne trouve rien, n'écrit rien, ne notifie rien (chapitre 01, `0083`) | `leon_porte` |
| Porte, écriture annulée : `begin`, `porte_secret`, `porte_deposer`, `rollback`, 100 fois, sur un abonnement réel en service de l'organisation de l'équipe (jamais celui d'un client), une livraison neuve à chaque fois | Le vrai chemin dans la base : la lecture du secret, la ligne écrite dans `boite_entree_webhooks` (index unique compris), l'`update` de `dernier_recu_le`, le `NOTIFY` mis en attente. Le `rollback` n'en laisse rien : aucune ligne, aucun worker réveillé. Seule la validation manque | `leon_porte` |
| `curl` vers `https://porte.<domaine>/api/health`, 100 fois, depuis un poste en Europe | Le trajet HTTP jusqu'au conteneur et la pile Next + Hono, sans base | aucun |

Ce qui n'est pas mesuré : la validation de la transaction (écriture du journal de Postgres, et sa réplication si l'instance RDS est en Multi-AZ : à vérifier sur la console AWS), la vérification HMAC et le déchiffrement AES-GCM du secret (du calcul local, sur quelques kilo-octets). Le chemin entier ne se mesure qu'avec une vraie livraison signée, qui réveille le worker : on le lit sur les premières livraisons réelles, dans l'organisation de l'équipe, quand l'éditeur affiche la durée de ses envois (GitHub le fait dans « Recent Deliveries » ; pour les autres, à vérifier).

La promesse « moins d'une seconde » et ses seuils. Les éditeurs veulent une réponse en 3 s (Slack, Zoom : notes 04 et 05 ; les clics Slack, note 06), 5 s pour Linear (note 07). « Moins d'une seconde » garde trois fois cette marge. Règle, choisie ici :

- **On promet** si le p95 de `curl /api/health` plus le p95 de « porte, écriture annulée » reste sous **500 ms** : la moitié de la seconde, l'autre moitié couvrant la validation, la vérification et la charge. On le confirme sur les premières livraisons réelles (paragraphe précédent).
- **Au-delà**, on ne promet rien et on regarde d'abord la région du service Railway (la rapprocher de Francfort), avant toute autre piste. Tant que ce n'est pas fait, aucun texte de Leon (site, documentation, chapitre 03) ne dit « moins d'une seconde ».
- Si le p95 d'une connexion neuve dépasse 500 ms, on propose au chapitre 03 de garder les deux connexions de `portePool` ouvertes (`idleTimeoutMillis: 0`, option de `pg` à vérifier) : un webhook qui arrive après 10 s de calme paierait sinon la poignée de main TLS.

### 12.2 `src/server/db/latence.ts` (à créer)

La partie pure, testée sans base.

```ts
// La mesure du temps d'aller-retour entre ce conteneur et la base (dossier agents, chapitre 13, section 12). Pur : reçoit
// de quoi lancer une requête, rend des millisecondes. latence-cli.ts le branche sur de vraies connexions.

export type Timing = { p50: number; p95: number; max: number; n: number };

// Le rang le plus proche, sur les valeurs triées : assez juste pour 100 mesures.
export function summarize(samples: number[]): Timing {
  if (samples.length === 0) throw new Error('No samples to summarize');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0, n: sorted.length };
}

// Lance `run` `rounds` fois de suite et rend la durée de chaque passage, en millisecondes.
export async function timeEach(
  rounds: number,
  run: () => Promise<unknown>,
  now: () => number = () => performance.now(),
): Promise<number[]> {
  const samples: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const start = now();
    await run();
    samples.push(now() - start);
  }
  return samples;
}
```

### 12.3 `src/server/db/latence-cli.ts` (à créer)

Sur le modèle de `src/server/db/migrate-cli.ts` (existe) : imports relatifs (lancé par `tsx`, sans les alias de Next, dont la résolution par `tsx` n'est pas vérifiée : carte 08, 5), variables lues par un schéma zod, erreur sur la sortie standard d'erreur. À la différence de `migrate-cli.ts`, il n'écrit jamais le message d'une erreur : il peut citer l'hôte.

```ts
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { z } from 'zod';
import { summarize, type Timing, timeEach } from './latence';

// Mesure à la main, depuis un conteneur Railway, le temps d'aller-retour vers RDS (dossier agents, chapitre 13,
// section 12) : `pnpm db:latence [outil abonnement]`. Ne laisse rien en base : la porte est d'abord appelée à vide
// (abonnement tiré au hasard), puis, si un abonnement est donné, dans une transaction annulée. Ne sort que des
// nombres, jamais une adresse, un secret ni un mot de passe.

const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//);
const LatenceEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  // Absente (ou vide) avant les webhooks : la porte n'est pas mesurée.
  DATABASE_URL_PORTE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    postgresUrl.optional(),
  ),
});
// Un abonnement en service de l'organisation de l'équipe, jamais celui d'un client : l'outil, puis l'identifiant.
const TargetSchema = z.tuple([z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), z.uuid()]);

const ROUNDS = 100;
const CONNECT_ROUNDS = 10;
const SECRET = 'select tenant_id from porte_secret($1, $2)';
const DEPOSIT = `select porte_deposer($1, $2, null, 'livraison', $3, '{}', '{}') as n`;

// porte_deposer a rendu 0 : l'abonnement donné n'est pas en service, la mesure n'écrirait rien.
class NothingWritten extends Error {
  override name = 'NothingWritten';
}

const line = (label: string, timing: Timing): string =>
  `${label.padEnd(36)} p50 ${timing.p50.toFixed(1)} ms   p95 ${timing.p95.toFixed(1)} ms   ` +
  `max ${timing.max.toFixed(1)} ms   (n = ${timing.n})`;

async function measurePorte(url: string, target: [string, string] | null): Promise<void> {
  const porte = new Client({ connectionString: url });
  await porte.connect();
  try {
    // La borne basse : abonnement tiré au hasard, aucune ligne, aucun NOTIFY.
    const empty = await timeEach(ROUNDS, async () => {
      const subscription = randomUUID();
      await porte.query(SECRET, ['mesure', subscription]);
      await porte.query(DEPOSIT, ['mesure', subscription, `mesure-${randomUUID()}`]);
    });
    console.log(line('porte à vide (borne basse)', summarize(empty)));
    if (!target) return;
    // Le vrai chemin, sauf la validation : la ligne s'écrit, le NOTIFY attend, puis tout est annulé.
    const [outil, abonnement] = target;
    const writes = await timeEach(ROUNDS, async () => {
      await porte.query('begin');
      try {
        await porte.query(SECRET, [outil, abonnement]);
        const { rows } = await porte.query<{ n: number }>(DEPOSIT, [
          outil,
          abonnement,
          `mesure-${randomUUID()}`,
        ]);
        if (rows[0]?.n !== 1) throw new NothingWritten();
      } finally {
        await porte.query('rollback');
      }
    });
    console.log(line('porte, écriture annulée', summarize(writes)));
  } finally {
    await porte.end();
  }
}

async function main(): Promise<void> {
  const { DATABASE_URL, DATABASE_URL_PORTE } = LatenceEnvSchema.parse(process.env);
  const args = process.argv.slice(2);
  const target = args.length === 0 ? null : TargetSchema.parse(args);

  const connects = await timeEach(CONNECT_ROUNDS, async () => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.end();
  });
  console.log(line('connexion TLS neuve (leon_app)', summarize(connects)));

  const app = new Client({ connectionString: DATABASE_URL });
  await app.connect();
  try {
    const selects = await timeEach(ROUNDS, () => app.query('select 1'));
    console.log(line('select 1 (leon_app)', summarize(selects)));
  } finally {
    await app.end();
  }

  if (!DATABASE_URL_PORTE) {
    console.log('DATABASE_URL_PORTE absente : la porte n’est pas mesurée.');
    return;
  }
  await measurePorte(DATABASE_URL_PORTE, target);
}

main().catch((error: unknown) => {
  // Le message d'une erreur de pg peut citer l'hôte : on n'en garde que le nom et le code.
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  const suffix = typeof code === 'string' ? ` (${code})` : '';
  console.error(`Mesure impossible : ${String(name ?? 'Error')}${suffix}`);
  process.exit(1);
});
```

`porte_secret` rend aussi le secret chiffré : le script ne lit que `tenant_id`, et n'imprime rien de ce que rend la base. Le `rollback` est dans un `finally` : une erreur au milieu d'un tour n'en laisse rien non plus.

`package.json` (existe), dans `scripts`, après `db:migrate` :

```json
    "db:latence": "node --env-file-if-exists=.env.local --import tsx src/server/db/latence-cli.ts",
```

`src/test/contracts/scripts-contract.test.ts` (existe) vérifie que le chemin cité existe. `privileges.test.ts` (existe) n'est pas touché : le fichier ne lit ni `DATABASE_URL_ADMIN`, ni `set_config`. En revanche, le contrat `porte-surface.test.ts` du chapitre 03 (13.5 ; PR W5) veut que seul `hono-gate.ts` appelle `porte_secret(` et `porte_deposer(` dans `src/`, fichiers de test exceptés : ce script les appelle aussi. Écart E13-10 : le contrat liste les deux fichiers.

### 12.4 Lancer la mesure

Dans le conteneur du service `web` (même réseau que la porte en Hono), par un accès en ligne de commande au conteneur : `railway ssh` (commande et options **à vérifier** dans la documentation de l'éditeur). L'image contient `pnpm` et `tsx` : le pré-déploiement s'en sert déjà (`pnpm db:migrate`).

```bash
railway ssh --service web      # à vérifier
pnpm db:latence                                  # jalon 1 : connexion neuve et select 1
pnpm db:latence <outil> <id d'un abonnement de l'équipe>   # après 0083 : les deux mesures de la porte
```

L'identifiant se lit sur la page Connexions de l'équipe, ou en base avec `leon_owner` (`select id, outil from abonnements_webhook where tenant_id = '<organisation de l'équipe>' and etat = 'active'`). Depuis un poste en Europe, la dernière mesure :

```bash
for i in $(seq 1 100); do curl -s -o /dev/null -w '%{time_total}\n' https://porte.<domaine>/api/health; done \
  | sort -n | awk '{ v[NR] = $1 } END { print "p50", v[int(NR * 0.5)], "p95", v[int(NR * 0.95)] }'
```

Lancée depuis un poste, `pnpm db:latence` ne dirait rien de Railway : elle mesurerait le chemin du poste à Francfort. Les résultats (les lignes de `db:latence` et celle de `curl`), la région du service et la somme des deux p95 comparée aux 500 ms de 12.1 vont dans la description de la PR de la porte en Hono.

## 13. Sentry et surveillance

### 13.1 Ce qui existe, et l'étiquette `role` (PR 2)

Ce qui existe : `src/sentry.server.config.ts:5-29` initialise Sentry dans le runtime Node, chargé par `src/instrumentation.ts:7` avant tout ; environnement `RAILWAY_ENVIRONMENT_NAME`, version `RAILWAY_GIT_COMMIT_SHA` ; aucune donnée captée (`dataCollection`, `beforeSend: scrubEvent`). `next.config.ts:37-45` envoie les cartes de sources si `SENTRY_AUTH_TOKEN` est posée au build. Aucun appel à `Sentry.flush` ni à `Sentry.close` dans le code de production (recherche du 20/11) : d'où le vidage de `shutdown.ts` (6.4).

Le worker lance Next : Sentry s'y initialise par le même chemin. La carte 08 (5, point 8) craignait un worker hors de Next sans Sentry ; l'architecture garde Next dans le worker (section 4), la crainte tombe.

Ce qui change, **PR 2** : une étiquette `role` sur chaque événement, pour séparer `web` et `worker` dans les recherches et les alertes. Dans `Sentry.init` (`src/sentry.server.config.ts:5`), après `tracesSampleRate` :

```ts
  // web ou worker (dossier agents, chapitre 13) : les deux services envoient au même projet, avec la même version.
  // Lu ici dans process.env : ce fichier se charge avant env.ts.
  initialScope: { tags: { role: process.env.LEON_ROLE || 'tout' } },
```

(`initialScope` est une option d'initialisation des SDK JavaScript de Sentry ; sa présence dans `@sentry/nextjs` 11.11.0 est à vérifier au typage.)

Les deux services construisent chacun leur image, donc envoient chacun leurs cartes de sources sous la même version (`RAILWAY_GIT_COMMIT_SHA`). Ce double envoi est à vérifier au premier déploiement : une pile du worker doit s'afficher lisible.

### 13.2 Le pouls du worker (PR 2)

Le bilan de santé de Railway ne sert qu'au déploiement (à vérifier), `/api/health` ne touche pas la base (`src/server/api/app.ts:31`), et `ON_FAILURE` ne redémarre qu'un processus sorti en erreur. Une perte de connexion de pg-boss ne fait que `logError('pgboss.error')` (`src/server/pipeline/queue.ts:99`). Un worker vivant mais figé (écoute morte, sondage arrêté, base injoignable, service endormi) laisserait donc relèves, indexation et exécutions à l'arrêt sans qu'aucun signal ne parte. Pour des agents « en continu », c'est le défaut d'exploitation le plus coûteux.

Le pouls : chaque minute, le tic de reprise de l'indexation (`pipeline-requeue`, `src/server/search/worker.ts:87-100`, planifié `* * * * *`, démarré sans condition dans tout processus qui lit les files) envoie une présence à Sentry, **après** avoir lu la base. Sentry suit ces présences comme une tâche planifiée (« Cron Monitoring ») et ouvre un incident quand une présence manque plus de 5 minutes. Une présence prouve à la fois : le processus vit, pg-boss planifie et donne ses jobs, la base répond. Aucune file nouvelle : le tic existe et tourne déjà chaque minute.

`src/server/pouls.ts` (à créer), en entier pour la PR 2 :

```ts
import * as Sentry from '@sentry/nextjs';

// Le pouls du worker (dossier agents, chapitre 13, section 13.2). Le tic de reprise de l'indexation l'appelle chaque
// minute, après avoir lu la base (search/worker.ts) : une présence part vers Sentry, moniteur « worker-pouls ». Sentry
// ouvre un incident quand elle manque plus de POULS_MARGIN_MINUTES minutes : worker arrêté ou endormi, pg-boss qui ne
// donne plus de job, base injoignable. Sans SENTRY_DSN (local, tests), le SDK ne fait rien.
export const POULS_MONITOR = 'worker-pouls';
export const POULS_MARGIN_MINUTES = 5;

export function pouls(): void {
  Sentry.captureCheckIn(
    { monitorSlug: POULS_MONITOR, status: 'ok' },
    {
      schedule: { type: 'crontab', value: '* * * * *' },
      checkinMargin: POULS_MARGIN_MINUTES,
      maxRuntime: 2,
      timezone: 'Etc/UTC',
    },
  );
}
```

`captureCheckIn`, la forme de son second argument (la configuration du moniteur, créée à la première présence) et ses noms de champs sont ceux des SDK JavaScript de Sentry depuis la version 7 ; leur présence dans `@sentry/nextjs` 11.11.0 est **à vérifier au typage**. Une présence ne porte aucune donnée : ni contenu, ni identifiant.

`src/server/search/worker.ts` (existe), dans le gestionnaire de `PIPELINE_QUEUES.requeue` (`:91-99`), après `requeueStaleRuns` :

```ts
      await requeueStaleRuns(STALE_RUN_MINUTES).catch((error) =>
        rethrowSummary('search.requeue_tick_failed', error),
      );
      // Le pouls du worker (chapitre 13, section 13.2) : seulement quand le tic a pu lire la base.
      pouls();
```

et l'import `import { pouls } from '@/server/pouls';`, entre `@/server/pipeline/runs` et `@/server/sessions/reminder`.

Pendant le recouvrement d'une mise en ligne, deux workers envoient leur présence : Sentry n'en demande qu'une par minute, deux ne gênent pas. Avant la bascule (service unique en `tout`), le pouls part du service unique. En local, sans `SENTRY_DSN`, rien ne part.

Ce que je ne fais pas : faire sortir le processus (code 1, pour que `ON_FAILURE` le relance) après N erreurs de pg-boss ou du pool d'affilée. pg-boss reprend seul après une coupure (son sondage relit à chaque intervalle, et il « revient seul au sondage » si l'écoute échoue, `queue.ts:92-95`), et `pg` rouvre ses connexions à la demande : un compteur transformerait une panne de RDS en boucle de redémarrages, qui couperait aussi chaque fois les jobs en cours. Le pouls voit le cas que ce compteur viserait ; le geste qui suit est un redéploiement (15.4), décidé par quelqu'un.

### 13.3 Les comptes d'exploitation des exécutions (PR 2c)

Le chapitre 04 (section 9.7, fin) confie ici la surveillance des exécutions `en-attente` de plus de 7 jours et le compte des `journal_vide`. S'y ajoutent les deux contrôles du geste 8e de 15.1, faits jusque-là à la main après une mise en ligne. Ces comptes traversent les organisations : sous `leon_app`, la sécurité par ligne les rend impossibles. Il faut une fonction `security definer` qui ne rend que des nombres, sur le modèle des fonctions de tic du chapitre 01 (« hors contexte »).

**Quand** : après la migration `0079` et la PR 6b (le moteur) en production, dans une petite PR de ce chapitre (`<prenom>/comptes-exploitation`). La migration prend le numéro libre suivant à ce moment (règle de renumérotation du chapitre 01, 2.3) ; je l'écris `NNNN`.

`src/server/db/migrations/NNNN-compteurs-exploitation.sql` (à créer) :

```sql
-- NNNN-compteurs-exploitation.sql : des comptes d'exploitation sur les exécutions d'agent, toutes organisations
-- (dossier agents, chapitre 13, section 13.3). Des nombres seulement : ni identifiant, ni organisation, ni contenu.
-- Lus une fois par heure par le worker (src/server/pouls.ts), qui alerte au-dessus de zéro.

create function compteurs_exploitation()
returns table (
  verrous_perimes integer, reveils_en_retard integer, attentes_longues integer, journaux_vides integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    -- Un déroulé mort que le tic agent-reveils aurait dû reprendre en 2 minutes (architecture 4.1, règle 4). Une
    -- exécution reprise 3 fois n'est plus reprise : purger_executions la ferme dans l'heure (chapitre 01, 0079).
    (select count(*) from executions_agent
      where statut = 'en-cours' and verrou_le < now() - interval '10 minutes' and reprises < 3)::integer,
    -- Une minuterie échue depuis 10 minutes que personne n'a réveillée.
    (select count(*) from executions_agent
      where statut = 'en-attente' and reveil_le < now() - interval '10 minutes')::integer,
    -- Une exécution qui attend depuis plus de 7 jours (chapitre 04, 9.7) : une validation vaut 7 jours.
    (select count(*) from executions_agent
      where statut = 'en-attente' and cree_le < now() - interval '7 days')::integer,
    -- Les exécutions fermées « journal_vide » le dernier jour : la purge a vidé une exécution qui attendait encore.
    (select count(*) from executions_agent
      where statut = 'echouee' and erreur = 'journal_vide' and fini_le > now() - interval '1 day')::integer
$$;
revoke all on function compteurs_exploitation() from public;
grant execute on function compteurs_exploitation() to leon_app;
```

Les trois premiers comptes passent par les index partiels de `0079` (`executions_agent_verrou_idx`, `executions_agent_reveil_idx`) ; le dernier lit la table une fois par heure.

`src/server/pouls.ts`, ce que la PR 2c ajoute (les imports rejoignent celui de Sentry, dans l'ordre de Biome) :

```ts
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { logError } from '@/server/log';

// Les comptes de compteurs_exploitation(), dans l'ordre de la fonction.
export const EXPLOITATION_COUNTERS = [
  'verrous_perimes',
  'reveils_en_retard',
  'attentes_longues',
  'journaux_vides',
] as const;
type Counters = Record<(typeof EXPLOITATION_COUNTERS)[number], number>;

export class ExploitationAlert extends Error {
  override name = 'ExploitationAlert';
  constructor(readonly counter: string) {
    super(`Exploitation counter above zero: ${counter}`);
  }
}

// Une fois par heure, depuis le tic de reprise (section 13.3) : chaque compte au-dessus de zéro devient un événement
// Sentry, exploitation.<compte>, sur lequel porte une alerte. Des nombres seulement. Ne lève jamais : le tic continue.
export async function surveillerExecutions(): Promise<void> {
  try {
    const { rows } = await db.execute<Counters>(sql`select * from compteurs_exploitation()`);
    const counters = rows[0];
    if (!counters) return;
    for (const name of EXPLOITATION_COUNTERS) {
      const value = Number(counters[name]);
      if (value > 0) {
        logError(`exploitation.${name}`, new ExploitationAlert(name), { valeur: String(value) });
      }
    }
  } catch (error) {
    logError('exploitation.read_failed', error);
  }
}
```

`src/server/search/worker.ts`, dans la branche horaire du même tic (`:92-95`, celle de `purgeCited`), après la purge :

```ts
        // Les comptes d'exploitation des exécutions d'agent (chapitre 13, section 13.3), à la même heure.
        await surveillerExecutions();
```

Le tic de reprise sert déjà de tic horaire d'entretien hors de l'indexation (la purge des rappels de fils) : on n'ouvre pas de file pour une requête par heure. Au premier tic après un démarrage, la branche horaire passe (`purgedAt` vaut 0) : chaque mise en ligne relit les comptes, ce qui sert de contrôle après coup.

### 13.4 Les événements et les alertes

Les événements que l'infrastructure ajoute, tous par `logError` (donc dans Sentry avec leur nom en étiquette `event`, `src/server/log.ts:37-41`) :

| `event` | Quand | Ce qu'on fait | PR |
|---|---|---|---|
| `shutdown.hook` | un crochet d'arrêt a échoué ou dépassé 5 s | lire l'étiquette `hook` | 2 |
| `shutdown.queues` | pg-boss n'a pas fini en 47 s | un job long : lequel ? (journal du déploiement) | 2 |
| `db.pool` | une connexion inactive du pool a été coupée par la base | rien s'il est isolé ; une rafale dit une panne de RDS | 2 |
| `pgboss.error` | existe (`pipeline/queue.ts:99`) | inchangé | |
| `exploitation.verrous_perimes`, `exploitation.reveils_en_retard` | un compte au-dessus de zéro (13.3) | le tic `agent-reveils` ne reprend plus : lire son journal, puis redéployer le worker | 2c |
| `exploitation.attentes_longues` | une exécution attend depuis plus de 7 jours | lire laquelle sur le poste de contrôle de son organisation (le compte ne la nomme pas) | 2c |
| `exploitation.journaux_vides` | une exécution fermée `journal_vide` le dernier jour | la purge vide trop tôt (chapitre 04, 9.7) : à remonter au chapitre 04 | 2c |
| `exploitation.read_failed` | la lecture des comptes a échoué | la migration de la PR 2c est-elle appliquée ? | 2c |

S'y ajoute le moniteur `worker-pouls` (13.2), qui n'est pas un événement mais une suite de présences.

Les règles d'alerte, à créer à la main dans l'interface de Sentry (noms exacts des options : à vérifier dans sa documentation), chacune envoyée par e-mail à David et à Amos :

| Règle | Sur | Déclenchement | Pourquoi | Avec |
|---|---|---|---|---|
| Pouls manquant | moniteur `worker-pouls` | une présence manquée de plus de 5 minutes ; l'incident se ferme seul à la présence suivante | worker arrêté, figé, endormi ; base injoignable | PR 2 |
| Arrêt qui déborde | `event:shutdown.queues` | à chaque occurrence | un job de plus de 45 s à chaque mise en ligne | PR 2 |
| Nouvelle erreur du worker | `role:worker` | une erreur nouvelle après une version | comme aujourd'hui, par service | PR 2 |
| Clé de la porte | `event:porte.secret_illisible` | à la première occurrence | demandée par le chapitre 03 (section 5) : `LEON_PORTE_KEY` fausse ou tournée à moitié, toutes les livraisons d'abonnement sont refusées sans bruit | la porte en Hono |
| Exécutions coincées | `event:exploitation.verrous_perimes`, `event:exploitation.reveils_en_retard` | à la première occurrence | la reprise après une mort brutale ne marche plus | PR 2c |
| Attentes longues, journaux vidés | `event:exploitation.attentes_longues`, `event:exploitation.journaux_vides` | une fois par jour au plus | demandées par le chapitre 04 | PR 2c |

### 13.5 Ce que d'autres chapitres attendent d'ici

| Chapitre | Ce qu'il attend | Réponse |
|---|---|---|
| 02 (section 12, décisions et « limite connue » ; F12) | La valeur de `CLOCK_CATCH_UP_MINUTES`, « fixée sur la durée mesurée d'une mise en ligne (chapitre 13) » ; 5 en attendant | **10**, raisonnement ci-dessous ; écart E13-11 |
| 03 (section 5) | « L'alerte sur `porte.secret_illisible` est une règle Sentry (chapitre 13) » | Règle « Clé de la porte » (13.4) |
| 03 (6.1 ; section 16) | Quel en-tête Railway pose pour l'adresse du client, et s'il est fiable, avant la mise en service | `x-real-ip` (`README.md:74-75`), à essayer : section 11, geste 6, préalable de 15.5 |
| 03 (14, mise en service) | La mesure de latence d'un `porte_deposer` avant d'annoncer « moins d'une seconde » | Section 12 : écriture annulée, trajet HTTP, seuil de 500 ms et sa base |
| 04 (9.7, fin) | Surveiller les exécutions `en-attente` de plus de 7 jours, et le compte des `journal_vide` | `compteurs_exploitation()` et ses alertes (13.3, 13.4) |
| 04 (11.3, E04-13) | `stoppingSignal` et le drapeau `stopping` | `stoppingSignal`, `isStopping()` (6.4) |

**`CLOCK_CATCH_UP_MINUTES`.** Le tic de l'horloge regarde les N dernières minutes : il rattrape les créneaux tombés pendant que le worker ne lisait pas sa file. N doit couvrir le plus long trou de lecture **ordinaire** :

- Une mise en ligne ordinaire : avec `overlapSeconds` à 0, l'ancien worker reçoit `SIGTERM` une fois que le nouveau a passé son bilan de santé ; si `register()` s'achève avant que Next ne serve (à vérifier, « Ce que je n'ai pas vérifié »), le nouveau lit déjà les files. Le trou est proche de 0. Un déploiement qui échoue (pré-déploiement, bilan de santé) laisse tourner l'ancien : 0 aussi.
- Un plantage (sortie en erreur) : Railway relance le service (`ON_FAILURE`), puis Next démarre, `register()` démarre pg-boss, et le prochain tic de la minute part. Le délai de relance de Railway n'est pas connu ; le démarrage tient dans les 120 s du bilan de santé. Estimation : 3 à 5 minutes.
- Un worker figé ou arrêté plus longtemps : c'est une panne, vue par le pouls après 5 minutes (13.2) et réparée par quelqu'un. Aucun N raisonnable ne la couvre ; le chapitre 02 l'accepte déjà (« limite connue »), avec `missed: 'once'` comme suite possible.

D'où **10** : deux fois l'estimation haute d'un plantage. Le prix d'une fenêtre plus large, d'après le chapitre 02 : à chaque tic, les fiches dont la minute peut tomber dans l'une des 10 minutes sont lues (au lieu de 5) ; la clé d'exécution (minute locale du créneau) empêche tout doublon. À relire après le premier plantage réel ou une relance forcée (bouton de redémarrage du service, à vérifier) : la durée entre la dernière ligne du processus mort et `[leon] rôle du processus : worker.` du suivant, lue dans le journal de Railway, plus une minute. La constante vit au chapitre 02 (`src/server/standard/clock.ts`) : ce chapitre ne la change pas, il en donne la valeur (écart E13-11).

## 14. La montée de pg-boss (PR 1)

**Jalon 1, PR 1**, avant le moteur (architecture, écart E15, question Q10). Le dépôt a pg-boss 12.37.1 (`package.json`, `pnpm-lock.yaml:3450`), le registre la 12.38.2 (note 03, 4.1). La note 03 cite les versions 12.33 à 12.37.1 ; elle ne dit pas ce que change la 12.38. Le moteur s'appuie sur trois comportements que personne n'a relus dans la bibliothèque (carte 05, 7) : la file `stately`, `upsert`, et `stop`. La PR les prouve par un test en base, sur la version montée.

### 14.1 Les gestes

```bash
cd ~/leon && git fetch origin --prune && git pull --ff-only && gh pr list
git worktree add --no-track -b <prenom>/pg-boss-12-38 .claude/worktrees/pg-boss-12-38 origin/main
cd .claude/worktrees/pg-boss-12-38
pnpm install --frozen-lockfile
pnpm add pg-boss@12.38.2                    # package.json doit garder "12.38.2", sans ^, comme les autres
git diff -- package.json pnpm-lock.yaml     # une seule dépendance a changé

# Lire ce que la 12.38.2 promet, avant d'écrire le test (chemins à ajuster à ce que le paquet contient) :
ls node_modules/pg-boss/dist
grep -rn "graceful\|wait?\|timeout?" node_modules/pg-boss/dist/*.d.ts | head -20   # options de stop()
grep -rn "upsert\|stately" node_modules/pg-boss/dist/*.d.ts | head -20

docker compose up -d
psql "postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test" -Atc "select version from pgboss.version"   # avant
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:db
psql "postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test" -Atc "select version from pgboss.version"   # après
```

Si la version du schéma de pg-boss change entre les deux lectures, pg-boss migre ses propres tables au démarrage de la nouvelle version, sous `leon_app` (le schéma `pgboss` est créé par `0001-base.sql:11-13`, `createSchema: false` côté pg-boss), hors du pré-déploiement de Leon. Pendant le recouvrement, l'ancienne version tourne donc quelques secondes sur le schéma neuf. On le dit dans la description de la PR, et on la met en ligne hors des heures où les clients travaillent. (La table `pgboss.version` et la migration au démarrage sont à vérifier dans le paquet.)

La règle 1 de 15.3 (« l'ancien code lit le schéma neuf ») ne vaut que pour les migrations de Leon : pg-boss change son propre schéma d'une version mineure à l'autre (note 03, 4.1 : la 12.35 passe au schéma v43). Le retour arrière de 15.4 redéploierait la 12.37.1 sur un schéma monté par la 12.38.2 ; elle peut refuser de démarrer, ou tourner sur des tables qu'elle ne connaît pas. On l'essaie donc avant la fusion, sur la base de test déjà montée :

```bash
# Dans le worktree, la montée déjà commitée sur la branche, après la suite db avec la 12.38.2 (bloc ci-dessus).
git show origin/main:package.json > package.json          # la 12.37.1, le temps de l'essai
git show origin/main:pnpm-lock.yaml > pnpm-lock.yaml
pnpm install --frozen-lockfile
pnpm test:db -- src/server/pipeline/queue.db.test.ts      # la 12.37.1 démarre-t-elle sur le schéma de la 12.38.2 ?
psql "postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test" -Atc "select version from pgboss.version"
git checkout -- package.json pnpm-lock.yaml && pnpm install --frozen-lockfile   # retour à la 12.38.2 commitée
```

Le résultat va dans la description de la PR 1 : « la 12.37.1 démarre sur le schéma neuf » ou « elle refuse ». Dans le second cas, le retour arrière de la PR 1 ne passe pas par un redéploiement de l'ancienne version (15.4, dernier point).

### 14.2 Le test : `src/server/pipeline/pgboss.db.test.ts` (à créer), en entier

Sur le modèle de `src/server/pipeline/queue.db.test.ts` (existe) : un boss à part, files au nom aléatoire, nettoyées à la fin.

```ts
import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';

// Ce que Leon attend de pg-boss 12 (dossier agents, chapitre 13, section 14 ; architecture, écart E15) : la file
// « stately » ignore un second envoi de même clé, `upsert` avance un job retardé, `stop` attend un job en cours jusqu'à
// son délai. Des boss à part : getBoss() n'est pas touché.

const newBoss = (): PgBoss => {
  const boss = new PgBoss({ connectionString: TEST_ENV.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', () => {});
  return boss;
};

let boss: PgBoss;
const created: string[] = [];

async function newQueue(policy: 'standard' | 'stately'): Promise<string> {
  const name = `test-pgboss-${randomUUID()}`;
  await boss.createQueue(name, { policy });
  created.push(name);
  return name;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  boss = newBoss();
  await boss.start();
});

afterAll(async () => {
  for (const name of created) {
    await boss.deleteAllJobs(name).catch(() => {});
    await boss.deleteQueue(name).catch(() => {});
  }
  await boss.stop({ graceful: false, close: true });
});

describe('pg-boss 12 : la file « stately »', () => {
  it('ignore un second envoi de même clé tant que le premier attend', async () => {
    const name = await newQueue('stately');

    expect(await boss.send(name, { n: 1 }, { singletonKey: 'k', startAfter: 1800 })).not.toBeNull();
    expect(await boss.send(name, { n: 2 }, { singletonKey: 'k' })).toBeNull();
  });

  // Le patron de requestBriefingRefreshNow (briefing/queue.ts) et du réveil d'une exécution (chapitre 04).
  it('avance à maintenant, par upsert, le job retardé de même clé, sans en créer un second', async () => {
    const name = await newQueue('stately');
    await boss.send(name, { n: 1 }, { singletonKey: 'k', startAfter: 1800 });

    await boss.upsert(name, { n: 1 }, { singletonKey: 'k', startAfter: 0 });

    const jobs = await boss.findJobs(name, { key: 'k', queued: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.startAfter.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});

describe('pg-boss 12 : l’arrêt (shutdown.ts)', () => {
  it('attend la fin d’un job en cours avant de rendre la main', async () => {
    const name = await newQueue('standard');
    const worker = newBoss();
    await worker.start();
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let finished = false;
    await worker.work(name, { pollingIntervalSeconds: 0.5 }, async () => {
      markStarted();
      await sleep(1_000);
      finished = true;
    });
    const id = await boss.send(name, {});
    await started;

    await worker.stop({ graceful: true, timeout: 10_000, wait: true });

    expect(finished).toBe(true);
    expect((await boss.getJobById(name, id ?? ''))?.state).toBe('completed');
  });

  it('rend la main à son délai quand un job ne finit pas à temps', async () => {
    const name = await newQueue('standard');
    const worker = newBoss();
    await worker.start();
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    await worker.work(name, { pollingIntervalSeconds: 0.5 }, async () => {
      markStarted();
      await sleep(3_000);
    });
    await boss.send(name, {});
    await started;
    const before = Date.now();

    await worker.stop({ graceful: true, timeout: 500, wait: true });

    expect(Date.now() - before).toBeLessThan(2_500);
  });
});
```

Ce qui est à vérifier en écrivant ce test, dans les types de la 12.38.2 : les options `timeout` et `wait` de `stop` (seules `graceful` et `close` sont employées dans le dépôt, `queue.db.test.ts:27`), le champ `startAfter` d'un job rendu par `findJobs`, la signature de `getJobById(name, id)`, l'état `'completed'`. Si un nom diffère, on corrige le test et `stopBoss` (section 6.5) ensemble, et on l'écrit dans la description de la PR.

Le test d'un `getBoss()` arrêté puis appelé n'est pas écrit : `stopBoss` ne remet pas le singleton à zéro (6.5), et `shutdown.ts` sort du processus juste après.

## 15. La marche à suivre

Railway déploie ce qui arrive sur `main` (commentaire de `.github/workflows/tests.yml:10-11`). Une mise en ligne, c'est donc une fusion, puis des contrôles. Les commandes `git` et `gh` suivent `CLAUDE.md`. Les commandes `railway` sont **à vérifier dans la documentation de l'éditeur** : leur équivalent sur le tableau de bord est donné à chaque fois. Les contrôles en base se font en lecture, depuis un clone, avec l'adresse `leon_owner` de Railway (`DATABASE_URL_ADMIN`) dont on remplace `sslrootcert=/app/certs/…` par `sslrootcert=certs/…` ; jamais avec un serveur local branché sur la production (README, « En ligne »).

### 15.1 Une mise en ligne ordinaire (après la bascule)

Avant de fusionner :

```bash
gh pr checks <numéro> --watch                       # 1. tout est vert
gh pr diff <numéro> --name-only | grep -E 'migrations/|queue\.ts$|env\.ts$' || true
                                                    # 2. une migration, une file ou une variable : relire 15.3
```

3. Une variable nouvelle et obligatoire se pose sur les services concernés (tableau 9) **avant** la fusion : sinon `env.ts` refuse de démarrer, le bilan de santé échoue et la nouvelle version ne remplace pas l'ancienne (à vérifier : Railway garde l'ancienne quand le bilan de santé échoue).
4. L'autre relit et approuve (`CLAUDE.md`). Puis :

```bash
gh pr merge <numéro> --squash                       # sans --delete-branch : la branche locale tient un worktree
gh run list --branch main --limit 1                 # 5. la passe de main démarre ; gh run watch <id> pour la suivre
```

Puis le ménage de `CLAUDE.md` (« Après la fusion »), depuis le clone principal, une fois la fusion visible sur GitHub :

```bash
cd ~/leon && git pull --ff-only
gh pr list --state merged --limit 5                 # la PR y est
git worktree remove .claude/worktrees/<sujet>
git branch -D <prenom>/<sujet>                      # -D : après un squash, Git ne la voit pas comme fusionnée
git push origin --delete <prenom>/<sujet>           # si GitHub ne l'a pas supprimée lui-même
```

Après la fusion, Railway construit `web` et `worker` (tableau de bord : onglet des déploiements de chaque service ; `railway logs --service <nom>`, à vérifier) :

6. **Pré-déploiement.** Dans le journal d'un des deux services : `Appliquées : 00xx-….sql` ; dans l'autre : `Base à jour.` (`src/server/db/migrate-cli.ts:11`). Une erreur ici arrête ce déploiement ; l'ancienne version continue.
7. **Démarrage.** `[leon] rôle du processus : web.` dans l'un, `[leon] rôle du processus : worker.` dans l'autre. Aucune ligne `LEON_ROLE absente en production` ni `NEXT_MANUAL_SIG_HANDLE absente`.

```bash
curl -fsS https://<domaine>/api/health              # 8a. attendu : {"ok":true}
```

8. **Arrêt de l'ancien worker.** Dans le journal de l'ancien déploiement du worker : `[leon] arrêt demandé (SIGTERM)`, puis `[leon] arrêt fini en … ms.` avec moins de 52 000 ms (le vidage de Sentry vient après cette ligne). Si une ligne manque, lire le tableau du geste 8 de 15.2.

```bash
read -rs PROD_ADMIN && export PROD_ADMIN            # l'adresse leon_owner, sslrootcert=certs/rds-eu-central-1-bundle.pem
psql "$PROD_ADMIN" -Atc "select name from leon_migrations order by name desc limit 3"      # 8b. la dernière est là
psql "$PROD_ADMIN" -c "select usename, count(*) from pg_stat_activity
                       where datname = current_database() group by 1 order by 2 desc"     # 8c. ~26 (29 après les webhooks)
psql "$PROD_ADMIN" -Atc "show max_connections"                                             # 8d. ~200 attendu
# 8e. Après le jalon 1 : aucune exécution coincée après la mise en ligne (des comptes, aucun contenu). Après la
#     PR 2c, les mêmes comptes sont relus chaque heure et alertent seuls (13.3) ; ce contrôle reste celui de l'instant.
psql "$PROD_ADMIN" -c "select statut, count(*) from executions_agent
                       where (statut = 'en-cours' and verrou_le < now() - interval '2 minutes')
                          or (statut = 'en-attente' and reveil_le < now() - interval '2 minutes')
                       group by 1"                                                         # attendu : aucune ligne
unset PROD_ADMIN
```

9. **Sentry**, quinze minutes après : aucune erreur nouvelle sur la version (`RAILWAY_GIT_COMMIT_SHA`), filtrer par `role` ; le moniteur `worker-pouls` (13.2) a reçu une présence dans les cinq dernières minutes.

En cas de doute à n'importe quel geste : 15.4.

### 15.2 La bascule d'un service à deux (une seule fois, après la PR 2)

Préalables : la PR n° 0 est faite (réglages sur le tableau de bord) ; la PR 2 est fusionnée et en ligne sur le service actuel, **sans** `LEON_ROLE` : il tourne en `tout`, comme avant, et son journal dit `LEON_ROLE absente en production`.

| # | Geste | Où | Contrôle |
|---|---|---|---|
| 1 | Noter la mémoire et le CPU moyens du service actuel sur 7 jours | métriques du service | les chiffres vont dans la description de la PR 2 (section 4.2) |
| 2 | Renommer le service actuel `web` (facultatif ; son adresse privée `<service>.railway.internal` change, rien ne s'en sert) | réglages du service | |
| 3 | Créer le service `worker` **sans source** d'abord (« service vide », à vérifier), pour qu'il ne se déploie pas sans ses variables | tableau de bord | |
| 4 | Poser ses variables (tableau 9, colonne `worker`), par des variables partagées quand c'est possible. `LEON_ROLE=worker`, `NEXT_MANUAL_SIG_HANDLE=true` | variables du service `worker` | geste 6 |
| 5 | Poser ses réglages (tableau 4.1, colonne `worker`) : pré-déploiement, démarrage, bilan de santé, `drainingSeconds` 60, aucun domaine, mise en veille coupée, une réplique, même région que `web` | réglages du service `worker` | relire chaque champ |
| 6 | Comparer les deux listes de variables (noms seuls, aucune valeur n'est écrite) | poste, depuis un clone lié au projet | voir le bloc ci-dessous |
| 7 | Brancher la source du `worker` : le dépôt, branche `main`. Il se déploie | réglages du service `worker` | journal : `[leon] rôle du processus : worker.`, aucune ligne `NEXT_MANUAL_SIG_HANDLE absente` |
| 8 | Vérifier l'arrêt propre : redéployer le `worker` (bouton de redéploiement, ou `railway redeploy --service worker`, à vérifier) | tableau de bord | journal de l'ancien déploiement : `arrêt demandé`, puis `arrêt fini en … ms`. C'est l'essai de 6.1 ; si une ligne manque, le tableau ci-dessous |
| 9 | Sur `web` : `LEON_ROLE=web`, puis `drainingSeconds` à 35. La variable redéploie le service | variables et réglages de `web` | journal : `[leon] rôle du processus : web.` ; plus aucune ligne de démarrage de worker |
| 10 | Contrôler que le travail continue, sans double | base | bloc ci-dessous |
| 11 | Compter les connexions : environ 26 en régime | base | 15.1, geste 8c |

Geste 8, ce que dit le journal de l'ancien worker :

| `arrêt demandé` | `arrêt fini` | Cause | Ce qu'on fait |
|---|---|---|---|
| oui | oui, sous 52 000 ms | l'arrêt propre marche | rien |
| oui | non | Next a quand même fermé le processus (`NEXT_MANUAL_SIG_HANDLE` ignorée, ou lue trop tard), ou un job a passé les 45 s et `SIGKILL` est tombé à 60 s | refaire l'essai sans job en cours (relève finie) ; si la ligne manque encore, retour arrière de la bascule (ci-dessous) et lecture de `node_modules/next/dist/server/lib/start-server.js` de la 16.4.5 |
| non | non | `SIGTERM` n'a pas atteint Node : `pnpm` ou le shell ne l'ont pas transmis (6.1) | sur le seul `worker`, commande de démarrage `node node_modules/next/dist/bin/next start` (tableau 4.1), puis refaire le geste 8. Le dire dans la PR 2 |

Entre les gestes 7 et 9, deux processus lisent les files (`web` en `tout` et le `worker`). C'est le cas admis du recouvrement (architecture 4.1, règle 5) : pg-boss ne donne un job qu'à un lecteur, les tics sont des files `stately`. On ne laisse pas passer la nuit entre les deux.

Geste 6 (les noms seuls passent par `cut` ; aucune valeur n'est écrite sur disque ; options de `railway variables` à vérifier) :

```bash
diff <(railway variables --service web --kv | cut -d= -f1 | sort) \
     <(railway variables --service worker --kv | cut -d= -f1 | sort)
# Différences attendues : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET,
# LEON_ADMINS (web seul) ; NEXT_MANUAL_SIG_HANDLE (worker seul). Rien d'autre.

# Les valeurs qui doivent être identiques : on compare leurs empreintes, jamais les valeurs.
for name in LEON_EMBEDDINGS LEON_EMBEDDINGS_MODEL LEON_CONNECTORS_KEY ANTHROPIC_API_KEY; do
  for service in web worker; do
    printf '%s %s ' "$name" "$service"
    railway variables --service "$service" --kv | grep "^$name=" | sha256sum | cut -c1-12
  done
done
# Chaque paire de lignes doit porter la même empreinte.
```

Geste 10 :

```bash
read -rs PROD_ADMIN && export PROD_ADMIN
# La relève continue : la date la plus récente avance d'un passage à l'autre (15 minutes au plus).
psql "$PROD_ADMIN" -Atc "select max(last_sync_at) from connections where status = 'active'"
# L'indexation continue : des runs « done » récents, aucun « running » ancien.
psql "$PROD_ADMIN" -c "select status, count(*) from ingest_runs
                       where updated_at > now() - interval '30 minutes' group by 1"
unset PROD_ADMIN
```

Retour arrière de la bascule : remettre `LEON_ROLE` à vide sur `web` (il redevient `tout` et relance les workers), **puis** arrêter le `worker` (retirer son déploiement, ou supprimer le service ; à vérifier). Dans cet ordre, il y a toujours un lecteur des files.

### 15.3 Les règles qui rendent une mise en ligne sûre

Les deux services se déploient chacun de leur côté, et l'ancienne version tourne pendant le recouvrement. Pendant quelques dizaines de secondes, on peut donc avoir : un nouveau `web` avec un ancien `worker`, ou l'inverse, sur un schéma déjà migré. Six règles, à relire à chaque PR qui touche ces points (geste 2 de 15.1), la dernière à chaque changement de réglage :

1. **Une migration reste lisible par le code d'avant** (architecture 4.1, règle 6). Ajouter une table, une colonne nulle ou avec défaut, une fonction : oui. Renommer ou supprimer : en deux PR, la seconde une fois que plus aucun code ne lit l'ancien nom.
2. **Une file nouvelle naît dans le `getXBoss()` de son module, appelé par les envois comme par les lecteurs** (patron existant : `getBriefingBoss`, `src/server/briefing/queue.ts:64-79`). Un nouveau `web` peut mettre un job en file avant que le nouveau `worker` n'ait démarré : la file doit déjà exister de son côté (un envoi vers une file absente échoue en pg-boss 12 : à vérifier).
3. **Un schéma de job ne gagne qu'un champ facultatif** pendant une version. Un ancien `web` peut envoyer l'ancienne forme au nouveau `worker`. Un champ rendu obligatoire attend la version suivante.
4. **Changer la politique d'une file la supprime et la recrée** (`ensureQueue`, `src/server/pipeline/queue.ts:34-48`) : ses jobs en attente sont perdus. Réservé aux tics, hors des heures de travail.
5. **Une variable obligatoire se pose avant la fusion**, sur chaque service qui la lit (15.1, geste 3).
6. **Changer de modèle de vecteurs worker arrêté.** `LEON_EMBEDDINGS` et `LEON_EMBEDDINGS_MODEL` sont partagées (tableau 9), mais les deux services redéploient chacun de leur côté : pendant une fenêtre, `web` et `worker` n'ont pas le même modèle. Or le tic de revectorisation du worker retire les vecteurs de tout autre modèle que le sien (`retirer_vieux_vecteurs`, `src/server/search/embed-missing.ts:360-366`) : un `web` resté sur l'ancien modèle perd ses vecteurs, un `web` passé au nouveau n'en trouve pas encore, et un ancien worker encore vivant pourrait effacer ceux du nouveau. Dans cet ordre :
   1. retirer le déploiement du `worker` (tableau de bord ; action à vérifier) : plus aucun tic ;
   2. changer la variable partagée, ce qui redéploie `web` (le changement de variable redéploie le service : à vérifier) ;
   3. attendre que `web` soit en ligne avec le nouveau réglage (journal du démarrage) ;
   4. redéployer le `worker`. Son tic revectorise tout, puis retire les vecteurs de l'ancien modèle (README, « Un worker par base, un modèle »).

   Entre 1 et 4, rien n'est relevé ni indexé : quelques minutes, hors des heures de travail. Jusqu'à la fin de la revectorisation, la recherche de `web` s'appuie surtout sur le plein texte, comme aujourd'hui après un changement de modèle.

### 15.4 Le retour arrière

Le plus rapide d'abord, puis la trace dans `main` :

1. Sur le tableau de bord, chaque service a la liste de ses déploiements : redéployer le précédent, sur `web` puis sur `worker` (action et nom exacts à vérifier). Le pré-déploiement ne défait aucune migration : la règle 1 de 15.3 garantit que l'ancien code lit le schéma neuf.
2. Puis la PR qui annule, pour que `main` dise ce qui tourne :

```bash
cd ~/leon && git fetch origin --prune && git pull --ff-only
git worktree add --no-track -b <prenom>/annule-<sujet> .claude/worktrees/annule-<sujet> origin/main
cd .claude/worktrees/annule-<sujet>
git revert --no-edit <commit de la fusion en squash>
git push -u origin <prenom>/annule-<sujet>
gh pr create --fill
```

Une migration déjà appliquée n'est jamais annulée par un `revert` : le fichier disparaîtrait du dépôt, pas de la base (`leon_migrations`). Si elle doit l'être, c'est une migration suivante, écrite exprès.

**Ne pas revenir sous la PR 1 sans avoir lu ceci.** La règle 1 de 15.3 ne couvre pas le schéma de pg-boss, qu'il migre seul au démarrage (section 14). Redéployer une version d'avant la PR 1 remet la 12.37.1 sur un schéma monté par la 12.38.2. Si l'essai de 14.1 a montré qu'elle refuse ce schéma, le retour arrière de la PR 1 ne passe pas par le point 1 : on corrige en avant (une PR qui répare, sur la 12.38.2), ou, en dernier recours, on restaure la base à la minute d'avant la mise en ligne (README, « En ligne » : restauration vers une nouvelle instance, dont l'adresse se recopie dans les deux services).

### 15.5 La première mise en ligne des webhooks (après le jalon 1)

Dans cet ordre, parce que chaque geste suppose le précédent :

1. Créer `leon_porte` (10.1).
2. Brancher le domaine `porte.<domaine>` sur `web` (section 11, gestes 1 à 3).
3. Poser `LEON_PORTE_KEY` (partagée, `openssl rand -base64 32`, jamais égale à `LEON_CONNECTORS_KEY`), `LEON_PORTE_URL` sur `web` et `worker`, `DATABASE_URL_PORTE` sur `web` seul (tableau 9). Une variable que le code ne lit pas encore ne gêne rien : `EnvSchema` ignore les clés qu'il ne connaît pas (comportement par défaut de `z.object`).
4. Fusionner la PR de la migration 0083 et de la porte en Hono (chapitres 01 et 03). Contrôles de 15.1, puis ceux de 10.2 et de 11 (geste 5).
5. Vérifier l'adresse IP vue par la porte (section 11, geste 6). Si l'essai échoue, on s'arrête là : aucune adresse n'est donnée à un éditeur tant que `LEON_IP_HEADER` n'est pas fiable.
6. Fusionner la PR 2d (restriction de l'hôte de la porte, section 11, geste 7) et faire ses contrôles.
7. Mesurer (section 12) depuis le conteneur de `web` : la porte à vide, et le trajet HTTP depuis un poste. Noter le résultat dans la PR.
8. Créer la règle d'alerte « Clé de la porte » dans Sentry (13.4).
9. Seulement alors, laisser les abonnements se créer : ils naissent à la relève suivante de chaque connexion (`subscribeConnection`, chapitre 03). Rien à lancer à la main.
10. Dès que l'organisation de l'équipe a un abonnement en service, refaire la mesure avec lui (« porte, écriture annulée », 12.4). C'est elle qui décide de la promesse : rien ne dit « moins d'une seconde » avant que la règle de 12.1 soit tenue.

### 15.6 Le service `porte`

Sa création, sa configuration (colonne de droite du tableau 4.1), ses variables (tableau 9) et la bascule du domaine sont au chapitre 15. Ce chapitre ajoute une règle : la bascule se fait un jour où l'on a d'abord baissé la durée de vie DNS de `porte.<domaine>` à 60 s (section 11, geste 2), et `DATABASE_URL_PORTE` et `LEON_PORTE_SECRET_<OUTIL>` ne restent sur `web` que tant que la route Hono y répond (le chapitre 15 dit quand elle s'éteint).

## 16. Le README après la PR 2

`README.md` (existe), sections « Une instance, un modèle » (`:39-51`) et « En ligne (Railway) » (`:53-78`). Architecture, section 6 : « "En ligne" : deux services, un seul worker par base, arrêt propre ». La ligne du rôle `leon_porte` vient avec la PR de 0083 (chapitre 01, 15.3) ; elle n'est pas ici.

Le titre et le premier paragraphe de « Une instance, un modèle » deviennent :

```markdown
## Un worker par base, un modèle

**Un seul worker par base, un seul modèle de vecteurs à la fois.** Les tâches de fond (relève des outils, indexation,
vecteurs, agents) tournent dans le processus dont `LEON_ROLE` vaut `worker` (ou `tout`, en local). Quelques gardes
(réponses en cours, nombre de réponses par personne) vivent dans le processus `web` : une seule instance de `web` aussi,
tant qu'elles ne sont pas passées en base.
```

Le premier point de la liste devient :

```markdown
- En production, une mise à jour arrête l'ancienne version dès que la nouvelle est prête ; l'ancien worker laisse
  finir ses jobs en cours, 45 s au plus, avant de sortir (voir « En ligne »).
```

Le troisième point (changer de modèle de vecteurs) devient, parce que `web` et `worker` redéploient chacun de leur côté et ne doivent jamais tourner avec deux modèles (règle 6 de 15.3 du chapitre) :

```markdown
- Changer de modèle de vecteurs (`LEON_EMBEDDINGS_MODEL`, variable partagée des deux services) : arrêter le worker
  (retirer son déploiement), changer le réglage, attendre que `web` soit reparti avec lui, puis relancer le worker.
  Le tic revectorise alors tout, sauf les textes que le fournisseur refuse et ceux d'un membre parti (le plein texte
  les trouve toujours), puis retire tous les vecteurs de l'ancien modèle. Jamais par une mise en ligne ordinaire : les
  deux services ne redémarrent pas au même instant, et un worker sur l'ancien modèle effacerait les vecteurs du
  nouveau. En local, avec un seul processus en `tout` : arrêter le serveur, changer le réglage, relancer.
```

Le dernier paragraphe remplace « Deux instances » par « Deux workers ».

Dans « En ligne (Railway) », le premier paragraphe et les trois premiers points deviennent (le quatrième point est nouveau) :

```markdown
Pour mettre Leon en ligne sur [Railway](https://railway.com) : deux services construits depuis ce dépôt, allumés en
continu, branchés sur la base PostgreSQL d'AWS RDS (instance `leon`, Francfort ; venue de Supabase le 18/11/2026, voir
`docs/etudes/supabase-vers-rds-2026-11/`). `web` (`LEON_ROLE=web`) sert les pages, l'API et le MCP et met des jobs en
file ; `worker` (`LEON_ROLE=worker`) lit toutes les files. Pas de Vercel : ses fonctions s'endorment entre deux
requêtes, et les tâches de fond ne tourneraient plus.

- Les réglages de chaque service vivent sur le tableau de bord de Railway ; ils sont recopiés, service par service,
  dans `docs/etudes/agents-2026-11/dossier/13-infrastructure-et-mise-en-ligne.md` (section 4). Les deux services
  lancent les migrations avant chaque mise en ligne (`pnpm db:migrate`, avec `DATABASE_URL_ADMIN`) : le premier les
  applique, le second attend son verrou et ne trouve rien. Puis `pnpm start`, et `/api/health` pour savoir qu'il est prêt.
- Railway démarre la nouvelle version avant d'arrêter l'ancienne. Le worker porte `NEXT_MANUAL_SIG_HANDLE=true` : sur
  `SIGTERM`, ses agents ne commencent plus d'étape, il cesse de prendre des jobs et laisse finir ceux en cours
  (`src/server/shutdown.ts`), dans les 60 s de drainage de son service. Mettre en ligne pendant une relève ne perd
  rien ; une relève coupée reprend dans les 30 minutes. Un changement de modèle de vecteurs ne passe jamais par une
  mise en ligne ordinaire (voir « Un worker par base, un modèle »).
- `web` ouvre 7 connexions au plus, le worker 19 (`src/server/db/client.ts`, pg-boss compris) : 26, le double pendant
  une mise en ligne, loin des ~200 que RDS accepte.
- Le worker envoie chaque minute un pouls à Sentry (moniteur `worker-pouls`, `src/server/pouls.ts`) : Sentry prévient
  après 5 minutes sans nouvelles. Le bilan de santé de Railway, lui, ne sert qu'au déploiement.
```

Le point « Variables » gagne, à la fin : « Chaque service ne reçoit que ce qu'il lit : le tableau est dans le même chapitre du dossier (section 9). `LEON_ROLE` et `NEXT_MANUAL_SIG_HANDLE` diffèrent d'un service à l'autre ; les clés de chiffrement, le fournisseur de vecteurs et les modèles sont des variables partagées. »

## Tests à écrire

| Fichier | Projet vitest | Ce qu'il prouve | PR |
|---|---|---|---|
| `src/server/pipeline/pgboss.db.test.ts` (à créer, code en 14.2) | `db` | `stately` ignore un second envoi ; `upsert` avance un job retardé ; `stop` attend un job en cours, et rend la main à son délai | 1 |
| `src/server/env.test.ts` (existe, deux cas de plus) | `unit` | `LEON_ROLE` : `web`, `worker`, `tout`, vide vaut absente ; un nom inconnu empêche le démarrage | 2 |
| `src/server/role.test.ts` (à créer) | `unit` | `tout` par défaut ; `runsWorkers()` faux dans `web` seulement ; relu à chaque appel | 2 |
| `src/server/shutdown.test.ts` (à créer) | `unit` | séquence, crochets bornés, pg-boss borné, second signal, enregistrement unique | 2 |
| `src/server/pipeline/queue.test.ts` (existe, un cas de plus) | `unit` | `stopBoss` ne démarre pas pg-boss pour l'arrêter | 2 |
| `src/instrumentation-node.test.ts` (existe, à modifier) | `unit` | `web` ne lance aucun worker ni l'arrêt propre mais valide ses réglages ; `worker` et `tout` enregistrent l'arrêt avant le premier worker ; avertissement de `tout` en production | 2 |
| `src/server/db/client.test.ts` (à créer, facultatif) | `unit` | `poolMax` : 16 et 4 | 2 |
| `src/server/pouls.test.ts` (à créer ; un cas en PR 2, deux en PR 2c) | `unit` | une présence `ok` au moniteur `worker-pouls` ; les comptes au-dessus de zéro, et eux seuls, deviennent des événements ; une lecture ratée ne lève pas | 2, 2c |
| `src/server/search/worker.test.ts` (existe, un cas de plus) | `unit` | le tic de reprise bat le pouls quand il a lu la base, pas quand la lecture échoue | 2 |
| `src/server/db/migrations/NNNN-compteurs-exploitation.db.test.ts` (à créer) | `db` | chaque compte voit son cas, ignore les cas voisins ; aucun droit pour `public` | 2c |
| `src/server/db/latence.test.ts` (à créer) | `unit` | centiles au rang le plus proche, ordre indifférent, liste vide refusée, mesure avec l'horloge donnée | 2b |
| `src/test/contracts/env-contract.test.ts`, `scripts-contract.test.ts`, `privileges.test.ts` (existent) | `unit` | inchangés ; ils doivent passer avec `LEON_ROLE=` et `# NEXT_MANUAL_SIG_HANDLE=` dans `.env.example`, et le script `db:latence` | 2, 2b |
| `src/test/contracts/porte-surface.test.ts` (chapitre 03, PR W5) | `unit` | une ligne change : `latence-cli.ts` appelle aussi les deux fonctions de la porte (écart E13-10) | 2b ou W5, la seconde des deux |
| `src/server/db/migrations/0046-pg-temp-en-dernier.db.test.ts` (existe) | `db` | inchangé ; il couvre `compteurs_exploitation` (`search_path = public, pg_temp`) | 2c |

Aucun test ne lance Railway, un vrai `SIGTERM` ni `process.exit` : la séquence se teste par `createShutdown`, avec de faux `exit`, `stopQueues` et `flush`. L'essai réel est le geste 8 de la bascule (15.2). La restriction de l'hôte de la porte (PR 2d) n'a pas de test unitaire : `next.config.ts` n'en a aucun aujourd'hui, et les contrôles `curl` de la section 11 la vérifient en ligne.

### `src/server/shutdown.test.ts` (à créer), en entier

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logError } from '@/server/log';

vi.mock('@/server/log', () => ({ logError: vi.fn() }));
// Le module branche son instance par défaut sur stopBoss et Sentry.flush : ni pg-boss, ni base, ni Sentry ici.
vi.mock('@/server/pipeline/queue', () => ({ stopBoss: vi.fn(async () => {}) }));
vi.mock('@sentry/nextjs', () => ({ flush: vi.fn(async () => true) }));

const {
  createShutdown,
  FLUSH_TIMEOUT_MS,
  HOOK_TIMEOUT_MS,
  QUEUES_STOP_TIMEOUT_MS,
  registerShutdown,
  ShutdownTimeout,
} = await import('./shutdown');
type Deps = Parameters<typeof createShutdown>[0];

function harness(overrides: Partial<Deps> = {}) {
  const order: string[] = [];
  const exit = vi.fn((code: number) => {
    order.push(`sortie ${code}`);
  });
  const stopQueues = vi.fn(async (timeoutMs: number) => {
    order.push(`files ${timeoutMs}`);
  });
  const flush = vi.fn(async (timeoutMs: number) => {
    order.push(`sentry ${timeoutMs}`);
  });
  const shutdown = createShutdown({ stopQueues, flush, exit, now: () => 0, ...overrides });
  return { shutdown, order, exit, stopQueues, flush };
}

const QUEUES = `files ${QUEUES_STOP_TIMEOUT_MS}`;
const SENTRY = `sentry ${FLUSH_TIMEOUT_MS}`;

beforeEach(() => {
  vi.mocked(logError).mockClear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('arrêt propre', () => {
  it('lève le signal, fait les crochets dans l’ordre, arrête les files, vide Sentry, puis sort en 0', async () => {
    const { shutdown, order, exit } = harness();
    shutdown.onShutdown('a', async () => {
      order.push('a');
    });
    shutdown.onShutdown('b', async () => {
      order.push('b');
    });
    expect(shutdown.signal.aborted).toBe(false);

    await shutdown.stop('SIGTERM');

    expect(shutdown.signal.aborted).toBe(true);
    expect(order).toEqual(['a', 'b', QUEUES, SENTRY, 'sortie 0']);
    expect(exit).toHaveBeenCalledOnce();
  });

  // Le moteur doit cesser de commencer des étapes avant que pg-boss n'attende ses jobs.
  it('lève le signal avant le premier crochet', async () => {
    const { shutdown } = harness();
    let seen = false;
    shutdown.onShutdown('a', async () => {
      seen = shutdown.signal.aborted;
    });

    await shutdown.stop('SIGTERM');

    expect(seen).toBe(true);
  });

  it('journalise un crochet qui échoue, et arrête quand même les files', async () => {
    const { shutdown, order } = harness();
    shutdown.onShutdown('casse', async () => {
      throw new Error('boum');
    });

    await shutdown.stop('SIGTERM');

    expect(logError).toHaveBeenCalledWith('shutdown.hook', expect.any(Error), { hook: 'casse' });
    expect(order).toEqual([QUEUES, SENTRY, 'sortie 0']);
  });

  it('coupe un crochet bloqué après HOOK_TIMEOUT_MS, sans prendre le temps des files', async () => {
    vi.useFakeTimers();
    const { shutdown, order } = harness();
    shutdown.onShutdown('bloque', () => new Promise<void>(() => {}));

    const done = shutdown.stop('SIGTERM');
    await vi.advanceTimersByTimeAsync(HOOK_TIMEOUT_MS);
    await done;

    expect(logError).toHaveBeenCalledWith('shutdown.hook', expect.any(ShutdownTimeout), {
      hook: 'bloque',
    });
    expect(order).toEqual([QUEUES, SENTRY, 'sortie 0']);
  });

  // L'erreur shutdown.queues est celle que l'alerte de Sentry attend : elle doit partir avant la sortie.
  it('quand pg-boss ne rend pas la main, journalise, vide Sentry, puis sort en 0', async () => {
    vi.useFakeTimers();
    const { shutdown, order } = harness({ stopQueues: () => new Promise<void>(() => {}) });

    const done = shutdown.stop('SIGTERM');
    await vi.advanceTimersByTimeAsync(QUEUES_STOP_TIMEOUT_MS + 2_000);
    await done;

    expect(logError).toHaveBeenCalledWith('shutdown.queues', expect.any(ShutdownTimeout));
    expect(order).toEqual([SENTRY, 'sortie 0']);
  });

  it('sort quand même si Sentry ne répond pas, après son délai et la marge', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { shutdown, exit } = harness({ flush: () => new Promise<void>(() => {}) });

    const done = shutdown.stop('SIGTERM');
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS + 500);
    await done;

    expect(exit).toHaveBeenCalledWith(0);
  });

  it('sort tout de suite, en code 1, au second signal', () => {
    vi.useFakeTimers();
    const { shutdown, exit } = harness({ stopQueues: () => new Promise<void>(() => {}) });

    void shutdown.stop('SIGTERM');
    void shutdown.stop('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('ignore un crochet inscrit une fois l’arrêt commencé', async () => {
    const { shutdown, order } = harness();
    shutdown.onShutdown('a', async () => {
      shutdown.onShutdown('tard', async () => {
        order.push('tard');
      });
    });

    await shutdown.stop('SIGTERM');

    expect(order).not.toContain('tard');
  });
});

describe('registerShutdown', () => {
  it('branche SIGTERM une seule fois, même appelé deux fois (rechargement à chaud)', () => {
    delete (globalThis as { leonShutdownRegistered?: boolean }).leonShutdownRegistered;
    const on = vi.fn();
    const target = { on } as unknown as Pick<NodeJS.Process, 'on'>;

    registerShutdown(target);
    registerShutdown(target);

    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });
});
```

### `src/server/role.test.ts` (à créer), en entier

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ env: {} as { LEON_ROLE?: 'web' | 'worker' | 'tout' } }));
vi.mock('@/server/env', () => ({ env: mocks.env }));

const { leonRole, runsWorkers } = await import('./role');

beforeEach(() => {
  delete mocks.env.LEON_ROLE;
});

describe('rôle du processus', () => {
  it('vaut tout quand LEON_ROLE est absente, et lit alors les files', () => {
    expect(leonRole()).toBe('tout');
    expect(runsWorkers()).toBe(true);
  });

  it('ne lit aucune file dans le service web', () => {
    mocks.env.LEON_ROLE = 'web';
    expect(runsWorkers()).toBe(false);
  });

  it('lit les files dans le service worker', () => {
    mocks.env.LEON_ROLE = 'worker';
    expect(runsWorkers()).toBe(true);
  });

  it('relit le rôle à chaque appel', () => {
    mocks.env.LEON_ROLE = 'web';
    expect(leonRole()).toBe('web');
    mocks.env.LEON_ROLE = 'worker';
    expect(leonRole()).toBe('worker');
  });
});
```

### `src/server/env.test.ts` (existe) : deux cas, dans `describe('parseEnv')`

```ts
  // Dossier agents, chapitre 13 : un code, deux services.
  it('lit LEON_ROLE : web, worker ou tout ; vide ou absente vaut absente (tout, par role.ts)', () => {
    expect(parseEnv(TEST_ENV).LEON_ROLE).toBeUndefined();
    expect(parseEnv({ ...TEST_ENV, LEON_ROLE: '' }).LEON_ROLE).toBeUndefined();
    for (const role of ['web', 'worker', 'tout'] as const) {
      expect(parseEnv({ ...TEST_ENV, LEON_ROLE: role }).LEON_ROLE).toBe(role);
    }
  });

  it('refuse un rôle inconnu plutôt que de tout lancer', () => {
    for (const LEON_ROLE of ['Worker', 'workers', 'all']) {
      expect(() => parseEnv({ ...TEST_ENV, LEON_ROLE })).toThrow(/LEON_ROLE : web, worker ou tout/);
    }
  });
```

### `src/instrumentation-node.test.ts` (existe) : les retouches

```ts
// Dans le type de mocks.env (lignes 4-10) :
    LEON_ROLE?: string;
    NODE_ENV?: string;

// Avec les autres vi.mock (lignes 14-50). Le chapitre 04 (PR 6b) n'y ajoutera que son moteur : il garde ces trois clés.
vi.mock('@/server/shutdown', () => ({
  registerShutdown: vi.fn(),
  onShutdown: vi.fn(),
  stoppingSignal: new AbortController().signal,
}));

// Avec les autres imports dynamiques (lignes 52-58) :
const { registerShutdown } = await import('@/server/shutdown');

// Dans beforeEach (lignes 62-77) :
  delete mocks.env.LEON_ROLE;
  delete mocks.env.NODE_ENV;
  vi.mocked(registerShutdown).mockClear();

// Un describe de plus :
describe('rôle du processus (LEON_ROLE)', () => {
  it('dans web, ne lance ni worker ni arrêt propre, mais prévient des paires OAuth incomplètes', async () => {
    mocks.env.LEON_ROLE = 'web';
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual([]);
    expect(registerShutdown).not.toHaveBeenCalled();
    expect(warnIncompleteOAuthPairs).toHaveBeenCalledOnce();
  });

  it('dans web aussi, échoue franchement sur un fournisseur de vecteurs non livré', async () => {
    Object.assign(mocks.env, {
      LEON_ROLE: 'web',
      LEON_EMBEDDINGS: 'voyage',
      VOYAGE_API_KEY: 'cle-de-test',
    });

    await expect(startNodeInstrumentation()).rejects.toThrow('LEON_EMBEDDINGS=voyage');
  });

  it.each(['worker', undefined])(
    'avec LEON_ROLE=%s, enregistre l’arrêt propre avant le premier worker, puis lance tout',
    async (role) => {
      if (role) mocks.env.LEON_ROLE = role;
      mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

      await startNodeInstrumentation();

      expect(mocks.order).toEqual([
        'recherche',
        'point',
        'resume',
        'fils',
        'liens',
        'etats',
        'connecteurs',
      ]);
      expect(registerShutdown).toHaveBeenCalledOnce();
      const [shutdownAt] = vi.mocked(registerShutdown).mock.invocationCallOrder;
      const [searchAt] = vi.mocked(startSearchWorker).mock.invocationCallOrder;
      expect(shutdownAt ?? Number.POSITIVE_INFINITY).toBeLessThan(searchAt ?? 0);
    },
  );

  it('prévient quand LEON_ROLE manque en production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.env.NODE_ENV = 'production';
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

    await startNodeInstrumentation();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LEON_ROLE absente en production'));
  });
});
```

`role.ts` n'est pas moqué : il lit le faux `env` de ce fichier (`vi.mock('@/server/env')`, ligne 14). Les listes d'ordre existantes ne changent pas : `registerShutdown` ne pousse rien dans `mocks.order`. Le chapitre 04 ajoutera « agents » à ces listes (PR 6b).

### `src/server/pipeline/queue.test.ts` (existe) : un cas

```ts
// stopBoss rejoint l'import de './queue' (ligne 5).
describe('stopBoss', () => {
  it('ne démarre pas pg-boss pour l’arrêter, quand il n’a jamais démarré dans ce processus', async () => {
    await expect(stopBoss({ timeoutMs: 10 })).resolves.toBeUndefined();
    expect((globalThis as { leonBoss?: unknown }).leonBoss).toBeUndefined();
  });
});
```

### `src/server/db/latence.test.ts` (à créer), en entier

```ts
import { describe, expect, it } from 'vitest';
import { summarize, timeEach } from './latence';

describe('summarize', () => {
  it('rend la médiane, le 95e centile et le maximum, au rang le plus proche', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarize(samples)).toEqual({ p50: 50, p95: 95, max: 100, n: 100 });
  });

  it('ne dépend pas de l’ordre des mesures', () => {
    expect(summarize([3, 1, 2])).toEqual(summarize([1, 2, 3]));
  });

  it('refuse une liste vide', () => {
    expect(() => summarize([])).toThrow();
  });
});

describe('timeEach', () => {
  it('mesure chaque passage avec l’horloge donnée', async () => {
    let clock = 0;
    const samples = await timeEach(
      3,
      async () => {
        clock += 5;
      },
      () => clock,
    );
    expect(samples).toEqual([5, 5, 5]);
  });
});
```

### `src/server/pouls.test.ts` (à créer), en entier après la PR 2c

La PR 2 en écrit le premier `describe`, avec le seul `vi.mock('@sentry/nextjs')` ; la PR 2c ajoute les deux autres `vi.mock` et le second `describe`.

```ts
import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logError } from '@/server/log';
import { POULS_MARGIN_MINUTES, POULS_MONITOR, pouls, surveillerExecutions } from './pouls';

// vi.mock et vi.hoisted passent avant les imports : ./pouls reçoit les faux.
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureCheckIn: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
// La fonction SQL a son propre test en base (NNNN-compteurs-exploitation.db.test.ts).
vi.mock('@/server/db/client', () => ({ db: { execute: mocks.execute } }));

beforeEach(() => {
  vi.mocked(Sentry.captureCheckIn).mockClear();
  vi.mocked(logError).mockClear();
  mocks.execute.mockReset();
});

describe('pouls', () => {
  it('envoie une présence « ok » au moniteur du worker, attendue chaque minute', () => {
    pouls();

    expect(Sentry.captureCheckIn).toHaveBeenCalledExactlyOnceWith(
      { monitorSlug: POULS_MONITOR, status: 'ok' },
      expect.objectContaining({
        schedule: { type: 'crontab', value: '* * * * *' },
        checkinMargin: POULS_MARGIN_MINUTES,
      }),
    );
  });
});

describe('surveillerExecutions', () => {
  it('fait un événement de chaque compte au-dessus de zéro, et d’eux seuls', async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ verrous_perimes: 2, reveils_en_retard: 0, attentes_longues: 0, journaux_vides: 1 }],
    });

    await surveillerExecutions();

    expect(vi.mocked(logError).mock.calls.map(([event, , ids]) => [event, ids])).toEqual([
      ['exploitation.verrous_perimes', { valeur: '2' }],
      ['exploitation.journaux_vides', { valeur: '1' }],
    ]);
  });

  it('ne lève pas quand la lecture échoue : le tic qui l’appelle continue', async () => {
    mocks.execute.mockRejectedValue(new Error('fonction absente'));

    await expect(surveillerExecutions()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith('exploitation.read_failed', expect.any(Error));
  });
});
```

### `src/server/search/worker.test.ts` (existe) : un cas en PR 2, un en PR 2c

```ts
// Dans mocks (vi.hoisted, lignes 9-20) :
  pouls: vi.fn(),
  surveillerExecutions: vi.fn(), // PR 2c

// Avec les autres vi.mock (lignes 22-41) ; surveillerExecutions en PR 2c :
vi.mock('@/server/pouls', () => ({
  pouls: mocks.pouls,
  surveillerExecutions: mocks.surveillerExecutions,
}));

// Dans describe('startSearchWorker') :
  it('bat le pouls du worker quand le tic de reprise a lu la base, et pas quand la lecture échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startSearchWorker({ embedder: null });

    await handlerOf('pipeline-requeue')();
    expect(mocks.pouls).toHaveBeenCalledOnce();

    mocks.requeueStaleRuns.mockRejectedValueOnce(new Error('base injoignable'));
    await expect(handlerOf('pipeline-requeue')()).rejects.toThrow();
    expect(mocks.pouls).toHaveBeenCalledOnce();
  });

  // PR 2c.
  it('relit les comptes d’exploitation une fois par heure, avec la purge', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10 * 3_600_000);
    await startSearchWorker({ embedder: null });

    await handlerOf('pipeline-requeue')();
    now.mockReturnValue(10 * 3_600_000 + 59 * 60_000);
    await handlerOf('pipeline-requeue')();
    now.mockReturnValue(11 * 3_600_000);
    await handlerOf('pipeline-requeue')();

    expect(mocks.surveillerExecutions).toHaveBeenCalledTimes(2);
  });
```

`beforeEach` remet déjà chaque mock à zéro (`for (const mock of Object.values(mocks)) mock.mockReset()`, ligne 67) : rien d'autre à changer.

### `src/server/db/migrations/NNNN-compteurs-exploitation.db.test.ts` (à créer, PR 2c), en entier

```ts
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { hex64 } from '@/test/seed-agents';

// Migration NNNN : des comptes d'exploitation sur les exécutions d'agent, toutes organisations (dossier agents,
// chapitre 13, section 13.3). La base de test est partagée : chaque cas lit les comptes avant et après ses propres
// lignes, dans une transaction en lecture répétable, annulée à la fin. Les autres fichiers n'y changent rien, et
// aucune exécution « due » ne reste pour les tics des autres tests.

const NAMES = [
  'verrous_perimes',
  'reveils_en_retard',
  'attentes_longues',
  'journaux_vides',
] as const;
type Counters = Record<(typeof NAMES)[number], number>;
const MINUTE = 60_000;
const DAY = 86_400_000;
const NONE: Counters = {
  verrous_perimes: 0,
  reveils_en_retard: 0,
  attentes_longues: 0,
  journaux_vides: 0,
};

// Une exécution de test ; les dates sont des durées avant maintenant (négatives : dans le futur).
type Row = {
  statut: string;
  verrou?: number;
  reveil?: number;
  cree?: number;
  fini?: number;
  erreur?: string;
  reprises?: number;
};

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

async function person(): Promise<TenantContext> {
  const { tenantId, members } = await createTestTenant(['Alice']);
  tenantIds.push(tenantId);
  return members[0] as TenantContext;
}

const INSERT = `
  insert into executions_agent (tenant_id, user_id, agent_id, agent_version, cle_objet, declencheur,
    cle, statut, raison, autonomie, acl, verrou_le, reveil_le, cree_le, fini_le, erreur, reprises)
  values ($1, $2, 'suivi_echange', 1, 'fathom:meeting:1', 'evenement', $3,
    $4, case when $4 = 'echouee' then 'erreur' end, 'propose', array[$2::uuid], $5, $6,
    coalesce($7, now()), $8, $9, $10)`;

async function read(client: PoolClient): Promise<Counters> {
  const { rows } = await client.query<Counters>('select * from compteurs_exploitation()');
  if (!rows[0]) throw new Error('compteurs_exploitation ne rend rien');
  return rows[0];
}

// Ce que les lignes de `rows` ajoutent à chaque compte.
async function delta(ctx: TenantContext, rows: Row[]): Promise<Counters> {
  const at = (ms?: number) => (ms === undefined ? null : new Date(Date.now() - ms));
  const client = await adminPool.connect();
  try {
    await client.query('begin isolation level repeatable read');
    const before = await read(client);
    for (const row of rows) {
      await client.query(INSERT, [
        ctx.tenantId,
        ctx.userId,
        hex64(),
        row.statut,
        at(row.verrou),
        at(row.reveil),
        at(row.cree),
        at(row.fini),
        row.erreur ?? null,
        row.reprises ?? 0,
      ]);
    }
    const after = await read(client);
    return Object.fromEntries(NAMES.map((name) => [name, after[name] - before[name]])) as Counters;
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('compteurs_exploitation', () => {
  it('compte un verrou périmé de 10 minutes, ni un verrou vivant, ni une exécution reprise 3 fois', async () => {
    const rows = [
      { statut: 'en-cours', verrou: 11 * MINUTE },
      { statut: 'en-cours', verrou: MINUTE },
      { statut: 'en-cours', verrou: 11 * MINUTE, reprises: 3 },
    ];
    expect(await delta(await person(), rows)).toEqual({ ...NONE, verrous_perimes: 1 });
  });

  it('compte une minuterie échue depuis 10 minutes, ni une récente, ni une à venir', async () => {
    const rows = [
      { statut: 'en-attente', reveil: 11 * MINUTE },
      { statut: 'en-attente', reveil: MINUTE },
      { statut: 'en-attente', reveil: -DAY },
    ];
    expect(await delta(await person(), rows)).toEqual({ ...NONE, reveils_en_retard: 1 });
  });

  it('compte une attente de plus de 7 jours, ni une de 6 jours, ni une exécution finie', async () => {
    const rows = [
      { statut: 'en-attente', cree: 8 * DAY, reveil: -DAY },
      { statut: 'en-attente', cree: 6 * DAY, reveil: -DAY },
      { statut: 'faite', cree: 8 * DAY, fini: 7 * DAY },
    ];
    expect(await delta(await person(), rows)).toEqual({ ...NONE, attentes_longues: 1 });
  });

  it('compte les journaux vidés du dernier jour, ni les plus anciens, ni les autres échecs', async () => {
    const rows = [
      { statut: 'echouee', erreur: 'journal_vide', fini: 60 * MINUTE },
      { statut: 'echouee', erreur: 'journal_vide', fini: 2 * DAY },
      { statut: 'echouee', erreur: 'reprises', fini: 60 * MINUTE },
    ];
    expect(await delta(await person(), rows)).toEqual({ ...NONE, journaux_vides: 1 });
  });

  // Le droit d'exécuter est donné à leon_app, retiré à public (« =X/… » dans l'ACL de la fonction).
  it('s’exécute par leon_app, pas par tout le monde', async () => {
    const { rows } = await adminPool.query<{ acl: string }>(
      `select proacl::text as acl from pg_proc where proname = 'compteurs_exploitation'`,
    );
    expect(rows[0]?.acl).toContain('leon_app=X/');
    expect(rows[0]?.acl).not.toMatch(/[{,]=X\//);
  });
});
```

Les colonnes et contraintes d'`executions_agent` sont celles du chapitre 01 (`0079`) : `raison` vaut `erreur` pour une exécution `echouee`, un `en-cours` porte toujours son verrou (`executions_agent_verrou_check`). Si `0079` change en route, l'`INSERT` suit.

## Ordre de mise en œuvre

Une PR par sujet (`CLAUDE.md`). Les opérations sur Railway et sur la base ne sont pas des PR ; elles sont rangées à leur place dans la suite.

| # | Branche | Contenu | Jalon | Après | Ce que l'autre vérifie |
|---|---|---|---|---|---|
| 0 | `<prenom>/railway-config` | Gestes 1 à 3 de 3.3 (avant, par un humain qui a les droits Railway), suppression de `railway.json`, textes de 3.4 ; gestes 5 à 8 selon la ligne du tableau de 3.3 qui s'applique | 1, **avant le 1er décembre 2026** | rien | Les réponses aux quatre questions de 3.2, la ligne du tableau de 3.3 retenue, les captures des neuf champs avant et après |
| 1 | `<prenom>/pg-boss-12-38` | `pg-boss` 12.38.2 (`package.json`, `pnpm-lock.yaml`), `src/server/pipeline/pgboss.db.test.ts` | 1 | 0 | Les options de `stop` lues dans les types ; la version du schéma `pgboss` avant et après ; si la 12.37.1 démarre sur le schéma neuf (14.1, pour 15.4) |
| 2 | `<prenom>/deux-services` | `LEON_ROLES`, `LeonRole` et `LEON_ROLE` dans `env.ts` ; `role.ts` ; `shutdown.ts` (vidage de Sentry compris) ; `stopBoss` dans `pipeline/queue.ts` ; `pouls.ts` et sa ligne dans `search/worker.ts` (13.2) ; `poolMax`, délai et écouteur dans `db/client.ts` ; `instrumentation-node.ts` (7.1) ; étiquette `role` dans `sentry.server.config.ts` ; `.env.example` (`LEON_ROLE=`, `# NEXT_MANUAL_SIG_HANDLE=`) ; README (section 16) ; les tests de la PR 2 | 1 | 1 (`stopBoss` suppose les options lues en PR 1) | `pnpm test:unit` vert ; en ligne, le service unique dit `rôle du processus : tout` et rien d'autre ne change |
| — | opération | Les trois premières règles d'alerte de 13.4 (pouls manquant, arrêt qui déborde, nouvelle erreur du worker) | 1 | 2 en ligne | Une présence reçue par `worker-pouls` |
| — | opération | La bascule (15.2), gestes 1 à 11 | 1 | 2 en ligne | Les gestes 6, 8, 10 et 11, notés dans la PR 2 après coup (commentaire) |
| 2b | `<prenom>/mesure-latence` | `src/server/db/latence.ts`, `latence-cli.ts`, `latence.test.ts`, script `db:latence` ; mesure lancée depuis `web` (12.4) ; si W5 est déjà fusionnée, la ligne de `porte-surface.test.ts` (E13-10) | 1 pour l'aller-retour ; la porte après 0083 | la bascule | Les lignes de résultat, la mesure `curl` et la région du service |
| 2c | `<prenom>/comptes-exploitation` | Migration `NNNN-compteurs-exploitation.sql` et son test ; `surveillerExecutions()` dans `pouls.ts` ; sa ligne dans la branche horaire de `search/worker.ts` ; tests (13.3) ; puis les règles « Exécutions coincées » et « Attentes longues, journaux vidés » (13.4) | 1 | 0079 et la PR 6b en ligne | Le numéro de migration libre ; aucun compte au-dessus de zéro au premier passage, sinon une raison |
| — | opération | Webhooks : `leon_porte` (10.1), domaine (11), variables, vérification de `LEON_IP_HEADER` (11, geste 6), règle « Clé de la porte », mise en ligne (15.5) | après | chapitres 01 (0083) et 03 | 10.2 et 11, gestes 5 et 6 ; la mesure de 12 avec la porte |
| 2d | `<prenom>/porte-hote` | `next.config.ts` : `hostOf`, `porteHostOnly`, `rewrites()` en forme objet (11, geste 7) | après | la porte en Hono (chapitre 03, W5) ; avant le premier abonnement | Les six `curl` de la section 11 |
| — | chapitre 15 | Service `porte` : réglages de la colonne de droite du tableau 4.1, variables du tableau 9, bascule du domaine | après | une mesure de l'architecture, section 3, ou la décision de David (Q1) | chapitre 15 |

Les PR 3 à 9 du jalon 1 (architecture 14.3) ne touchent pas à l'infrastructure, sauf trois lignes déjà situées ici : les variables `LEON_MODEL_TRI`, `_LECTURE`, `_DECISION`, `_REDACTION` à poser sur les deux services avant la fusion de la PR 3 (section 9, règle 5 de 15.3) ; `startStandardWorker` (PR 5) et `startAgentsWorker` (PR 6b) dans le bloc `runsWorkers()` (7.2).

## Écarts avec l'architecture

| # | Ce que dit l'architecture (ou un chapitre) | Ce qui heurte, avec la preuve | Proposition |
|---|---|---|---|
| E13-1 | Chapitre 01, 15.4 : la ligne `LEON_ROLE=` de `.env.example` entre « PR n° 0 (chapitre 13) » | Architecture 14.3 : `LEON_ROLE` est dans la PR 2, la PR n° 0 est « seule ». Et `env-contract.test.ts:59-62` refuse une variable documentée que le code ne lit pas : la ligne doit venir avec `env.ts` | La ligne entre dans la PR 2. Corriger la ligne du tableau du chapitre 01 en « PR 2 (chapitre 13) » |
| E13-2 | Architecture 4.1, règle 1 : `shutdown.ts`, enregistré par `instrumentation-node.ts`, lève `stopping` sur `SIGTERM` puis appelle `boss.stop` ; `drainingSeconds` 60 pour `worker`, 35 pour `web` | Le worker lance Next (architecture 4), et `next start` pose son propre gestionnaire de `SIGTERM`, qui sort dès son serveur HTTP fermé, sauf si `NEXT_MANUAL_SIG_HANDLE` est posée (documentation de Next, à vérifier pour la 16.4.5). Les deux gestionnaires ensemble couperaient `boss.stop` | `NEXT_MANUAL_SIG_HANDLE=true` sur le seul service `worker`, en variable Railway (pas dans le script `start`, qui la donnerait aussi à `web`). `registerShutdown()` n'est appelée que si `runsWorkers()`. `web` garde l'arrêt de Next ; ses 35 s ne servent que si Next attend les requêtes en cours (à vérifier). L'essai réel est le geste 8 de la bascule (15.2) |
| E13-3 | Architecture 4.1, règle 1 : `boss.stop({ graceful: true, timeout: 45_000 })` | Appeler `getBoss()` pour arrêter démarrerait pg-boss dans un processus où il n'a jamais tourné (`pipeline/queue.ts:109-115`) | `stopBoss({ timeoutMs })`, nouvel export de `pipeline/queue.ts`, ne fait rien si pg-boss n'a pas démarré ; il passe aussi `wait: true` (à vérifier). Les crochets sont bornés à 5 s, et Sentry est vidé avant la sortie (2,5 s) : l'arrêt tient en 54,5 s, sous les 60 s |
| E13-4 | Chapitre 03, 8.3 et 8.4 : « Le chapitre 13 […] appelle `stopPorteListener()` dans `shutdown.ts` » | `shutdown.ts` naît avec la PR 2, avant `webhooks/worker.ts` : il ne peut pas l'importer, et l'importer plus tard ferait dépendre l'arrêt de tous les modules qu'il doit arrêter | `shutdown.ts` exporte `onShutdown(name, run)`. La PR des webhooks ajoute dans `instrumentation-node.ts`, après `startWebhooksWorker()` : `onShutdown('porte.ecoute', stopPorteListener)` (7.2). Le code du chapitre 03 ne change pas |
| E13-5 | Chapitre 04, 11.3 : la PR 6b moque `@/server/shutdown` par `{ stoppingSignal }` seul | Après la PR 2, `instrumentation-node.ts` appelle `registerShutdown()` : avec ce mock, le test lèverait `registerShutdown is not a function` | La PR 6b garde le mock de la PR 2 (`registerShutdown`, `onShutdown`, `stoppingSignal`) et n'ajoute que celui de `@/server/agents/worker`. L'écart E04-13 est accepté : `stoppingSignal` et `isStopping()` sont exportés tous les deux |
| E13-6 | Chapitre 03 : réécriture `/h/:chemin*` vers `/api/v1/porte/h/:chemin*` dans `next.config.ts`, sans condition ; `portePool` à 2 connexions, fermées par `pg` après 10 s d'inactivité | Tant que `porte.<domaine>` pointe sur `web`, tout le site répond sous ce domaine, et la porte sous le domaine du site (section 11). Une connexion fermée fait payer une poignée de main TLS au webhook suivant (section 12) | La restriction de l'hôte est faite ici, puisque le domaine est de ce chapitre : PR 2d (section 11, geste 7), qui fait passer `rewrites()` du chapitre 03 de la forme tableau à la forme objet (`beforeFiles` : l'hôte de la porte ne sert que `/h/…` et `/api/health` ; `afterFiles` : la réécriture du chapitre 03, inchangée). Au chapitre 03 : le savoir, et poser `idleTimeoutMillis: 0` sur `portePool` si la mesure de 12 donne un p95 de connexion neuve au-dessus de 500 ms |
| E13-7 | Architecture, section 2 et écart E7 : le remplaçant de `railway.json` est `.railway/railway.ts` (note 02) | La documentation de Railway n'a pas pu être lue ici. Et un fichier de configuration à la racine vaut pour tous les services du dépôt, alors que `web` et `worker` ont des `drainingSeconds` différents | La PR n° 0 range les réglages sur le tableau de bord, service par service, et les recopie (section 4, README). `.railway/railway.ts` n'entre que dans une PR à part, une fois son format lu |
| E13-8 | Architecture 4.1, règle 6 : une migration reste compatible avec le code précédent ; le pré-déploiement garantit qu'aucun service ne démarre en avance sur le schéma | pg-boss migre ses propres tables au démarrage, sous `leon_app` (`createSchema: false`, `0001-base.sql:11-13`), hors du pré-déploiement : la montée de la PR 1 peut changer ce schéma sous l'ancienne version (à vérifier) | La PR 1 lit `pgboss.version` avant et après (14.1). Si elle change, mise en ligne hors des heures de travail, et le recouvrement est écrit dans la PR |
| E13-9 | Architecture 4.1, en tête : « Éviter de mettre en ligne pendant une relève […] n'est plus tenable » ; règles 1 à 6 | L'arrêt propre ne sert que les jobs qui finissent en 45 s ou qui lisent le signal (le moteur). Une relève plus longue est coupée par `SIGKILL` : sa connexion garde `sync_lock_at` 30 minutes (`0019-corrections-audit.sql:62`) et son job expire après 1 800 s (`connectors/worker.ts:10`) | Admis au jalon 1 : rien n'est perdu, la relève suivante attend au plus 30 minutes. Après : passer `stoppingSignal` à `runConnectorSync` (une PR de connecteurs) pour s'arrêter entre deux pages et rendre le verrou |
| E13-10 | Chapitre 03, 13.5 : le contrat `porte-surface.test.ts` exige que seul `src/server/webhooks/hono-gate.ts` appelle `porte_secret(` et `porte_deposer(` dans les sources de production (`productionSources('src/**/*.{ts,tsx}')`, qui n'écarte que les `*.test.ts(x)`, `src/test/contracts/files.ts`) | `src/server/db/latence-cli.ts` (12.3) appelle les deux fonctions, pour les mesurer : le contrat échouerait dès que la PR W5 et la PR 2b sont toutes deux fusionnées | Au chapitre 03 : `expect(callers).toEqual([GATE, 'src/server/db/latence-cli.ts'].sort())`, avec en commentaire « la mesure de latence du chapitre 13, sous leon_porte, qui n'écrit rien ». Celle des deux PR qui passe en second change la ligne. Sortir le script de `src/` le soustrairait au contrat, mais aussi à `scripts-contract.test.ts` et au typage : écarté |
| E13-11 | Chapitre 02, section 12 et F12 : `CLOCK_CATCH_UP_MINUTES` vaut 5 « en attendant », et se fixe « sur la durée mesurée d'une mise en ligne (chapitre 13) » | Une mise en ligne ordinaire ne laisse presque aucun trou de lecture (recouvrement, `overlapSeconds` 0) ; le trou ordinaire le plus long est le redémarrage après un plantage, estimé à 3 à 5 minutes (13.5) | `CLOCK_CATCH_UP_MINUTES = 10` au chapitre 02, à relire après le premier plantage réel (méthode en 13.5). Le critère est le redémarrage, pas la mise en ligne : corriger le texte du chapitre 02 en ce sens |
| E13-12 | Architecture 7.4 : la liste des fonctions SQL nouvelles ; chapitre 01 : les numéros 0075 à 0085, réservés | Le chapitre 04 (9.7) confie ici la surveillance des exécutions ; elle traverse les organisations et demande une fonction `security definer` que ni l'architecture ni le chapitre 01 ne prévoient | `compteurs_exploitation()` (13.3), dans une migration de ce chapitre au numéro libre suivant, après `0079`. Des nombres seulement, droit à `leon_app` seul. Proposition : l'ajouter en 7.4. Autre voie, si le chapitre 01 la préfère : la mettre dans `0079` même |

Ce que je garde tel quel, en le notant : `web` ouvre l'écoute de pg-boss sans s'en servir (8.2), comptée comme dans l'architecture ; `DATABASE_URL_ADMIN` est posée sur les deux services, prix de la règle 6 (4.1).

## Ce que je n'ai pas vérifié

- **La documentation de Railway**, injoignable depuis cette session : le format de `.railway/railway.ts` et `railway config apply` ; ce que deviennent les réglages au 1er décembre ; les noms des réglages sur le tableau de bord (mise en veille, attendre la CI, chemins surveillés, répliques, région) ; les variables partagées et leur syntaxe ; la création d'un service vide ; le sens exact de `drainingSeconds` et d'`overlapSeconds` ; le bilan de santé d'un service sans domaine ; ce que fait Railway quand le pré-déploiement ou le bilan de santé échoue, et quand une ancienne version sort en code 1 ; les commandes `railway logs`, `railway variables --kv`, `railway redeploy`, `railway ssh` ; la cible DNS d'un domaine personnalisé ; `RAILWAY_DOCKERFILE_PATH` ; la façon de couper le déploiement automatique d'un service, ou d'annuler un déploiement en construction (3.3) ; le passage des variables du service à la construction (PR 2d) ; le délai de relance d'un service sorti en erreur (13.5) ; l'en-tête que le proxy pose pour l'adresse du client, que l'essai de la section 11 (geste 6) tranche.
- **Next 16.4.5** : le gestionnaire de `SIGTERM` de `next start`, l'effet de `NEXT_MANUAL_SIG_HANDLE` posée en variable de service, l'attente des requêtes en cours à l'arrêt, l'attente de `register()` avant de servir, et ce qui se passe si `register()` lève ; la forme objet de `rewrites()`, `has: [{ type: 'host' }]`, le motif à exclusion `/:chemin((?!…).*)` et son effet sur `/`, l'ordre entre `src/proxy.ts` et les réécritures `beforeFiles` ; le chemin `node_modules/next/dist/bin/next`.
- **pnpm 11.0.8 et Railpack** : que `pnpm start` (puis le `sh -c` qui lance `next start`) transmette `SIGTERM` au processus de Next ; comment Railpack lance la commande de démarrage. Le geste 8 de 15.2 le tranche.
- **pg-boss 12.38.2** (`node_modules` absent) : les options `timeout`, `wait` et `close` de `stop`, `upsert` sur une file `stately`, le champ `startAfter` rendu par `findJobs`, `getJobById(name, id)`, l'état `'completed'`, la table `pgboss.version`, la migration de son schéma au démarrage, l'échec d'un envoi vers une file absente, le délai d'expiration par défaut d'un job.
- **pg 8.23.1** : la chute du processus sans écouteur `error` sur un pool, le message d'une attente dépassée (`connectionTimeoutMillis`), `idleTimeoutMillis` et son défaut.
- **Sentry** : `initialScope`, `Sentry.flush` (son retour) et `Sentry.captureCheckIn` (forme de la configuration du moniteur : `schedule`, `checkinMargin`, `maxRuntime`, `timezone`) dans `@sentry/nextjs` 11.11.0 ; la création du moniteur à la première présence, l'incident sur présence manquée et sa fermeture ; les options exactes des règles d'alerte de 13.4 ; le double envoi des cartes de sources sous une même version.
- **vitest** : `vi.advanceTimersByTimeAsync` sur une course entre une promesse et un faux minuteur (le patron de `shutdown.test.ts`), jamais lancé.
- **Aucune mesure** : mémoire et CPU des services, durée d'un build, latence entre Railway et RDS, nombre réel de connexions, `max_connections` de RDS (« ~200 » vient du commentaire de `client.ts:11`), durée d'un redémarrage après plantage. Les seuils de 12.1 (500 ms pour la promesse, 500 ms pour une connexion neuve) et la valeur 10 de `CLOCK_CATCH_UP_MINUTES` sont des choix raisonnés, pas des mesures. Si l'instance RDS est en Multi-AZ (coût de la validation) : à lire sur la console AWS. Les délais de réponse des éditeurs (3 s, 5 s) viennent des notes 04 à 07, en partie de sources tierces ; l'affichage de la durée des envois chez GitHub est de mémoire.
- **Ce qui tourne aujourd'hui** : le nom, la région et les réglages du service Railway actuel, le domaine du site (absent du dépôt).
- Que `pnpm add pg-boss@12.38.2` écrive la version sans `^`, et que l'image Railpack contienne `pnpm` et `tsx` à l'exécution (déduit du pré-déploiement, qui s'en sert).
- **Les colonnes d'`executions_agent`** utilisées par `compteurs_exploitation()` et son test (`verrou_le`, `reveil_le`, `cree_le`, `fini_le`, `erreur`, `reprises`, `raison`) viennent du texte du chapitre 01 (`0079`), pas d'une base ; d'éventuelles contraintes croisées entre `statut` et `raison` n'y sont pas toutes lues.
- **pg-boss 12.37.1 sur le schéma de la 12.38.2** : l'essai de 14.1 le tranche.
- Les chapitres 07, 10, 11, 12, 14 et 15 ne sont pas écrits : ce qui en est cité (`startStandardWorker({ engine })`, `startAgentsWorker`, `listenPorte`, `stopPorteListener`, `portePool`, le binaire de la porte) vient du texte des chapitres 02, 03 et 04, pas de code qui compile.
- Rien n'a été lancé : ni test, ni build, ni typage, ni commande `railway`, ni `psql` sur une base. Commandes lancées : la lecture des dates du certificat RDS (10.3) ; et, à la relecture, `biome check` (Biome 2.5.15, la version de `package.json`, installée hors du dépôt, avec les réglages de `biome.json`) sur chaque bloc TypeScript du chapitre extrait dans un fichier : les fichiers entiers passent le formatage, le tri des imports et le lint ; les fragments (lignes à insérer dans un objet ou une fonction) ne s'analysent pas seuls, et ont été vérifiés replacés dans un objet quand c'était possible (`next.config.ts`).

## Relecture contradictoire

Deux relectures (angle « code », C1 à C10 ; angle « fond », F1 à F11), vérifiées une à une dans le dépôt, l'architecture et les chapitres voisins.

| # | Objection | Décision | Ce qui a changé, ou pourquoi rien |
|---|---|---|---|
| C1 | `logError` ne fait que mettre en file chez Sentry, `exit(0)` suit : `shutdown.hook` et `shutdown.queues` ne partent jamais, l'alerte non plus | Retenue | `flush` dans `ShutdownDeps` (`Sentry.flush` en production), `FLUSH_TIMEOUT_MS` 2 s et `FLUSH_MARGIN_MS` 0,5 s, appelé sous `bounded` avant `exit(0)` ; budget 54,5 s (6.2, 6.3, 4.1, E13-3) ; deux cas de test (vidage avant la sortie, même si pg-boss pend ; sortie si Sentry pend) |
| C2 | `latence-cli.ts` appelle `porte_secret(` et `porte_deposer(` : le contrat `porte-surface.test.ts` du chapitre 03 échouerait | Retenue | Écart E13-10 : le contrat liste aussi `src/server/db/latence-cli.ts` ; dit en 12.3 et dans le tableau des tests ; la seconde des deux PR change la ligne |
| C3 | Avec deux services, changer de modèle de vecteurs n'est plus « arrêter, changer, relancer » ; la mise en garde du README disparaissait | Retenue | Règle 6 de 15.3 (worker arrêté, variable changée, `web` reparti, worker relancé) ; troisième point de « Un worker par base, un modèle » réécrit, mise en garde rétablie dans « En ligne » (section 16) ; renvoi depuis le tableau 9 |
| C4 | Le code ne passerait pas `pnpm lint` : ordre d'import, lignes de plus de 100 colonnes | Retenue en partie | Lignes reformatées (deux `console.warn`, `z.preprocess`, `console.error`, la déstructuration de `shutdown.test.ts`, `Object.assign`, `toEqual`), plus deux trouvées par Biome (`timeEach` dans `latence.test.ts`, `NAMES`). Ordre d'import écarté : Biome place `type Timing` avant `timeEach` (même lettre, majuscule d'abord), comme `questionNotWritten, type ReplyProgress, readReply` dans `src/components/discussion/read-reply.test.ts` ; Biome 2.5.15, lancé sur chaque bloc, le confirme |
| C5 | Le bloc `do` de `0083` est dans la section 11 du chapitre 01, pas la 6 | Retenue | Renvoi corrigé (section 10) |
| C6 | « Geste 3 de 15.2 » ne désigne pas l'essai de `NEXT_MANUAL_SIG_HANDLE` | Retenue | « Gestes 7 et 8 de 15.2 », deux fois (6.1) |
| C7 | Le tic des vecteurs peut dépasser 45 s (`queue.ts:26-28`), la puce disait « il tient » | Retenue | Puce de 4.1 réécrite : il peut être coupé, pg-boss le reprend, la file est `stately` |
| C8 | `pnpm start` transmet-il `SIGTERM` à Next ? Non vérifié, et le diagnostic du geste 8 serait faux | Retenue | Paragraphe en 6.1 ; commande de repli `node node_modules/next/dist/bin/next start` pour le seul `worker` (tableau 4.1) ; tableau de diagnostic au geste 8 de 15.2 selon les lignes du journal ; « Ce que je n'ai pas vérifié » |
| C9 | `gh pr merge --delete-branch` depuis un worktree, sans le ménage de `CLAUDE.md` | Retenue | `gh pr merge <numéro> --squash`, puis le bloc « Après la fusion » de `CLAUDE.md` depuis `~/leon`, avec `gh pr list --state merged` (15.1) |
| C10 | « Plus aucun job ne commence » est faux avant `boss.stop` | Retenue | Message « le moteur ne commence plus d'étape », commentaire dans `run()`, lignes de 6.1, 6.2 et du README précisées |
| F1 | Même objection que C1 | Retenue | Voir C1 |
| F2 | La mesure appelle la porte à vide : ni écriture, ni `NOTIFY`, ni validation ; le seuil de 300 ms n'a pas de base | Retenue, autrement | Mesure « écriture annulée » sur un abonnement réel de l'équipe (`begin`, les deux fonctions, `rollback` : rien ne reste, aucun worker réveillé), mesure `curl` du trajet HTTP, règle de 500 ms fondée sur les 3 s des éditeurs, promesse bloquée tant qu'elle n'est pas tenue (12.1, 12.3, 12.4, 15.5). Écartés : créer un abonnement et une organisation de mesure en production, et des livraisons signées réelles, qui écriraient dans la boîte d'entrée et réveilleraient le worker ; remplacés par les premières livraisons réelles de l'équipe |
| F3 | Le déploiement de la fusion de la PR n° 0 part peut-être sans réglages ; la PR dépend de réponses que le chapitre laisse ouvertes | Retenue | 3.3 réécrite en deux temps : qui fait quoi (un humain pour le tableau de bord), captures avant et après, tableau de décision selon les questions 3 et 4 (retaper avant, couper le déploiement automatique, ou annuler et redéployer) |
| F4 | Rien ne voit un worker vivant mais figé | Retenue en partie | Pouls `worker-pouls` (13.2) dans le tic de reprise existant ; comptes d'exploitation horaires (13.3) ; règles d'alerte (13.4). Écartée : la sortie du processus après N erreurs d'affilée, qui ferait d'une panne de RDS une boucle de redémarrages coupant les jobs ; pg-boss et `pg` se reconnectent seuls, et le pouls voit le cas visé |
| F5 | Le chapitre 02 attend d'ici la valeur de `CLOCK_CATCH_UP_MINUTES` | Retenue | 13.5 : 10, fondé sur le redémarrage après plantage (une mise en ligne ordinaire ne laisse presque aucun trou), méthode de relecture ; écart E13-11 |
| F6 | Les alertes que les chapitres 03 (`porte.secret_illisible`) et 04 (attentes de plus de 7 jours, `journal_vide`) confient ici manquent | Retenue | Règle « Clé de la porte » ; `compteurs_exploitation()` et `surveillerExecutions()` avec leurs alertes (13.3, 13.4, PR 2c) ; écart E13-12 (fonction SQL hors de l'architecture 7.4) ; tableau 13.5 |
| F7 | `x-real-ip` recopié sans vérification, alors que la limite de la porte en dépend | Retenue | Section 11, geste 6 : essai à deux adresses avec un en-tête forgé, 301 lectures vides ; préalable de 15.5 (étape 5) ; source `README.md:74-75` citée au tableau 9 |
| F8 | Une relève coupée garde `sync_lock_at` 30 minutes ; un crochet `onShutdown` pourrait le rendre | Écartée | Rendre le verrou demande une écriture sans issue dans `connections.ts`, sous le contexte de l'organisation (`finishSync` enregistre une issue ; aucune fonction ne le fait), donc une PR de connecteurs, pas d'infrastructure (`CLAUDE.md` : un sujet par PR). La correction propre, `stoppingSignal` lu entre deux pages puis `finishSync`, est déjà prévue (6.2, E13-9). Le coût reste borné : 30 minutes, pour une relève longue coupée par une mise en ligne |
| F9 | Même objection que C8 | Retenue | Voir C8 |
| F10 | Le retour arrière sous la PR 1 remettrait pg-boss 12.37.1 sur le schéma de la 12.38.2 | Retenue | Essai en 14.1 (la 12.37.1 sur la base de test montée) ; paragraphe « Ne pas revenir sous la PR 1 sans avoir lu ceci » en 15.4, avec la correction en avant ou la restauration |
| F11 | Tout le site répond sous `porte.<domaine>` ; la restriction n'était qu'une proposition au chapitre 03 | Retenue | PR 2d de ce chapitre (section 11, geste 7) : `porteHostOnly()` en `beforeFiles`, six contrôles `curl`, repli par `src/proxy.ts` si `/` passe ; étape 6 de 15.5 ; E13-6 mis à jour |
