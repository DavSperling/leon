# 03 - Moteur d'exécution des agents en tâche de fond : pg-boss ou moteur de flux durables

État des lieux au 19 novembre 2026. Recherche faite avec WebSearch (résumés qui citent les pages) et les registres npm et crates.io. Aucune page n'a été ouverte en entier : les chiffres de prix et de limites viennent de résumés de recherche, donc à reconfirmer avant un engagement.

Légende des natures : **officiel** (doc ou page de l'éditeur), **tiers** (presse, blog, comparatif), **déduit** (mon raisonnement). « À vérifier » = vient de ma mémoire, pas d'une source trouvée.

---

## 1. Résumé en dix lignes

1. Les besoins sont : reprise après panne en milieu d'étape, attente de plusieurs jours d'une validation humaine, minuteries de plusieurs jours, limites de débit par outil et par client, concurrence par clé, plusieurs instances, Postgres à Francfort, deux personnes pour l'exploiter.
2. pg-boss 12 couvre bien la file (au moins une fois, délai, reprise, clés d'unicité, files en ordre par clé). Il ne couvre pas un « flux durable » : pas de journal d'étapes, pas d'attente d'événement, pas de reprise au milieu d'un flux. Ces trois choses sont à écrire soi-même.
3. Deux moteurs collent au profil « Postgres, TypeScript, deux personnes » : **DBOS Transact** (bibliothèque, MIT, tout dans Postgres) et, un cran au-dessus, **Restate** (un binaire Rust, serveur BSL 1.1, SDK MIT).
4. **Temporal** est le choix des éditeurs d'agents établis (Dust, voir section 5). Il est le plus mûr, mais il ajoute un service à opérer ou un cloud à payer (50 $ le million d'actions, officiel), et un modèle de code (déterminisme) à apprendre.
5. Inngest, Hatchet, Trigger.dev sont des produits plus « plateforme ». Vercel Workflow, Cloudflare Workflows et Step Functions sont liés à un hébergeur : hors sujet pour une stack Railway + RDS.
6. Recommandation : garder pg-boss comme file de dépêche (le « standard »), écrire le moteur d'agents comme une boucle d'étapes rejouables avec journal en Postgres, derrière une petite interface, et prévoir DBOS comme premier moteur durable à brancher, Temporal comme sortie si la charge ou l'audit l'exigent.
7. Quel que soit le moteur : une clé d'idempotence par écriture dans un outil, calculée à partir de l'identifiant d'exécution et du numéro d'étape, jamais d'un hasard.

---

## 2. Besoins traduits en exigences

| Besoin du produit | Exigence technique |
|---|---|
| Un agent écrit dans un outil client avec le jeton OAuth de l'utilisateur | Étape « écriture » exécutée une seule fois en effet : clé d'idempotence côté outil si possible, sinon journal « intention puis résultat » côté nous |
| Curseur « propose » : l'humain valide | Attente d'un événement externe pendant des heures ou des jours, sans occuper de worker |
| « Relancer dans cinq jours » | Minuterie durable de plusieurs jours, qui survit aux déploiements |
| API tierces limitées (Gmail, HubSpot, Slack...) | Limite de débit par outil et par client (par connexion OAuth) |
| Un client ne doit pas écraser un autre | Concurrence par clé (par client, par agent, par ressource) |
| Un service Railway, plusieurs instances | Plusieurs workers sans doublon d'exécution |
| Poste de contrôle | Voir l'état de chaque exécution, chaque étape, rejouer, annuler |
| Données en Europe | Auto-hébergement ou cloud en région UE |
| Deux fondateurs | Peu de pièces à opérer, une seule base si possible |

---

## 3. Grille de comparaison

Versions npm lues dans le registre le 19/11/2026 (officiel : https://registry.npmjs.org/NOM/latest). Cases marquées (?) : non confirmées par une source lue.

| Moteur | Version (19/11/2026) | Licence | Où est l'état | Attente d'événement humain (jours) | Minuterie longue | Limite de débit | Concurrence par clé | Auto-hébergement UE |
|---|---|---|---|---|---|---|---|---|
| pg-boss | 12.38.2 | MIT | Postgres | Non (à écrire) | `startAfter` / `sendAfter` (délai de job, pas de flux) | Non natif (?) | Politiques de file `singleton`, `key_strict_fifo` ; `groupConcurrency` (tiers) | Oui, c'est votre Postgres |
| Graphile Worker | 0.18.0 | MIT | Postgres | Non | `runAt` | Non natif (paquet tiers `graphile-worker-rate-limiter`) | Files nommées = exécution en série ; `job_key` | Oui |
| DBOS Transact TS | 5.6.0 (`@dbos-inc/dbos-sdk`) | MIT | Postgres | Oui : messages et événements (noms d'API à vérifier : `DBOS.send`, `DBOS.recv`) | Oui, `DBOS.sleep` durable (à vérifier) | Oui, par file (`rateLimit`) ; par partition (`partitionRateLimit`) | Oui : `concurrency`, `workerConcurrency`, `partitionConcurrency`, clé de partition | Oui, bibliothèque dans votre processus |
| Restate | SDK TS 1.18.4 ; SDK Rust `restate-sdk` 0.13.0 (28/10/2026) | Serveur BSL 1.1 (Apache 2.0 après 4 ans) ; SDK MIT | Serveur Restate (journal propre) | Oui : awakeables | Oui : `ctx.sleep` | Non natif (?) | Oui : Virtual Objects (un appel à la fois par clé) | Oui, un binaire |
| Temporal | SDK TS 1.26.0 ; SDK Rust `temporalio-sdk` 1.2.0 (09/11/2026) | MIT (serveur et SDK) | Serveur Temporal + base (Cassandra, Postgres, MySQL) | Oui : signaux, mises à jour | Oui : minuteries, durée d'exécution quasi illimitée | Non natif ; on le fait par `Task Queue` + limites de worker (?) | Par ID de workflow unique ; sémaphore à écrire | Cloud AWS `eu-central-1` (Francfort) ; ou auto-hébergé |
| Inngest | 4.26.2 | SDK Apache-2.0 ; serveur : sources divergent (SSPL ou Apache-2.0) | Serveur Inngest (Postgres en auto-hébergé, tiers) | Oui : `step.waitForEvent` | Oui : `step.sleep` jusqu'à 1 an ; durée max d'une exécution : 30 j Free, 90 j Pro, 366 j Business (officiel) | Oui : `throttle`, `rateLimit`, `debounce` | Oui : `concurrency` avec clé | Auto-hébergement oui ; région UE du cloud non trouvée |
| Hatchet | SDK TS 1.47.4 | MIT (officiel) | Postgres | Oui : `WaitForEvent` | Oui : sommeil durable | Oui, statique ou dynamique | Oui : clés de concurrence | Oui ; cloud UE non trouvé |
| Trigger.dev v4 | 4.8.7 | SDK MIT ; plateforme Apache-2.0 (tiers) | Postgres + Redis (+ ClickHouse en prod Kubernetes) | Oui : `wait.forToken` | Oui : `wait.for` / `wait.until` | Par file (`concurrencyLimit`) | Par clé de file (à vérifier) | Oui (Docker, Kubernetes) |
| Vercel Workflow | `workflow` 5.7.0 | Apache-2.0 | Vercel, ou « World » Postgres/local | Oui : `createHook` | Oui : `sleep` | non trouvé | non trouvé | Lié à Vercel ; monde Postgres non confirmé |
| Cloudflare Workflows | n/a (service) | Propriétaire | Cloudflare | Oui : `waitForEvent` | Oui : `step.sleep` max 365 j (officiel) | non trouvé | non trouvé | Non (Workers) |
| AWS Step Functions | n/a (service) | Propriétaire | AWS | Oui : `.waitForTaskToken`, jusqu'à 1 an en Standard (officiel) | Oui : état `Wait` | non natif | Non natif | Région `eu-central-1` |

### Prix connus au 19/11/2026

| Moteur | Prix | Nature |
|---|---|---|
| pg-boss, Graphile Worker | 0 (votre Postgres) | officiel |
| DBOS Transact | 0 en bibliothèque. Conductor (observabilité) : Pro 99 $/mois, Teams 499-500 $/mois ; Conductor auto-hébergé : licence payante | tiers (comparatifs, AWS Marketplace) |
| Restate | Auto-hébergé : 0. Cloud : gratuit 50 000 actions/mois (une source dit 100 000 dans la FAQ), Starter 75 $/mois | tiers, les sources divergent |
| Temporal Cloud | 50 $ par million d'actions, pas de frais de base, crédit 150 $ sur 90 jours ; Business 500 $/mois. Une série de pages dit que l'ancien plan Essentials à 100 $/mois a été remplacé en septembre 2026 | page officielle https://temporal.io/pricing + tiers pour la date |
| Inngest | Gratuit 50 000 exécutions/mois ; Pro 75 $ ou 99 $ selon la source | tiers, les sources divergent |
| Hatchet Cloud | Depuis septembre 2026 : paiement à l'usage, 1 M de tâches et 1 M d'événements gratuits par mois, puis 30 $/M de tâches et 5 $/M d'événements ; reprises non facturées | officiel https://hatchet.run/announcement/pay-as-you-go-pricing |
| Trigger.dev | Free, Hobby 10 $, Pro 50 $ ; l'attente après 5 s n'est pas facturée | officiel https://trigger.dev/pricing (via résumé) |
| Vercel Workflow | 50 000 événements/mois inclus (Hobby), puis 0,02 $ par 1 000 ; environ 2 événements par `sleep`, au moins 2 par hook | officiel https://vercel.com/docs/workflows/pricing |
| Cloudflare Workflows | Sources divergent (0,80 $/100 000 étapes, ou 0,30 $/M après 10 M gratuites, ou chaque étape facturée depuis le 10/08/2026) | tiers, non tranché |
| Step Functions | 0,000025 $ par transition en us-east-1 (Standard) ; prix Francfort non trouvé | tiers |

---

## 4. Fiche par moteur

### 4.1 pg-boss 12 (version 12.38.2 le 19/11/2026)

- Faits : version npm 12.38.2, MIT (officiel, registre). Notes de version 12.x : 12.31 ajoute Bun ; 12.33 ajoute une horloge injectable pour les tests et `pg-boss doctor --fix` ; 12.35 (schéma v43) empêche une prise de travail périmée de terminer ou de battre le coeur d'un job de remplacement ; 12.37.1 corrige un blocage des files `singleton` / `stately` ; 12.37 ajoute `getUninstallPlans()` et marque le moteur `yugabytedb` comme obsolète (tiers, via https://github.com/timgit/pg-boss/releases).
- Politiques de file : `standard`, `short`, `singleton`, `stately`, `exclusive`, `key_strict_fifo`. La politique ne peut pas être changée après création (officiel, https://pgboss.io/api/queues). `key_strict_fifo` : les jobs de même `singletonKey` passent un par un dans l'ordre (tiers).
- Reprise : au moins une fois. Un job pris par un worker mort redevient disponible après expiration (`expireInSeconds`) ; `retryLimit`, `retryDelay` (secondes, 0 par défaut), `retryBackoff` (délai x 2^n avec bruit). Copie vers `deadLetter` après les dernières reprises (officiel).
- Minuterie : `startAfter` / `sendAfter` (à vérifier pour le nom exact en v12). C'est un délai de job : bon pour « relancer dans cinq jours », mais ce n'est pas lié à un état de flux.
- Concurrence par clé : `singletonKey` avec politique `singleton` ou `key_strict_fifo`, et `groupConcurrency` (tiers : limite le nombre de jobs d'un groupe, seulement pour les jobs qui portent un groupe).
- Limites de débit par outil et par client : non trouvé comme fonction native. À écrire : table de seaux de jetons dans Postgres, ou un `startAfter` calculé à l'enfilage (déduit).
- Multi-instances : oui, les workers se disputent les jobs en base (`FOR UPDATE SKIP LOCKED`, à vérifier pour la version 12).
- Observabilité : tables SQL, statistiques de file ; pas d'interface de flux. Il existe des tableaux de bord communautaires (non évalués).
- Avertissements de production relevés (tiers, https://agledger.ai/blog/pg-boss-production-lessons/) : pg-boss est au moins une fois ; `retryDelay` est un plancher.
- Ce qu'il ne fait pas : pas de journal d'étapes, pas d'attente d'événement, pas de reprise au milieu d'un flux. Une attente de validation se modélise en base à la main (déduit).

Extrait de configuration, à vérifier contre la doc de la version 12 (de mémoire) :

```ts
import PgBoss from 'pg-boss';
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
await boss.start();
await boss.createQueue('agent.step', { policy: 'key_strict_fifo', retryLimit: 5, retryDelay: 30, retryBackoff: true });
await boss.send('agent.step', { runId, step: 3 }, { singletonKey: `tenant:${tenantId}`, startAfter: 5 * 24 * 3600 });
```

### 4.2 Graphile Worker 0.18.0

- MIT, Postgres (officiel, registre et https://worker.graphile.org/releases).
- Files nommées : les jobs d'une même file passent en série ; sans file, aussi vite que les workers (officiel, https://worker.graphile.org/docs/techniques). `job_key` pour dédoublonner ou remplacer. Cron avec `jobKey` / `jobKeyMode` depuis 0.16 ; la 0.17 ajoute une file locale (`localQueue.size`) pour réduire la charge de la base et corrige l'arrêt du cron après des erreurs de base.
- Limite de débit : non native, la doc renvoie vers un paquet tiers (officiel).
- Verdict : un doublon fonctionnel de pg-boss avec moins de fonctions de file. Aucune raison de changer pour lui.

### 4.3 DBOS Transact pour TypeScript (5.6.0)

- Bibliothèque MIT qui enregistre l'état de chaque flux et de chaque étape dans Postgres, et relance au dernier point terminé après une panne (officiel, https://www.dbos.dev/dbos-transact). Pas de serveur à ajouter.
- Files Postgres avec concurrence globale et par processus, limite de débit, priorité, délai (officiel, https://docs.dbos.dev/typescript/tutorials/queue-tutorial). Files partitionnées : `partitionConcurrency`, `partitionWorkerConcurrency`, `partitionRateLimit`, chacun au plus égal à sa limite globale ; sur une file partitionnée la clé de partition est obligatoire, sinon le flux reste `ENQUEUED` pour toujours (officiel, https://docs.dbos.dev/typescript/reference/queues). C'est exactement « concurrence par clé » et « débit par client ».
- Attente d'un événement humain et minuteries durables : le modèle existe (messages, événements, sommeil durable), mais je n'ai pas trouvé la page de doc avec les noms exacts. À vérifier : `DBOS.send(workflowID, message, topic)`, `DBOS.recv(topic, timeoutSeconds)`, `DBOS.setEvent`, `DBOS.sleep`.
- Idempotence : un `workflowID` choisi par l'appelant rend le démarrage idempotent (à vérifier). Quand une étape écrit dans le même Postgres, elle peut être transactionnelle ; pour un outil externe, il faut une clé d'idempotence (tiers, https://dev.to/pvgomes/postgres-is-all-you-need-for-durable-execution-454b).
- Limites : le débit maximal est celui de votre Postgres (tiers). Un fil Hacker News note que l'élasticité des exécuteurs est limitée par la doc (https://news.ycombinator.com/item?id=47970487) et qu'une migration incrémentale dans une base de code existante est plus dure qu'avec Temporal (tiers, https://news.ycombinator.com/item?id=44840693).
- Observabilité : tables système (https://docs.dbos.dev/explanations/system-tables) ; interface Conductor payante.
- Doc officielle de comparaison : https://docs.dbos.dev/explanations/comparing-temporal.

### 4.4 Restate

- Serveur en Rust, un binaire, licence BSL 1.1 qui interdit seulement d'offrir Restate comme service public et passe en Apache 2.0 après quatre ans ; SDK MIT (tiers, https://zairalabs.ai/guide/tools/restate-oss/ ; page officielle https://restate.dev/ confirme la BSL). SDK : `@restatedev/restate-sdk` 1.18.4 ; crate Rust `restate-sdk` 0.13.0 (28/10/2026), donc pré-1.0 (officiel, crates.io).
- Primitives TypeScript : `ctx.run` (étape qui stocke son résultat dans le journal ; elle est reprise sauf `TerminalError`), `ctx.sleep`, `ctx.awakeable()` et `ctx.resolveAwakeable` (attente d'une validation externe) (officiel, https://docs.restate.dev/develop/ts/durable-steps).
- En-tête `Idempotency-Key` sur les appels : Restate déduplique les appels de même clé (officiel, cité dans les résultats de recherche). Un test communautaire (tiers, https://nerdleveltech.com/restate-durable-agent-duplicate-tool-calls-tested) dit qu'une clé construite avec `ctx.rand.uuidv4()` a évité un double débit dans un appel d'outil.
- Virtual Objects : un seul appel à la fois par clé, avec un état attaché. C'est la concurrence par clé native. Restate 1.3 a ajouté de la concurrence sur ces objets (https://restate.dev/blog/announcing-restate-1.3).
- Limite de débit : non trouvé.
- Prix cloud : voir la section 3. Une source tierce parle d'un cas « chez soi » à environ 5 000 $ de licence et 1 000-2 000 $ d'infrastructure pour 500 actions par seconde : non vérifié.
- Point à clarifier : Restate gère son propre journal (il n'utilise pas votre Postgres), donc c'est un service de plus à sauvegarder et à opérer (déduit).
- Rust : le SDK Rust existe ; sans objet pour un cœur TypeScript, mais utile si un module Rust devait un jour porter les étapes.

### 4.5 Temporal

- Cloud : une région AWS `eu-central-1` (Francfort) avec point d'accès `eu-central-1.aws.api.temporal.io:7233` (officiel, https://docs.temporal.io/cloud/references/regions/awsregions via résumé). Le statut du 17/11/2026 signale une restriction de création de nouveaux espaces de noms dans les régions GCP `us-central1` et `europe-west3` (tiers, page de statut : à vérifier).
- Prix : voir la section 3. Tarif à l'action, sans frais de base depuis septembre 2026 selon les tiers.
- SDK TypeScript `@temporalio/client` 1.26.0 (MIT). Le code de flux s'exécute dans un bac à sable V8 : `Math.random`, `Date` sont remplacés par des versions déterministes, mais le bac à sable ne protège pas de tout ; les effets de bord vont dans les Activities (officiel, https://docs.temporal.io/develop/typescript/workflows/basics).
- SDK Rust : annoncé disponible en version stable le 4 septembre 2026 (blog officiel https://temporal.io/blog/build-durable-applications-rust-temporal-rust-sdk-now-generally-available, un autre billet date l'annonce du 23 septembre) ; le README du dépôt `sdk-rust` parlait encore d'aperçu public, et un tiers a utilisé `temporalio-sdk` 1.1.0 sur `sdk-core` 0.10.0 en le qualifiant de prérelease. Crate lue sur crates.io : `temporalio-sdk` 1.2.0, publiée le 09/11/2026. Je retiens : stable selon l'éditeur, jeune dans les faits.
- Attente de plusieurs jours : signaux ; minuteries durables ; exécution d'une durée quasi illimitée (à vérifier la limite d'historique : environ 51 200 événements ou 50 Mo, à vérifier ; `continueAsNew` pour les longues vies).
- Limites de débit par outil et par client : pas natif. Schémas courants : file de tâches dédiée par outil avec limite de worker, ou service de jetons en activité (déduit).
- Intégrations agents : OpenAI Agents SDK (printemps 2026), AI SDK de Vercel, Braintrust (tiers et blog Temporal : https://temporal.io/blog/building-durable-agents-with-temporal-and-ai-sdk-by-vercel).
- Coût d'adoption : le plus lourd (modèle déterministe, rejouage, versionnage du code des flux, `workflow.patched`).

### 4.6 Inngest (4.26.2)

- Fonctions durables dans votre app, appelées en HTTP par le serveur Inngest. `step.run`, `step.sleep`, `step.sleepUntil`, `step.waitForEvent` (résultat `null` en cas de délai dépassé) (officiel, https://www.inngest.com/docs/learn/inngest-steps).
- Limites d'usage : durée max d'une exécution 30 j Free, 90 j Pro, 366 j Business ; durée d'une étape jusqu'à 2 h (officiel, https://www.inngest.com/docs/usage-limits/inngest).
- Une fonction en sommeil ne compte pas dans la concurrence (officiel).
- Contrôle de flux : `concurrency` (avec clé), `throttle`, `debounce`, limite de débit (officiel, doc Go citée ; équivalent TypeScript à vérifier).
- Licence du serveur : conflit. Un comparatif dit SSPL 1.0 (tiers, https://www.zenml.io/blog/inngest-alternatives et autres), d'autres disent Apache-2.0 en auto-hébergé. À vérifier dans le dépôt.
- Prix : voir section 3. Région UE du cloud : non trouvé.

### 4.7 Hatchet

- Licence MIT (officiel, https://hatchet.run/). Postgres comme file et bus ; RabbitMQ n'est plus requis depuis la v1 mais la doc de configuration le liste encore (officiel, https://docs.hatchet.run/self-hosting/configuration-options).
- Tâches durables avec sommeil durable et `WaitForEvent` ; limites de débit statiques ou dynamiques (par utilisateur) ; concurrence par clé dynamique (officiel, README GitHub et https://news.ycombinator.com/item?id=43572733).
- Cloud : paiement à l'usage depuis septembre 2026 (section 3). Région UE : non trouvé.
- C'est le candidat « file de tâches durable » le plus proche de ce que pg-boss fait déjà, avec en plus les limites de débit et l'attente d'événement. Moins de déploiements connus pour des agents que Temporal (déduit).

### 4.8 Trigger.dev v4 (4.8.7)

- `wait.forToken()` : le jeton se complète depuis l'extérieur, avec un délai facultatif (officiel, https://trigger.dev/human-in-the-loop-ai-agents). Au-delà de 5 s d'attente, la tâche est mise en point de contrôle et le temps n'est pas facturé (officiel, https://trigger.dev/pricing). Le créneau de concurrence reste tenu pendant l'attente sauf `releaseConcurrencyOnWaitpoint: true`.
- Auto-hébergement : application web (Postgres, Redis), superviseur, exécuteurs ; ClickHouse et stockage objet en production Kubernetes (tiers). Plus lourd que le service Railway actuel.
- Modèle : il exécute vos tâches dans ses propres conteneurs (build et déploiement séparés). Pour deux personnes sur un service unique, c'est un changement d'architecture (déduit).

### 4.9 Vercel Workflow (`workflow` 5.7.0)

- Directives `"use workflow"` et `"use step"` ; `createHook` / `defineHook` / `resumeHook` pour attendre un événement ; `sleep` (tiers).
- Self-hosting via une interface « World » (local, Postgres) ; statut de production du monde Postgres : non trouvé.
- Prix hébergé : section 3 (officiel). Nous sommes sur Railway : choisir ce moteur revient à l'adopter pour sa promesse d'indépendance, ce qui n'est pas prouvé. Écarté pour l'instant.

### 4.10 Cloudflare Workflows

- `step.sleep` jusqu'à 365 jours ; `waitForEvent` d'une seconde à un an, défaut 24 h (officiel, https://developers.cloudflare.com/workflows/reference/limits). Instances concurrentes : 10 000 selon la page des limites, 50 000 selon le changelog : les deux sources se contredisent. Les instances en attente ne comptent pas.
- Exécution dans des Workers : hors de notre stack (Node 24, Postgres RDS, Better Auth). Écarté.

### 4.11 AWS Step Functions

- Workflows Standard : `.waitForTaskToken` met l'exécution en pause jusqu'à la limite de un an (officiel, https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html). Express ne le prend pas en charge.
- Facturation à la transition d'état ; l'attente n'est pas facturée (tiers).
- On décrit les flux en Amazon States Language, pas en TypeScript. Les flux d'agents sont dynamiques (boucle LLM) : mauvais ajustement. Écarté.

---

## 5. Ce que font les éditeurs d'agents

| Éditeur | Choix | Ce qu'ils disent | Nature |
|---|---|---|---|
| Dust | Temporal Cloud | Les flux sont des « unités de logique durables et inspectables » plutôt que des reprises écrites à la main ; l'ingestion (découpage, vectorisation) tourne en Activities ; Temporal reprend à l'étape en échec ; des workers s'ajoutent à la demande ; il fait tourner le produit « Tracker » (détecte des documents périmés et déclenche des mises à jour par agent) | tiers (blog de Temporal) https://temporal.io/blog/how-dust-builds-agentic-ai-temporal |
| Dust (interne) | Consignes d'écriture publiques dans leur dépôt | Un flux = orchestrateur déterministe ; les effets de bord dans des activités ; activités idempotentes car rejouables ; reprise limitée à 3 essais avec délai exponentiel ; un flux non enregistré dans le worker ne tourne pas | tiers https://agent-skills.md/skills/dust-tt/dust/dust-temporal |
| Dust (blog propre) | Pas d'article d'ingénierie sur Temporal trouvé | La page https://dust.tt/blog (consultée avec curl) ne contient pas de titre mentionnant Temporal | officiel, résultat négatif |

Ce que je n'ai pas pu établir : pourquoi Dust a choisi Temporal contre les autres, la forme exacte (un flux par conversation ou non), le volume. Le blog de Temporal est une source de l'éditeur du moteur.

Autres signaux (tous tiers, souvent de blogs liés à des vendeurs, donc biaisés) :
- Temporal serait le choix des flux longs et audités ; Inngest ou DBOS pour des flux courts et pilotés par événements (https://www.metacto.com/blogs/durable-execution-ai-agents, https://comuvia.ai/articles/durable-execution-for-ai-agents-temporal-vs-inngest-vs-restate-vs-prefect).
- DBOS serait un bon point de départ pour qui veut passer à Temporal plus tard ; Restate serait léger avec un état par session et des outils exécutés exactement une fois (zenml.io, cadenya.com).
- Aucun retour « nous avons quitté pg-boss pour X » trouvé. Un fil Hacker News (https://news.ycombinator.com/item?id=44840693) rapporte qu'un utilisateur de DBOS trouvait Temporal meilleur pour l'interface et l'observabilité, et DBOS plus difficile à introduire par morceaux.
- Je n'ai pas trouvé de source lue sur OpenAI, Replit ou Lovable ; je ne les cite pas.

---

## 6. Écrire le moteur d'agents pour que le moteur puisse changer

### 6.1 Principe

Un agent est une boucle : lire l'état, décider (appel LLM), exécuter une action, enregistrer, recommencer, ou attendre. On sépare :
1. Un **orchestrateur** : décide l'étape suivante. Pur, sans effet de bord, rejouable.
2. Des **étapes** : appels LLM, lectures d'outils, écritures dans les outils. Chacune porte un nom stable, un numéro d'étape, et son résultat est enregistré.
3. Une **interface de moteur** très étroite.

### 6.2 Interface minimale (déduit)

```ts
interface DurableCtx {
  runId: string;
  // exécute fn une seule fois en effet ; au rejouage, rend le résultat enregistré
  step<T>(name: string, fn: () => Promise<T>, opts?: { retries?: number }): Promise<T>;
  sleep(name: string, ms: number): Promise<void>;
  // attend une décision humaine ; rend null si le délai est dépassé
  waitForEvent<T>(name: string, key: string, timeoutMs: number): Promise<T | null>;
}
interface Engine {
  start(agent: string, input: unknown, opts: { runId: string; concurrencyKey: string }): Promise<void>;
  signal(runId: string, key: string, payload: unknown): Promise<void>;
}
```

Les trois implémentations possibles : (a) maison sur pg-boss + une table `agent_step` ; (b) DBOS (`DBOS.runStep`, `DBOS.sleep`, `DBOS.recv`, noms à vérifier) ; (c) Temporal (Activities, `sleep`, `condition` + signaux). Le code des agents n'importe jamais le moteur, seulement `DurableCtx`.

### 6.3 Règles qui rendent le changement possible

| Règle | Pourquoi |
|---|---|
| Une étape = une action nommée, entrée et sortie en JSON sérialisable | Compatible avec un journal Postgres, DBOS, Restate, Temporal |
| Pas d'horloge, de hasard ni de lecture directe dans l'orchestrateur : tout passe par une étape | Exigence de déterminisme de Temporal et Restate (`Date.now()` dans un flux Temporal est interdit) |
| Identifiant d'exécution `runId` choisi par l'appelant, déterministe (ex. `agent:<fiche>:<evenement_id>`) | Un événement entrant rejoué ne crée pas deux exécutions |
| Clé d'idempotence d'écriture = `sha256(runId + ":" + stepName + ":" + stepIndex)` | Stable au rejouage et entre moteurs |
| Écriture dans un outil en deux temps : journal `intention` (avant), appel avec la clé, journal `resultat` (après) | Si la panne tombe entre l'appel et l'enregistrement, on sait qu'il faut vérifier au lieu de refaire |
| Quand l'outil n'a pas de clé d'idempotence : lire avant d'écrire (« existe déjà ? ») ou marquer l'objet créé avec la clé dans un champ libre | Évite le doublon sur les outils sans support (très fréquent, voir ci-dessous) |
| Les actions qui demandent validation : l'attente est un `waitForEvent` avec `key = approvalId`, la décision est enregistrée avant reprise | Le poste de contrôle envoie `Engine.signal` |
| Pas de file d'attente dans l'orchestrateur : limites de débit et concurrence dans une couche à part, par `(outil, connexion)` | Le débit par client suit l'outil, pas le moteur |
| Les étapes ne dépendent pas de la durée de vie du processus (pas de cache mémoire utile à la reprise) | Reprise sur une autre instance |

Notes sur les outils : les API d'écriture (Gmail, Slack, CRM...) acceptent rarement une clé d'idempotence. Je n'ai pas vérifié outil par outil ; le dossier 06 (écriture mail, CRM, support) en traite. Pour ce document, la règle est : la clé est calculée toujours, transmise quand l'outil la prend, et sinon placée dans un champ de l'objet ou dans notre journal.

### 6.4 Version pg-boss maison (le premier moteur)

Tables (déduit, à adapter) :

```sql
create table agent_run (
  run_id text primary key, agent text not null, tenant_id uuid not null,
  state text not null,           -- running | waiting | done | failed
  wake_at timestamptz,           -- minuterie
  waiting_key text               -- attente d'événement
);
create table agent_step (
  run_id text references agent_run, idx int, name text,
  status text,                   -- intent | done | failed
  idempotency_key text not null, input jsonb, output jsonb,
  primary key (run_id, idx)
);
create table tool_budget ( tenant_id uuid, tool text, tokens numeric, refilled_at timestamptz,
  primary key (tenant_id, tool) );  -- seau de jetons par outil et par client
```

Mécanique : un job pg-boss `agent.run` reprend un `run_id` ; il rejoue l'orchestrateur ; chaque `step()` lit `agent_step` et rend la sortie si elle existe. Une attente devient `state='waiting'` + fin du job ; le signal ou le délai enfile un nouveau job. `singletonKey = tenant:agent` pour la concurrence par clé. Coût d'écriture : environ 300 à 500 lignes de TypeScript (déduit, pas mesuré).

### 6.5 Quand migrer

| Signal | Action |
|---|---|
| Vous codez à la main le troisième de : attente d'événement, minuterie liée au flux, limite de débit, reprise partielle, vue d'exécution | Passer à DBOS (même Postgres, même langage) |
| Plusieurs centaines de milliers d'exécutions par jour, ou Postgres devient le goulot (tiers : le plafond de DBOS est votre Postgres) | Temporal Cloud Francfort, ou Restate |
| Exigence d'audit client, d'historique d'exécution consultable, de flux qui durent des mois | Temporal |
| Un client exige que les données restent dans votre infrastructure | Garder pg-boss/DBOS, qui sont déjà dans votre RDS |
| Besoin de limiter le débit par outil et par client de façon sophistiquée | Hatchet ou Inngest les fournissent ; sinon seaux de jetons maison |

---

## Ce que je recommande

1. **Garder pg-boss 12 pour le « standard »** (tri des entrées, dépêche vers l'agent, tâches courtes). Il est déjà là, MIT, dans votre Postgres, au moins une fois. Raison : zéro pièce nouvelle.
2. **Ne pas adopter Temporal maintenant.** Raison : c'est le choix de Dust et le plus mûr, mais deux personnes y gagnent peu avant d'avoir la charge ; coût d'apprentissage du déterminisme, un cluster ou 50 $ le million d'actions. À garder comme destination si les volumes ou l'audit l'imposent.
3. **Écrire le moteur d'agents derrière `DurableCtx` (section 6)**, avec journal `agent_step` en Postgres et clés d'idempotence calculées. Raison : c'est ce qui rend le moteur remplaçable ; c'est la vraie décision, bien avant le choix du produit.
4. **Premier moteur durable à essayer : DBOS Transact** (MIT, Postgres, files partitionnées avec concurrence et débit par clé, ce qui correspond au besoin « par outil et par client »). Faire un essai de deux jours sur un seul agent avant de décider : vérifier les noms d'API marqués « à vérifier », la tenue avec plusieurs instances Railway, et le comportement du rejouage.
5. **Restate en second choix** si DBOS ne tient pas : un seul binaire, attente par awakeable, clé d'idempotence native, mais licence BSL et un journal de plus à sauvegarder.
6. **Écarter** Graphile Worker (rien de plus que pg-boss), Vercel Workflow, Cloudflare Workflows, Step Functions (liés à un hébergeur ou mal adaptés à une boucle LLM), Trigger.dev (modèle de déploiement séparé). Inngest et Hatchet : à garder à l'oeil, surtout Hatchet (MIT, Postgres) si les limites de débit deviennent le point dur.
7. **Débit par outil et par client : le faire nous-mêmes** dans une couche à part (table `tool_budget`), quel que soit le moteur. Raison : seuls DBOS, Inngest et Hatchet l'ont en natif, et les limites réelles dépendent des API des outils.
8. **Ne jamais faire confiance à « exactement une fois »** pour les écritures externes : le moteur rend les étapes rejouables, l'unicité de l'effet vient de la clé d'idempotence.

## Ce que je n'ai pas trouvé

- Aucune page de documentation n'a été ouverte en entier ; tout vient de résumés de recherche. Les noms d'API DBOS (`send`, `recv`, `sleep`, `workflowID`), pg-boss (`sendAfter`, options exactes en v12) et les clés de concurrence Trigger.dev sont à vérifier.
- Limite de débit native dans pg-boss, Restate, Temporal : non trouvée.
- Licence exacte du serveur Inngest (SSPL ou Apache-2.0 : sources contradictoires).
- Région UE pour Hatchet Cloud, Inngest Cloud, Restate Cloud, Trigger.dev Cloud : non trouvée.
- Prix de Step Functions à Francfort et prix de Cloudflare Workflows : non tranchés.
- Statut GA du monde Postgres de Vercel Workflow : non trouvé.
- Pourquoi Dust a choisi Temporal, et son volume : non trouvé. Aucun article d'ingénierie de Dust sur le sujet n'est listé sur dust.tt/blog.
- Retours d'expérience « migration de pg-boss vers un moteur durable » : non trouvés.
- Limites d'historique de Temporal (taille et nombre d'événements) : de mémoire, à vérifier.
- Débits maximaux mesurés de pg-boss et DBOS sur RDS : non trouvés.
