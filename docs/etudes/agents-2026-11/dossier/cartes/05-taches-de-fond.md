# Carte 05 : tâches de fond et leurs patrons

Chemins relatifs à `/home/user/leon`. Cette carte décrit le code tel qu'il est le 19/11/2026. Tout vient d'une lecture réelle des fichiers ; ce qui n'a pas été lu est dit en section 7. Les numéros de ligne sont ceux des fichiers lus ce jour.

## 1. Ce que fait ce module

- Toutes les tâches de fond tournent dans le processus de l'application, sur des files **pg-boss** (schéma Postgres `pgboss`). Elles démarrent depuis `src/instrumentation-node.ts`.
- Un seul singleton `PgBoss` par processus (`getBoss()` dans `src/server/pipeline/queue.ts`). Chaque famille de files a son module `…-queue.ts` (déclaration, envoi) et son worker (lecture).
- Familles de files : indexation (`pipeline-*`), connecteurs (`connector-*`), point du matin (`point-*`, `apropos-proposer`, `agenda-refresh`), sessions de code (`resume-session`, `ranger-session`, `fil-maj`, `relier-source`).
- Les tâches planifiées sont des tics `boss.schedule(file, cron, …)` : une file dédiée, un worker qui fait le travail du tic.
- Le signal après indexation (`signalSourceActivity`) marque périmés les points du matin d'un projet et en remet certains en file avec un délai de 30 minutes.
- Le point du matin est le patron complet : matière rassemblée sous les droits du lecteur, un appel au modèle, cache en base, plafond réservé en base (`reserver_point`), revérification à la lecture, retrait de lignes (`dismissed`).
- L'agenda de l'Accueil (`src/server/agenda/agenda.ts`) répète ce patron avec son propre plafond (`reserver_agenda`).
- Toute tâche de fond travaille **sous les droits d'une personne** : `resolveTenantContext` puis `withTenant`. Si la personne a quitté l'organisation, le job se termine sans rien faire.
- Sans modèle (`getLlm(env)` rend `null`), les workers démarrent quand même et finissent chaque job à vide.
- Il n'existe aucun moteur d'agents, aucun déclencheur par type d'événement, aucune veille, aucun budget par organisation (voir sections 5 et 6).

## 2. Types et fonctions à connaître

### 2.1 Le singleton pg-boss et la déclaration d'une file

`src/server/pipeline/queue.ts:8-13`

```ts
export const PIPELINE_QUEUES = {
  index: 'pipeline-index',
  reindex: 'pipeline-reindex',
  requeue: 'pipeline-requeue',
} as const;
export type PipelineStep = keyof typeof PIPELINE_QUEUES;
```

`src/server/pipeline/queue.ts:19-26`

```ts
export const PipelineJobSchema = z.object({
  ingestRunId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true };
```

`src/server/pipeline/queue.ts:30-32` : la file `reindex` est « stately » (un job actif, un en attente).

```ts
const QUEUE_OPTIONS: Record<string, Omit<Queue, 'name'>> = {
  [PIPELINE_QUEUES.reindex]: { ...RETRY, policy: 'stately' },
};
```

`src/server/pipeline/queue.ts:39-48` : `ensureQueue`, à appeler pour toute nouvelle file.

```ts
export async function ensureQueue(
  boss: PgBoss,
  name: string,
  options: Omit<Queue, 'name'>,
): Promise<void> {
  const existing = await boss.getQueue(name);
  if (existing && existing.policy !== (options.policy ?? 'standard')) await boss.deleteQueue(name);
  else if (existing && !existing.notify) await boss.updateQueue(name, { notify: true });
  await boss.createQueue(name, { ...options, notify: true });
}
```

Attention : changer la politique d'une file existante la **supprime** puis la recrée (jobs en attente et plannings perdus, commentaire lignes 34-36).

`src/server/pipeline/queue.ts:54-67` : `wakeQueueAfter`, à envelopper autour de chaque handler.

```ts
export function wakeQueueAfter(
  boss: PgBoss,
  name: string,
  handler: WorkHandler<unknown>,
): WorkHandler<unknown> {
  return async (jobs) => {
    try {
      return await handler(jobs);
    } finally {
      for (const worker of boss.getWipData())
        if (worker.name === name) boss.notifyWorker(worker.id);
    }
  };
}
```

`src/server/pipeline/queue.ts:84-115` : création du singleton.

```ts
const globalForBoss = globalThis as typeof globalThis & { leonBoss?: Promise<PgBoss> };

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    createSchema: false,
    max: 2, // 10 par défaut : le budget de connexions est expliqué dans db/client.ts
    useListenNotify: true,
    flowIntervalSeconds: 300,
  });
  boss.on('error', (error) => logError('pgboss.error', error));
  boss.on('warning', logBossWarning);
  await boss.start();
  for (const name of LEGACY_QUEUES) await boss.deleteQueue(name);
  for (const name of Object.values(PIPELINE_QUEUES)) {
    await ensureQueue(boss, name, QUEUE_OPTIONS[name] ?? RETRY);
  }
  return boss;
}

export function getBoss(): Promise<PgBoss> {
  globalForBoss.leonBoss ??= startBoss().catch((error) => {
    globalForBoss.leonBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBoss.leonBoss;
}
```

`createSchema: false` : le schéma `pgboss` n'est pas créé par pg-boss au démarrage. Où il est créé (migration ? script ?) : non lu (section 7).

`src/server/pipeline/queue.ts:117-125` : envoi dans la file d'indexation.

```ts
export async function enqueuePipelineStep(
  step: PipelineStep,
  job: PipelineJob,
  options: { priority?: number } = {},
): Promise<void> {
  const boss = await getBoss();
  await boss.send(PIPELINE_QUEUES[step], job, { priority: INDEX_PRIORITY.ingestion, ...options });
}
```

`src/server/pipeline/queue.ts:81` : `export const INDEX_PRIORITY = { ingestion: 10, reprise: 0 } as const;`

### 2.2 Les files du point du matin

`src/server/briefing/queue.ts:18-23`

```ts
export const BRIEFING_QUEUES = {
  refresh: 'point-refresh',
  morning: 'point-matin',
  about: 'apropos-proposer',
  agenda: 'agenda-refresh',
} as const;
```

`src/server/briefing/queue.ts:27, 32, 38-46`

```ts
export const BRIEFING_DELAY_SECONDS = 30 * 60;
export const ABOUT_RETRY_SECONDS = 3 * 24 * 60 * 60;

const REFRESH_QUEUE = {
  policy: 'stately',
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
} as const;
const MORNING_QUEUE = { retryLimit: 2, retryDelay: 300 } as const;

export const BriefingJobSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  project: z.string().max(200).regex(PROJECT_KEY_PATTERN),
});
export type BriefingJob = z.infer<typeof BriefingJobSchema>;

export const AboutJobSchema = z.object({ tenantId: z.uuid(), userId: z.uuid() });

export const briefingKey = (job: BriefingJob): string =>
  `${job.tenantId}:${job.userId}:${job.project}`;
```

`src/server/briefing/queue.ts:64-79` : le patron « boss d'un module » (à copier pour une nouvelle famille de files).

```ts
const globalForBriefing = globalThis as typeof globalThis & { leonBriefingBoss?: Promise<PgBoss> };

export function getBriefingBoss(): Promise<PgBoss> {
  globalForBriefing.leonBriefingBoss ??= (async () => {
    const boss = await getBoss();
    await ensureQueue(boss, BRIEFING_QUEUES.refresh, REFRESH_QUEUE);
    await ensureQueue(boss, BRIEFING_QUEUES.morning, MORNING_QUEUE);
    await ensureQueue(boss, BRIEFING_QUEUES.about, REFRESH_QUEUE);
    await ensureQueue(boss, BRIEFING_QUEUES.agenda, REFRESH_QUEUE);
    return boss;
  })().catch((error) => {
    globalForBriefing.leonBriefingBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBriefing.leonBriefingBoss;
}
```

### 2.3 Les envois (retardé, dédoublonné, avancé)

`src/server/briefing/queue.ts:83-94` : envoi avec délai en secondes ; rend `false` si un job de même clé attend.

```ts
export async function enqueueBriefingRefresh(
  job: BriefingJob,
  options: { delaySeconds?: number } = {},
): Promise<boolean> {
  const data = BriefingJobSchema.parse(job);
  const boss = await getBriefingBoss();
  const id = await boss.send(BRIEFING_QUEUES.refresh, data, {
    singletonKey: briefingKey(data),
    ...(options.delaySeconds ? { startAfter: options.delaySeconds } : {}),
  });
  return id !== null;
}
```

`src/server/briefing/queue.ts:101-108` : avancer un job retardé à « maintenant » (un `send` serait ignoré par la file « stately »).

```ts
export async function requestBriefingRefreshNow(job: BriefingJob): Promise<void> {
  const data = BriefingJobSchema.parse(job);
  const boss = await getBriefingBoss();
  await boss.upsert(BRIEFING_QUEUES.refresh, data, {
    singletonKey: briefingKey(data),
    startAfter: 0,
  });
}
```

`src/server/sessions/resume-queue.ts:44-62` : même patron, avec une date (`startAfter: Date`) et une fenêtre.

```ts
export async function enqueueResume(
  job: ResumeJob,
  options: { fin: boolean; delaySeconds?: number },
): Promise<void> {
  const data = ResumeJobSchema.parse(job);
  const boss = await getResumeBoss();
  const singletonKey = resumeKey(data);
  if (options.fin) {
    await boss.upsert(RESUME_QUEUE, data, {
      singletonKey,
      startAfter: new Date(Date.now() + RESUME_END_SECONDS * 1000),
    });
    return;
  }
  await boss.send(RESUME_QUEUE, data, {
    singletonKey,
    startAfter: options.delaySeconds ?? RESUME_IDLE_SECONDS,
  });
}
```

`src/server/briefing/worker.ts:78-82` : fenêtre anti-rejeu avec `singletonSeconds` (un envoi par clé et par fenêtre, même si le job est fini ou échoué).

```ts
const id = await boss.send(
  BRIEFING_QUEUES.about,
  { tenantId, userId },
  { singletonKey: `${tenantId}:${userId}`, singletonSeconds: ABOUT_RETRY_SECONDS },
);
```

### 2.4 Autres files (noms et options)

| File | Fichier et ligne | Options de la file | Clé unique du job | Worker (parallélisme) |
|---|---|---|---|---|
| `pipeline-index` | `pipeline/queue.ts:8`, `:26` | `RETRY` : 3 reprises, délai 30 s, backoff | aucune (pas de `singletonKey`) | `search/worker.ts:75-83`, `localConcurrency: 4`, sondage 0,5 s |
| `pipeline-reindex` | `pipeline/queue.ts:31` | `RETRY` + `policy: 'stately'` | aucune (planifiée) | `search/worker.ts:104-132`, tic, `localConcurrency: 1` |
| `pipeline-requeue` | `pipeline/queue.ts:11` | `RETRY` | aucune (planifiée) | `search/worker.ts:87-100`, tic, `localConcurrency: 1` |
| `connector-tick` | `connectors/queue.ts:5`, `connectors/worker.ts:7` | `{ retryLimit: 2 }` | aucune (planifiée) | `connectors/worker.ts:30-36`, `localConcurrency: 1` |
| `connector-sync` | `connectors/worker.ts:10` | `{ retryLimit: 2, policy: 'short', expireInSeconds: 1800 }` | `singletonKey: job.connectionId` (`connectors/sync.ts:271`) | `connectors/worker.ts:37-46`, `localConcurrency: 4` |
| `point-refresh` | `briefing/queue.ts:38` | `REFRESH_QUEUE` | `briefingKey` = `tenant:user:project` | `briefing/worker.ts:153-159`, `localConcurrency: 2` |
| `point-matin` | `briefing/queue.ts:44` | `{ retryLimit: 2, retryDelay: 300 }` | aucune (planifiée) | `briefing/worker.ts:165-185`, `localConcurrency: 1` |
| `apropos-proposer` | `briefing/queue.ts:20` | `REFRESH_QUEUE` | `tenant:user`, fenêtre `singletonSeconds` 3 jours | `briefing/worker.ts:186-190`, `localConcurrency: 1` |
| `agenda-refresh` | `briefing/queue.ts:21` | `REFRESH_QUEUE` | `tenant:user` | `briefing/worker.ts:191-197`, `localConcurrency: 1` |
| `resume-session` | `sessions/resume-queue.ts:11` | `{ policy: 'stately', retryLimit: 3, retryDelay: 60, retryBackoff: true }` | `tenant:source` | `sessions/resume-worker.ts:359-371`, `RESUME_CONCURRENCY = 2` |
| `ranger-session` | `sessions/threads-queue.ts:18` | même `QUEUE` stately | `tenant:source` | `sessions/threads.ts:479-486`, `RANGEMENT_CONCURRENCY = 2` |
| `fil-maj` | `sessions/threads-queue.ts:19` | même `QUEUE` stately | `tenant:source` (source = le fil) | `sessions/thread-state-worker.ts:493-501`, `FIL_STATE_CONCURRENCY = 2` |
| `relier-source` | `sessions/threads-queue.ts:20` | même `QUEUE` stately | `tenant:source` | `sessions/thread-links.ts:477-484`, `LIAISON_CONCURRENCY = 2` |

Toutes les lectures utilisent `batchSize: 1` et enveloppent leur handler dans `wakeQueueAfter`.

### 2.5 Les workers : forme commune

`src/server/briefing/worker.ts:146-159` (extrait) : lecture d'une file.

```ts
async function registerWorkers(
  deps: { llm: Llm | null },
  pollingIntervalSeconds: number | undefined,
): Promise<void> {
  const boss = await getBriefingBoss();
  // pg-boss teste la présence de la clé : `pollingIntervalSeconds: undefined` y est refusé.
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  await boss.work(
    BRIEFING_QUEUES.refresh,
    { batchSize: 1, localConcurrency: REFRESH_CONCURRENCY, ...polling },
    wakeQueueAfter(boss, BRIEFING_QUEUES.refresh, async ([job]) =>
      processRefreshJob(job?.data, deps),
    ),
  );
```

`src/server/briefing/worker.ts:200-215` : démarrage idempotent (rechargement à chaud de Next).

```ts
const globalForWorker = globalThis as typeof globalThis & { leonBriefingWorker?: Promise<void> };

export function startBriefingWorker(
  deps: { llm: Llm | null },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonBriefingWorker ??= registerWorkers(
    deps,
    options.pollingIntervalSeconds,
  ).catch((error) => {
    globalForWorker.leonBriefingWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonBriefingWorker;
}
```

`src/server/briefing/worker.ts:91-96` : ne jamais rendre à pg-boss l'erreur d'origine.

```ts
function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}
```

### 2.6 Les tâches planifiées

`src/server/briefing/worker.ts:31-33, 160-164` : un cron avec fuseau, un tic manqué rattrapé **une seule fois**.

```ts
export const MORNING_CRON = '0 6 * * *';
// Le fuseau des dates écrites dans le point (briefing-prompt.ts).
export const MORNING_TIME_ZONE = BRIEFING_TIME_ZONE;
```

```ts
await boss.schedule(BRIEFING_QUEUES.morning, MORNING_CRON, null, {
  tz: MORNING_TIME_ZONE,
  missed: 'once',
});
```

`BRIEFING_TIME_ZONE = 'Europe/Paris'` (`src/server/briefing/briefing-prompt.ts:49`). Les autres tics n'ont ni fuseau ni `missed` :

`src/server/search/worker.ts:36, 87, 104` et `src/server/connectors/worker.ts:24`

```ts
const EVERY_MINUTE = '* * * * *';
await boss.schedule(PIPELINE_QUEUES.requeue, EVERY_MINUTE);
await boss.schedule(PIPELINE_QUEUES.reindex, EVERY_MINUTE);
await boss.schedule(CONNECTOR_QUEUES.tick, '* * * * *');
```

Retirer un planning : `await boss.unschedule(PIPELINE_QUEUES.reindex);` (`src/server/search/worker.ts:136`), quand le fournisseur de vecteurs a disparu : le tic d'un lancement précédent resterait dans la base.

Un planning est identifié par le **nom de la file** dans tout le code lu (aucun appel `schedule` n'a de clé en plus). Pour plusieurs plannings sur une même file, la bibliothèque n'a pas été lue : voir section 7.

### 2.7 Le signal après indexation

`src/server/briefing/queue.ts:216-226`

```ts
export async function signalSourceActivity(ctx: TenantContext, sourceId: string): Promise<void> {
  const [source] = await withTenant(ctx, (tx) =>
    tx
      .select({ kind: sources.kind, ownerUserId: sources.ownerUserId, metadata: sources.metadata })
      .from(sources)
      .where(eq(sources.id, sourceId)),
  );
  if (!source) return;
  const target = projectOfSource(source);
  if (target) await signalProjectActivity(ctx, target.project, target.extraUserIds);
}
```

`src/server/briefing/queue.ts:148-152` : le voisin qui fait le travail.

```ts
export async function signalProjectActivity(
  ctx: TenantContext,
  project: string,
  extraUserIds: string[],
): Promise<void> {
```

`src/server/briefing/queue.ts:184-188` : le tri « quel projet ? ». Seuls deux types de source ont un projet.

```ts
export function projectOfSource(source: {
  kind: string;
  ownerUserId: string;
  metadata: unknown;
}): { project: string; extraUserIds: string[] } | null {
```

`src/server/briefing/queue.ts:126, 132-139` : la règle « payer seulement si lu ».

```ts
export const BRIEFING_READ_DAYS = 7;

export function refreshOnSignal(point: { preparedAt: Date; lastReadAt: Date | null }): boolean {
  const readSince = Date.now() - BRIEFING_READ_DAYS * 24 * 60 * 60 * 1000;
  return (
    point.lastReadAt !== null &&
    point.lastReadAt >= point.preparedAt &&
    point.lastReadAt.getTime() > readSince
  );
}
```

Autres signaux dans le code lu :

- `markBriefingsStale(ctx, write?)` (`src/server/briefing/about.ts:24-30`) : signal « le contexte de la personne a changé » (texte « À propos » sauvegardé). Marque périmés tous les points de la personne et en remet en file selon `refreshOnSignal`.
- `enqueueLiaison` et `enqueueFilMaj` (`src/server/sessions/threads-queue.ts:67-82`) : signaux vers les fils de travail.

### 2.8 Droits : `TenantContext`, `resolveTenantContext`, `withTenant`

`src/server/auth/tenant-context.ts:7-14`

```ts
export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
  // Lire aussi le privé des gens sous la personne (0057) : seulement pour la recherche, l'aperçu et « Mon équipe »,
  // qui n'écrivent rien.
  readonly equipe?: boolean;
};
```

`src/server/auth/tenant-context.ts:38, 71-87`

```ts
type ResolveOptions = { includeFormer?: boolean };

// Vérifie l'appartenance dans `member` ; tenantId null = première organisation de l'utilisateur.
export async function resolveTenantContext(
  userId: string,
  tenantId: string | null,
  { includeFormer = false }: ResolveOptions = {},
): Promise<TenantContext | null> {
  if (!UuidSchema.safeParse(userId).success) return null;
  if (tenantId !== null && !UuidSchema.safeParse(tenantId).success) return null;

  const resolved =
    tenantId === null
      ? await firstOrganizationId(userId, { includeFormer })
      : (await isMember(userId, tenantId, includeFormer))
        ? tenantId
        : null;
  if (resolved === null) return null;
  return { tenantId: resolved, userId, principals: await principalsFor(userId, resolved) };
}
```

Les `principals` sont : la personne, l'organisation (« l'équipe »), puis ses groupes (`principalsFor`, `tenant-context.ts:21-33`). `includeFormer: true` laisse entrer un ancien membre (compte supprimé) : seulement pour l'indexation, qui travaille sur ce qu'il a laissé à l'organisation (`src/server/search/worker.ts:58`, `src/server/search/index-run.ts:134`).

`src/server/db/with-tenant.ts:6, 18-29`

```ts
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const valid = TenantContextSchema.parse(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant', ${valid.tenantId}, true),
                                set_config('app.user', ${valid.userId}, true),
                                set_config('app.principals', ${`{${valid.principals.join(',')}}`}, true)`);
    // En plus, en lecture : le privé des gens sous la personne (0057). Une seconde requête : equipe_visible lit
    // app.tenant et app.user, posés juste avant.
    if (valid.equipe)
      await tx.execute(sql`select set_config('app.vus', equipe_visible()::text, true)`);
    return fn(tx);
  });
}
```

Usage typique dans un worker (`src/server/briefing/worker.ts:103-110`) :

```ts
const ctx = await resolveTenantContext(job.userId, job.tenantId);
// Parti de l'organisation : personne ne peut plus lire ce point sous ses droits.
if (!ctx) return;
```

Le job ne porte **que des identifiants** (`tenantId`, `userId`, une clé de projet ou un `sourceId`). Le contexte est rebâti à chaque exécution, jamais mis dans le job.

### 2.9 Plafond de dépense en base

`src/server/db/migrations/0060-plafond-points.sql:7-12, 17-31` (recopié)

```sql
create table points_par_jour (
  user_id uuid not null references "user"(id) on delete cascade,
  jour date not null,
  nombre integer not null,
  primary key (user_id, jour)
);

create function reserver_point(p_user uuid, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from points_par_jour where user_id = p_user and jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into points_par_jour as p (user_id, jour, nombre)
    values (p_user, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, jour) do update set nombre = p.nombre + 1 where p.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_point(uuid, integer) from public;
grant execute on function reserver_point(uuid, integer) to leon_app;
```

Points à noter : la table n'a **pas de RLS** (compteur sans texte) ; l'app ne la touche que par la fonction (`security definer`). Le jour est en UTC. Les jours passés de la personne s'effacent au passage. La réservation est **faite avant** l'appel au modèle et n'est jamais rendue si l'appel échoue (voir section 6).

Le même patron pour l'agenda : `src/server/db/migrations/0072-agenda.sql:32-52` (`agendas_par_jour`, `reserver_agenda(p_user uuid, p_plafond integer)`), copie conforme.

Appel côté TypeScript, `src/server/briefing/briefings.ts:56, 109-115`

```ts
export const BRIEFING_DAILY_CAP = 4;
```

```ts
const { rows } = await db.execute<{ ok: boolean }>(
  sql`select reserver_point(${ctx.userId}, ${BRIEFING_DAILY_CAP}) as ok`,
);
if (rows[0]?.ok !== true) {
  console.warn('[leon]', 'briefing.daily_cap', JSON.stringify({ userId: ctx.userId }));
  return 'plafond';
}
```

`src/server/agenda/agenda.ts:24, 244-251` : `AGENDA_DAILY_CAP = 4`, même appel avec `reserver_agenda`, sortie silencieuse (`return;`) au plafond.

### 2.10 Journal des appels au modèle

`src/server/db/migrations/0039-tableau-admin.sql:22-34` (recopié)

```sql
create table appels_modele (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  step text not null check (step in ('reponse', 'discussion', 'point')),
  model text not null check (char_length(model) <= 100),
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null,
  cache_write_tokens integer not null,
  cost_usd numeric(12, 5)
);
create index appels_modele_created_at_idx on appels_modele (created_at);
grant insert on appels_modele to leon_app;
```

La contrainte `step` a été élargie plus tard (0050, 0062, 0072). Dernière version lue, `src/server/db/migrations/0072-agenda.sql:57-60` :

```sql
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda'));
```

Constat important : **la table n'a ni `tenant_id` ni `user_id`**. Le coût d'un appel ne peut pas être attribué à une organisation. L'écriture est dans `src/server/llm/anthropic-llm.ts:59-91` (`logUsage(step, model, usage, chargedUsd?)`), sans attente et sans lever. Dans les migrations lues (0039, 0050, 0062, 0072), seul `grant insert on appels_modele to leon_app` apparaît : l'app n'y lit pas ; les chiffres du tableau admin passent par la fonction `statistiques_admin()` (`security definer`, 0039:52).

Les étapes du modèle : `src/server/llm/llm.ts:4` : `export type LlmStep = 'reponse' | 'discussion' | 'point' | 'resume' | 'fil' | 'agenda';`. Le modèle et l'effort de chaque étape se règlent par `SETTING_BY_STEP` et `EFFORT_BY_STEP` (`src/server/llm/models.ts:115-135`) et par variables `LEON_MODEL_*`.

`src/server/llm/llm.ts:50-69` : l'interface de l'appel.

```ts
export interface Llm {
  streamText(request: {
    step: LlmStep;
    system: string;
    messages: ChatMessage[];
    maxTokens: number;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
  runAgent(request: {
    step: LlmStep;
    system: string;
    messages: ChatMessage[];
    tools: AgentTool[];
    maxSteps: number;
    maxTokens: number;
    signal?: AbortSignal;
  }): AsyncIterable<AgentEvent>;
}
```

`src/server/llm/get-llm.ts:13` : `export function getLlm(env: Env): Llm | null` (`null` sans `ANTHROPIC_API_KEY`).

### 2.11 Le cache : la table `briefings`

`src/server/db/schema/search.ts:105-123` (Drizzle)

```ts
export const briefings = pgTable('briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  project: text('project').notNull(),
  markdown: text('markdown').notNull(),
  sourceIds: uuid('source_ids').array().notNull().default(sql`'{}'::uuid[]`),
  preparedAt: timestamp('prepared_at', { withTimezone: true }).notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  stale: boolean('stale').notNull().default(false),
  dismissed: text('dismissed').array().notNull().default(sql`'{}'::text[]`),
  acl: acl(),
});
```

`src/server/db/migrations/0030-points-du-matin.sql:22-24` (accès privé et unicité)

```sql
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, user_id, project)
```

`src/server/db/migrations/0030-points-du-matin.sql:32-40` (RLS et droits)

```sql
alter table briefings enable row level security;
create policy tenant_acl on briefings to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
```

```sql
grant select, insert on briefings to leon_app;
grant update (markdown, source_ids, prepared_at, last_read_at, stale) on briefings to leon_app;
```
 `dismissed` s'ajoute par `0074-points-lignes-retirees.sql` (`check (cardinality(dismissed) <= 20 …)`, `grant update (dismissed)`). Le projet est une clé `github.com/<org>/<dépôt>` ou `dossier:<16 hex>` (check SQL, `0030:12-14`).

Fonctions SQL `security definer` qui lisent **hors RLS** et ne rendent que des identifiants (`0030:48-70`) :

```sql
create function briefings_du_projet(p_project text)
returns table (user_id uuid)
create function briefings_a_rafraichir(p_days integer)
returns table (tenant_id uuid, user_id uuid, project text)
```

`briefings_du_projet` lit `app_tenant()` (posé par `withTenant`). `briefings_a_rafraichir` rend les points lus depuis moins de `p_days` jours, toutes organisations : c'est la seule lecture globale du point (`db.execute`, sans `withTenant`).

### 2.12 Le point du matin : API de lecture et de recalcul

`src/server/briefing/briefings.ts:94-98`

```ts
export async function refreshBriefing(
  ctx: TenantContext,
  project: string,
  deps: { llm: Llm; now?: Date },
): Promise<'fait' | 'rien' | 'plafond' | 'parti'> {
```

`src/server/briefing/briefings.ts:286-290`

```ts
export async function readBriefing(
  ctx: TenantContext,
  project: string,
  options: { refresh?: boolean } = {},
): Promise<{ markdown: string; preparedAt: Date; sourceIds: string[] } | null> {
```

`src/server/briefing/briefings.ts:350-354`

```ts
export async function briefingResponse(
  ctx: TenantContext,
  project: string | null,
  deps: { modelReady: boolean; client: string; session?: string },
): Promise<BriefingResponse> {
```

Autres exports : `briefingIsFresh(ctx, project)`, `briefingExists(ctx, project)`, `accountIsGone(userId)`, `refreshShownBriefing(ctx, project, preparedAt)`, `dismissBriefingLines(ctx, project, texts)`, `restoreBriefingLines(ctx, project, texts)`, `latestBriefingProject(ctx)`.

La matière : `src/server/briefing/gather.ts:76-83, 95-101`

```ts
export type BriefingMaterial = {
  project: string;
  // Le début de la dernière session sur ce projet, au plus 14 jours avant : ce qui a bougé se compte depuis.
  since: Date;
  sessions: BriefingSession[];
  changes: BriefingChange[];
  mentions: BriefingMention[];
};

export function isEmptyMaterial(material: BriefingMaterial): boolean {
```

Appelée par `gatherBriefingMaterial(ctx, project, now)` (importée en `briefings.ts:19-24` ; sa définition est au-delà de la ligne 230 de `gather.ts`, non lue : voir section 7). Bornes : `BRIEFING_DAYS = 14`, `BRIEFING_SESSIONS = 3`, `SESSION_TURNS_MAX = 24`, `TURN_CHARS = 400`, `CHANGES_MAX = 10`, `MENTIONS_MAX = 10` (`gather.ts:40-55`).

## 3. Comment ça s'exécute

### 3.1 Démarrage

`src/instrumentation.ts` appelle `startNodeInstrumentation()` si `NEXT_RUNTIME === 'nodejs'`. `src/instrumentation-node.ts:3-55` fait, dans cet ordre :

1. `await import('@/server/env')` (valide l'environnement).
2. `if (process.env.NEXT_PHASE === 'phase-production-build') return;` : aucun worker pendant `next build`.
3. `getEmbedder(env)` ; `startSearchWorker({ embedder })` (avant la relève, car celle-ci met des jobs en file dès son premier passage).
4. `getLlm(env)` ; `startBriefingWorker({ llm })`.
5. `startResumeWorker({ llm })`.
6. `startThreadsWorker({ embedder })`.
7. `startThreadLinksWorker({ embedder })`.
8. `startFilStateWorker({ llm })`.
9. `startConnectorWorker()` seulement si `env.LEON_CONNECTORS_KEY` ; sinon `console.warn('[leon] LEON_CONNECTORS_KEY absente : les connecteurs ne tournent pas.')`.
10. `warnIncompleteOAuthPairs()`.

Tout worker nouveau s'ajoute ici, avec un `await import(...)` dynamique et la même forme (`startXWorker(deps)`), avant ou après la relève selon qu'il doit voir ses files prêtes.

### 3.2 De la capture au signal (chaîne d'indexation)

1. Une capture ou une relève de connecteur écrit des tours puis crée un `ingest_run` : `ingestTurns` (`src/server/ingest/ingest-turns.ts`, dernière fonction) ou `src/server/connectors/ingest-items.ts:135`.
2. `enqueueIndexing(ctx, ingestRunId)` (`ingest-turns.ts:152`) envoie `{ ingestRunId, tenantId, userId }` dans `pipeline-index` (priorité 10). Un échec d'envoi est journalisé (`ingest.enqueue`) ; le run reste `queued` et le tic `pipeline-requeue` (chaque minute, `requeueStaleRuns(5)`) le remet en file.
3. Le worker `search/worker.ts` appelle `indexIngestRun(job, { embedder })` (`src/server/search/index-run.ts:130`) : `resolveTenantContext(job.userId, job.tenantId, { includeFormer: true })`, `claimRun`, passages et vecteurs par tranches de 100 tours, puis statut `done`.
4. Ensuite, deux signaux, chacun enveloppé dans un `try/catch` qui journalise sans jamais faire échouer l'indexation (`index-run.ts:101-106` et `:112-122`, appels `:153-154`) :
   - `signalBriefings(ctx, scope.sourceId)` → `signalSourceActivity` (point du matin).
   - `signalLiaison(ctx, scope.sourceId)` → `enqueueLiaison` si `LINKED_KINDS.has(source.kind)`.
5. En cas d'échec de l'indexation : `failRun(ctx, runId, error)` (`src/server/pipeline/runs.ts:10`) écrit un statut `failed` et un résumé d'erreur de 200 caractères au plus, puis le worker relance avec `new Error(safeErrorSummary(error))` pour que pg-boss reprenne.

Qui émet le signal : **seulement** `indexIngestRun` (`src/server/search/index-run.ts:103`, via `signalBriefings`). Qui l'écoute : il n'y a pas d'abonné ; `signalSourceActivity` est une fonction appelée en direct. Ce n'est pas un bus d'événements.

### 3.3 Le signal de projet, en détail (`signalProjectActivity`, `briefing/queue.ts:148-179`)

1. Écarte une clé de projet de plus de 200 caractères ou mal formée (`PROJECT_KEY_PATTERN`).
2. Lit les destinataires : `select user_id from briefings_du_projet(${project})` sous `withTenant(ctx)`, plus `extraUserIds` (le propriétaire d'une session de code).
3. Pour chaque destinataire, dans un `try/catch` propre (une erreur ne bloque pas les suivants) :
   - `resolveTenantContext(userId, ctx.tenantId)` ; `null` : sauté.
   - sous `withTenant(recipient)`, `update briefings set stale = true` pour `(userId, project)`, avec `returning { preparedAt, lastReadAt }`.
   - `wanted = point ? refreshOnSignal(point) : project.startsWith('github.com/')` : sans point existant, seul un dépôt GitHub est préparé d'avance.
   - si voulu : `enqueueBriefingRefresh({ tenantId, userId, project }, { delaySeconds: BRIEFING_DELAY_SECONDS })`.

Effet : au plus un recalcul par 30 minutes et par (organisation, personne, projet), car la file est « stately » avec clé : les signaux suivants trouvent le job en attente et ne font rien.

### 3.4 Le patron complet du point du matin, étape par étape

Déclencheurs d'un recalcul (tous aboutissent à un job `point-refresh` de clé `tenant:user:project`) :

| Déclencheur | Fonction | Délai |
|---|---|---|
| Signal après indexation | `signalProjectActivity` → `enqueueBriefingRefresh` | 30 min (`BRIEFING_DELAY_SECONDS`), seulement si `refreshOnSignal` |
| Tic de 6 h (Paris) | `enqueueMorningRefreshes()` (`worker.ts:45-66`) : `select … from briefings_a_rafraichir(7)` | immédiat |
| Lecture d'un point périmé | `readBriefing` → `requestRefresh` (`briefings.ts:174-186`) | `delaySeconds` jusqu'à 30 min après la préparation |
| Lecture : aucun point montrable (source devenue invisible, ou projet connu sans point) | `readBriefing` → `requestBriefingRefreshNow` (`upsert`, `startAfter: 0`) | immédiat |
| Page Accueil, point montré périmé | `refreshShownBriefing` (`briefings.ts:192-201`) | idem lecture |
| Changement du texte « À propos » | `markBriefingsStale` (`about.ts:24`) | 30 min si `refreshOnSignal` |

Le job est exécuté par `processRefreshJob` (`src/server/briefing/worker.ts:98-114`) :

```ts
async function processRefreshJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  const { llm } = deps;
  if (llm === null) return;
  const job = BriefingJobSchema.parse(data);
  const ids = { tenantId: job.tenantId, userId: job.userId };
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    // Parti de l'organisation : personne ne peut plus lire ce point sous ses droits.
    if (!ctx) return;
    // Rien n'a bougé depuis sa préparation (aucun signal, aucune source devenue invisible) : le tic du matin ne paie
    // pas un appel au modèle pour réécrire le même point.
    if (await briefingIsFresh(ctx, job.project)) return;
    await refreshBriefing(ctx, job.project, { llm });
  } catch (error) {
    rethrowSummary('briefing.refresh_failed', error, ids);
  }
}
```

Puis `refreshBriefing` (`briefings.ts:94-147`), dans l'ordre :

1. `accountIsGone(ctx.userId)` → `'parti'` (compte supprimé : 0040, `users.deletedAt`).
2. `gatherBriefingMaterial(ctx, project, now)` : une transaction `withTenant` du lecteur ; la RLS retire ce qu'il ne voit pas. Lectures « les siennes » (pas celles de la recherche), voir le commentaire d'écart assumé `gather.ts:29-34`. Texte coupé avant le modèle.
3. `isEmptyMaterial(material)` : rien de neuf → texte fixe `renderEmptyBriefing(...)`, **aucun appel modèle**, aucune réservation, `sourceIds = []`, retour `'rien'`.
4. Sinon, **plafond réservé en base** : `reserver_point(userId, BRIEFING_DAILY_CAP)`. Faux → `console.warn('[leon]', 'briefing.daily_cap', …)` et `'plafond'` : rien n'est écrit, le point reste périmé.
5. Contexte de la personne : `buildBriefingPrompt(material, now, await readAbout(ctx.userId), await readOnboardingMember(ctx), await readDismissed(ctx, project))`. Le « contexte de la personne » est : texte « À propos » (`users.about`, `readAbout`, ≤ 500 caractères), ligne `member` de l'organisation (`readOnboardingMember` : rôle, `department`, `job`, `seniority`, `goals`, `onboardedAt`) et lignes retirées (`briefings.dismissed`).
6. **Un seul appel au modèle**, hors de toute transaction : `writeBody(llm, prompt)` → `llm.streamText({ step: 'point', system, messages, maxTokens: 8000, signal: AbortSignal.timeout(120_000) })`. Les renvois `[n]` sont filtrés par `createReferenceFilter` (seuls les numéros fournis restent). Corps vide : `throw new LlmError('réponse vide')` (le job est repris).
7. `renderBriefing({ project, preparedAt: now, body, references: prompt.references })` ; `sourceIds = materialSourceIds(material)` : **toutes** les sources fournies au modèle, citées ou non.
8. **Écriture du cache**, sous `withTenant(ctx)` : `insert into briefings … on conflict (tenantId, userId, project) do update set markdown, sourceIds, preparedAt, stale = false`, avec `acl: [ctx.userId]`. Le point est privé à son lecteur.
9. Retour `'fait'` (ou `'rien'`).

**Revérification à la lecture** (`readBriefing`, `briefings.ts:291-341`), dans une seule transaction `withTenant(ctx)` :

1. Lit la ligne du point de `(userId, project)`. Absente : `read: null`, et `refresh: 'now'` seulement si `projectIsKnown(tx, ctx, project)` (évite de payer un modèle pour une clé de projet inventée).
2. Note la lecture : `update briefings set last_read_at = now()`.
3. Compte les sources visibles : `select count(*) from sources where id in (sourceIds)` **sous RLS**. Si `visible < wanted.length` : `update … set stale = true`, retourne `read: null`, `refresh: 'now'`. Un point dont une source n'est plus visible n'est jamais rendu.
4. Sinon retourne `markdown: withoutDismissed(row.markdown, row.dismissed)` et, si `row.stale && !refreshOnSignal(row)`, un `delaySeconds` de remise en file (jamais avant 30 min après `preparedAt`).
5. Hors transaction : `requestRefresh(ctx, project, refresh)` si `options.refresh !== false` ; une mise en file qui échoue est journalisée (`briefing.enqueue_failed`) sans casser la lecture.

`briefingResponse` ajoute le **journal de lecture** (`recordReads` de `src/server/memory/read-log.ts:18`, `whole: true`) : une ligne par source fournie. Si une source n'a pas pu être notée (devenue invisible entre-temps), le point n'est pas rendu.

**Retrait d'une ligne** (`dismissBriefingLines`, `briefings.ts:222-232` ; `restoreBriefingLines`, `:235-243`) : `editDismissed` fait `select … for('update')` sur la ligne du point puis `update briefings set dismissed = …`. Les 20 dernières lignes sont gardées (`BRIEFING_DISMISSED_MAX = 20`, `BRIEFING_LINE_MAX_CHARS = 1000`). Aucun appel modèle ; la lecture ôte les lignes (`withoutDismissed` de `@/lib/briefing-view`), le recalcul suivant les donne au modèle pour qu'il ne les redise pas ; un recalcul ne les efface pas.

### 3.5 Le tic de 6 h (`point-matin`)

`briefing/worker.ts:165-185` : le handler lance `enqueueMorningRefreshes()` et (seulement si `llm !== null`) `enqueueAboutProposals()` avec `Promise.allSettled`. Chaque échec est journalisé (`briefing.morning_tick_failed`), puis la première erreur est relancée (résumé) pour que pg-boss reprenne le tic (`retryLimit: 2`, `retryDelay: 300`). Le travail d'un tic = **mettre en file**, pas calculer. Chaque calcul est ensuite un job sous les droits de sa personne.

### 3.6 Les variantes (mêmes étapes, ailleurs)

- **Agenda** (`agenda/agenda.ts:214-`) : `accountIsGone` ; lecture des 120 derniers e-mails de la personne sous `withTenant` ; si aucun e-mail, écrit un agenda vide ; si rien de neuf (`latest <= preparedAt`), met seulement `preparedAt` à jour ; `reserver_agenda(userId, 4)` ; un `streamText({ step: 'agenda', maxTokens: 6000, timeout 90 s })` ; `parseAgendaAnswer` ; `writeAgenda` (insert … on conflict do update, `acl: [userId]`). Déclenché par l'Accueil : `src/app/(app)/page.tsx:144` appelle `enqueueAgendaRefresh({ tenantId, userId })` (clé `tenant:user`). À la lecture (`readWeek`, `agenda.ts:142`), un rendez-vous dont la source n'est plus visible disparaît.
- **« About you »** (`briefing/about-suggestion.ts`) : `proposeAbout(ctx, { llm })` ; une fois par personne ; **pas de `reserver_*`** : le plafond est la fenêtre `singletonSeconds` de 3 jours (`ABOUT_RETRY_SECONDS`) sur la clé `tenant:user`. Appelle `llm.streamText({ step: 'point', … })`.
- **Résumé de session** (`sessions/resume-worker.ts`) : `summarizeSession(job, { llm })` ; `resolveTenantContext(job.ownerUserId, job.tenantId)` ; lecture sous `withTenant` (`readSession`) ; si la session n'est pas encore close, **se remet en file** avec `enqueueResume(job, { fin: false, delaySeconds: read.reportSeconds })` et rend `'reporte'` ; appel `step: 'resume'` ; écriture sous `withTenant` d'un tour `leon:resume:<n>` ; `enqueueIndexing(ctx, runId)` ; `queueFilStates`. **Aucun plafond** : commentaire `shortcut` lignes 69-71.
- **État d'un fil** (`sessions/thread-state-worker.ts`) : appel `step: 'fil'` ; écriture en **versions** avec contrôle d'attente (`lockTarget` puis `writeVersion(tx, ctx, input)`, qui rend `{ n } | 'depassee' | 'gardee' | 'introuvable'`, `src/server/memory/versions.ts:82, 152, 191`) ; si la dernière version n'est plus celle lue, il s'arrête et laisse la tâche en file refaire. Patron compare-and-set utile pour tout agent qui écrit un état.

### 3.7 Sous quels droits

- Le job ne contient jamais de droits, seulement `tenantId` et `userId` (celui du lecteur ou de l'auteur).
- Le droit est rebâti par `resolveTenantContext` à chaque exécution, puis posé en base par `withTenant` (`app.tenant`, `app.user`, `app.principals` dans la transaction).
- Les trois seules lectures **sans** droits de personne : `briefings_a_rafraichir` (tic du matin), `apropos_a_proposer` (`about-suggestion.ts:32`, fonction SQL non lue), `connector_syncs_due()` (`connectors/sync.ts:259-262`). Elles ne rendent que des identifiants (« jamais de texte », commentaire de `0030`).
- Les tables-compteurs (`points_par_jour`, `agendas_par_jour`) ne sont lues et écrites que par leur fonction `security definer`.

## 4. Conventions

- **Langue** : les identifiants mélangent français et anglais. Les types et verbes de code sont en anglais (`refreshBriefing`, `enqueueBriefingRefresh`, `BriefingJobSchema`, `wakeQueueAfter`) ; les noms de files, tables, colonnes SQL et résultats sont en français (`point-refresh`, `points_par_jour`, `reserver_point`, `briefings_a_rafraichir`, `'fait' | 'rien' | 'plafond' | 'parti'`). Les commentaires sont en français, longs et explicatifs, avec les raisons des choix. Le texte envoyé au modèle est en anglais pour le point (`BRIEFING_PENDING_MARKDOWN`, `'What is still open'`).
- **Fichiers** : un module `queue.ts` (déclaration et envois) et un `worker.ts` (lecture) par famille ; un fichier métier par fonction (`briefings.ts`, `gather.ts`, `agenda.ts`). Pour les sessions : `resume-queue.ts` + `resume-worker.ts`, `threads-queue.ts` + `threads.ts`, `thread-state-worker.ts`.
- **Tests** : `x.test.ts` (unitaire, sans base) et `x.db.test.ts` (avec base). Vitest 5.0.4, trois projets `unit`, `db`, `db-seul` (`vitest.config.ts:18-41`). Fichiers présents : `briefing/queue.db.test.ts`, `briefing/worker.test.ts`, `briefing/worker.db.test.ts`, `briefing/briefings.db.test.ts`, `briefing/gather.db.test.ts`, `pipeline/queue.test.ts`, `pipeline/queue.db.test.ts`, `sessions/resume-queue.db.test.ts`, `sessions/resume-worker.db.test.ts`. Non lus.
- **Idempotence** : tout `startXWorker` est protégé par `globalThis` (`leonBriefingWorker`, `leonSearchWorker`, `leonConnectorWorker`, `leonResumeWorker`, `leonThreadsWorker`, `leonThreadLinksWorker`, `leonFilStateWorker`) et se remet à `undefined` si le démarrage échoue. Même chose pour chaque `getXBoss()`.
- **Validation** : Zod 4 (`z.uuid()`) sur chaque job, à l'envoi (`XSchema.parse(job)`) **et** à la réception (`XSchema.parse(data)` dans `processXJob`). Le job ne porte que des identifiants.
- **Erreurs** : le worker attrape, appelle `logError(event, error, ids)`, puis relance `new Error(safeErrorSummary(error))`. Jamais l'erreur d'origine : une erreur de base ou de modèle peut citer du texte capté. `logError` (`src/server/log.ts:37-41`) écrit sur `console.error('[leon]', event, JSON.stringify({ ...ids, error }))` et envoie à Sentry (`captureException` avec tags). Les `ids` sont des identifiants, jamais du texte.
- **Journalisation** : `console.info('[leon]', 'nom.evenement', JSON.stringify({…}))` pour l'information (ex. `agenda.refreshed`, `llm.usage`), `console.warn` pour un plafond atteint (`briefing.daily_cap`, `agenda.daily_cap`). Noms de la forme `module.evenement` (`briefing.refresh_failed`, `search.index_failed`, `resume.failed`, `connector.job_failed`). Pas de texte capté dans les journaux ; compteurs et identifiants seulement.
- **Sans modèle** : `if (llm === null) return;` en tête de chaque processeur : le job se termine sans rien faire, sans échec ni reprise.
- **Envoi qui échoue** : un envoi en file ne doit pas casser la requête ni l'indexation (try/catch + `logError`) ; la reprise vient d'un tic ou d'une prochaine lecture.
- **Écritures** : toujours `withTenant(ctx, …)`, `acl: [ctx.userId]` pour un cache privé ; `insert … onConflictDoUpdate` pour un cache refait en place ; `grant update (colonnes)` par colonne dans la migration.
- **Migrations** : fichiers numérotés `NNNN-nom-ascii.sql` dans `src/server/db/migrations/`, commentaire d'en-tête en français qui dit pourquoi ; noms de tables et de fonctions SQL en français ; `leon_app` n'a que des `grant` explicites.

## 5. Points d'extension pour le système d'agents

### 5.1 Un moteur qui exécute des agents en tâche de fond

À copier presque tel quel : le triplet `agents-queue.ts` (déclaration) + `agents-worker.ts` (lecture) + démarrage dans `instrumentation-node.ts`.

- **File** : par exemple `agent-run`, déclarée dans un `getAgentsBoss()` comme `getBriefingBoss()` (`ensureQueue(boss, name, { policy: 'stately', retryLimit, retryDelay, retryBackoff })`). Choix à faire : « stately » avec clé `tenant:agent:déclencheur-ou-objet` pour dédoublonner, ou politique standard sans clé (une exécution par événement). Le code existant n'a que ces deux formes.
- **Job** : seulement des identifiants, validés par un `AgentJobSchema` Zod : `tenantId`, `userId` (la personne sous les droits de qui l'agent agit), un identifiant de fiche d'agent, un identifiant de déclencheur ou d'objet.
- **Worker** : `resolveTenantContext(userId, tenantId)` ; si `null`, fin. Matière lue sous `withTenant`. Appel(s) au modèle hors de toute transaction. `llm.runAgent({ step, system, messages, tools, maxSteps, maxTokens, signal })` est déjà là pour la boucle d'outils (`src/server/llm/llm.ts:57-65`) ; l'interface `AgentTool` (nom, description, `input` Zod, `run`) existe (`llm.ts:11-16`). La boucle de la discussion (`src/server/discussion/agent.ts`) n'a pas été lue en détail.
- **Étape du modèle** : ajouter une valeur à `LlmStep` (`llm.ts:4`), à `SETTING_BY_STEP` et `EFFORT_BY_STEP` (`models.ts:115-135`), à `ANTHROPIC_MODEL_BY_STEP` (`models.ts`, non lu en entier) **et** élargir la contrainte `appels_modele_step_check` par une migration (comme `0072-agenda.sql:57-60`). Sans cela l'insertion de `logUsage` échoue (elle est journalisée, pas bloquante).
- **Reprise et délai** : `retryLimit`, `retryDelay`, `retryBackoff` sur la file ; `expireInSeconds` si une exécution dépasse 15 minutes (le connecteur l'a mis à 1800 : `connectors/worker.ts:8-10`, car « le défaut de pg-boss, 15 minutes, déclarerait expiré un long passage encore en cours »). Une boucle d'agent longue le réclamera.
- **Parallélisme** : `localConcurrency` est par processus (2 pour les files avec modèle). Un moteur à beaucoup d'agents le monte, mais à 2 connexions pg-boss et 4 de pool (`db/client.ts:9-12`, `pipeline/queue.ts:91`) : le budget de connexions est contraint (7 par instance, commentaire de `db/client.ts`).
- **Se remettre en file soi-même** : modèle existant `enqueueResume(job, { fin: false, delaySeconds })` appelé depuis le worker (`resume-worker.ts:313-316`). Utile pour une exécution en plusieurs étapes.
- **Écrire un état avec contrôle de concurrence** : `writeVersion`/`lockTarget` (`memory/versions.ts`), mais ses cibles sont figées (`CIBLES = ['leon_fil', 'mcp_remember']`, `versions.ts:29`) : un état d'agent demande une nouvelle cible ou une table propre.

### 5.2 Des déclencheurs sur événement

Aujourd'hui l'événement « un élément est indexé » n'a **qu'un seul point de sortie** : `indexIngestRun` appelle en direct `signalBriefings` puis `signalLiaison` (`index-run.ts:153-154`). Il n'y a ni bus, ni registre d'abonnés, ni table de déclencheurs.

- **Où brancher** : dans `indexIngestRun`, après `signalLiaison`, un troisième signal du même patron (`signalAgents(ctx, scope.sourceId)`), enveloppé dans un `try/catch` qui journalise sans jamais faire échouer l'indexation (modèle : `signalBriefings`, `index-run.ts:101-106`). Il lit la source sous `withTenant(ctx)` (type, `metadata`, `ownerUserId`, comme `projectOfSource`), cherche les fiches dont le déclencheur correspond, et met un job par agent en file.
- **Droits à régler** : le contexte du signal est celui du job d'indexation, bâti avec `includeFormer: true` (ancien membre accepté, `index-run.ts:134`) pour l'utilisateur du job (celui qui a capté ou créé la connexion), pas pour le destinataire de l'agent. `signalProjectActivity` montre comment passer au destinataire : `resolveTenantContext(userId, ctx.tenantId)` puis lire sous ses droits (`queue.ts:160`). Un agent d'équipe devra choisir sous quels droits il tourne.
- **Dédoublonnage** : la clé `singletonKey` + délai de la file « stately » donne un coalescing gratuit (« un recalcul au plus par 30 minutes »). Pour un agent à réaction immédiate, utiliser `upsert` avec `startAfter: 0` (modèle `requestBriefingRefreshNow`).
- **Autres événements à signaler** déjà émis sans signal : un connecteur qui écrit (`connectors/ingest-items.ts:135`), un document (`documents/documents.ts:259`), une note (`memory/notes.ts:238, 267`), une coulisse (`ingest/record-backstage.ts:100`), un fait de session (`api/faits-routes.ts:42-48`). Tous passent par `enqueueIndexing` : l'indexation est donc le bon endroit unique, sous réserve de la section 6 (les passages sont écrits avant le signal, pas les vecteurs complets).
- **Le tri « standard »** (classifier chaque élément) serait un appel de modèle par élément à l'entrée : aucune file existante pour cela. Les files `pipeline-triage`, `pipeline-extraction`, `pipeline-placement` ont été **supprimées** (`LEGACY_QUEUES`, `pipeline/queue.ts:15-17`) ; leur code n'est plus dans le dépôt.

### 5.3 Une veille (« rien depuis cinq jours »)

Le code a le patron d'un tic planifié suivi d'une mise en file par personne : `point-matin` → `enqueueMorningRefreshes` → un job par point (`briefing/worker.ts:45-66, 161-185`), et `apropos-proposer` avec sa fenêtre `singletonSeconds`.

- **Tic** : `boss.schedule('agents-veille', cron, null, { tz: 'Europe/Paris', missed: 'once' })`. Le tic cherche, par une fonction SQL `security definer` qui ne rend que des identifiants (modèle `briefings_a_rafraichir`, `0030:61-70`), les objets à vérifier (par exemple « dernier élément d'un fil ou d'un client, par type, plus ancien que N jours »).
- **État court de la veille** : « attend une réponse depuis le… » : aucune table de ce genre n'existe. `systeme-complet.md` l'assume comme entorse. Le cache `briefings` et `agendas` sont les deux modèles de table privée refaite en place (RLS `tenant_acl`, `acl = array[user_id]`).
- **Fenêtre anti-rejeu** : `singletonKey` + `singletonSeconds` (3 jours pour « About you ») pour qu'une veille déjà déclenchée ne se redéclenche pas chaque matin (`briefing/worker.ts:78-82`, commentaire `queue.ts:29-32`). La fenêtre doit rester sous `deleteAfterSeconds` (7 jours, commentaire de `queue.ts:31` ; la valeur est dans pg-boss, non lue).
- **Absence d'événement** : rien dans le code ne détecte une absence. `STALE_AFTER_MS` dans `memory/stale.ts:6` (24 h) sert à signaler un **canal** de capture muet (`staleChannels`), pas un objet métier ; il montre seulement la forme.

### 5.4 Un budget par organisation

Ce qui existe : un compteur **par personne et par jour, par fonction** (`reserver_point`, `reserver_agenda`), UTC, sans texte, `security definer`, avec nettoyage des jours passés. Ce qui manque :

- **Aucun compteur par organisation**, ni par agent, ni en coût réel : `appels_modele` n'a ni `tenant_id` ni `user_id` et `leon_app` n'a que `insert` dessus (`0039:34`). `reserver_*` compte des **appels**, pas des dollars (« 2 à 5 centimes par point », commentaire `briefings.ts:53-54`).
- **Quoi ajouter** : une table `…_par_jour` (ou par mois) avec clé `(tenant_id, jour)` et un montant ou un nombre ; une fonction `reserver_budget(p_tenant uuid, p_agent text, p_unites integer, p_plafond integer) returns boolean` écrite comme `reserver_point` (insert … on conflict do update … where nombre + p_unites <= p_plafond) ; un plafond lu de la fiche ou de l'organisation. Pour mesurer le coût réel, il faut que `logUsage` reçoive un identifiant d'organisation : sa signature `logUsage(step, model, usage, chargedUsd?)` n'en a pas, et l'interface `Llm.streamText`/`runAgent` non plus (`llm.ts:50-69`).
- **Où réserver** : juste avant l'appel au modèle et après la matière rassemblée, exactement comme `refreshBriefing` (`briefings.ts:108-115`) ; le cas « matière vide » ne réserve rien.
- **Rendre une réservation** : jamais fait aujourd'hui (voir section 6).

### 5.5 Une action d'écriture dans un outil (tâche de fond)

La section « proposer puis confirmer » n'est pas dans le périmètre de cette carte (voir carte 04). Du côté des tâches de fond : une action proposée par un job n'a pas de discussion ouverte pour attendre une confirmation ; l'annexe `08-etat-interne.md:147` le dit et signale une expiration d'une heure (`src/lib/actions.ts:67-69`, non lu ici). Un job d'agent n'a pas non plus de file « sortante » : aucune file d'envoi n'existe parmi les files lues (aucune recherche de file d'envoi e-mail hors de ces dossiers n'a été faite).

### 5.6 Un écran

Le patron de lecture est `briefingResponse` / `readBriefing` (cache privé, revérifié à la lecture, lecture notée) et la page Accueil `src/app/(app)/page.tsx` (lecture de l'agenda, mise en file à l'affichage : ligne 144). Les écrans eux-mêmes n'ont pas été lus (section 7).

### 5.7 Ce qu'il faudrait généraliser

- `refreshBriefing` est écrit pour **une personne × un projet** ; la matière (`gather.ts`) lit `sessions` de code, `changes` GitHub et `mentions`. Un brief de rendez-vous ou un agent de relance demande un nouveau « rassembler », pas une généralisation de celui-là.
- Le **cache** `briefings` a une contrainte `check` sur la clé de projet (`github.com/…|dossier:…`) : on n'y met pas autre chose. Un agent aura sa propre table (même gabarit : `tenant_id`, `user_id`, clé, résultat, `source_ids`, `prepared_at`, `acl check (acl = array[user_id])`, RLS `tenant_acl`).
- `reserver_point` et `reserver_agenda` sont deux copies du même SQL : une fonction paramétrée par un nom de compteur serait la généralisation naturelle (aujourd'hui un couple table + fonction par fonction payante).
- Un module commun « tic puis mise en file par personne » n'existe pas : `enqueueMorningRefreshes`, `enqueueAboutProposals` et `enqueueDueSyncs` l'écrivent chacun.
- `getBriefingBoss`, `getResumeBoss`, `getThreadsBoss` sont trois copies du même patron (`globalThis` + `ensureQueue` + remise à zéro en cas d'échec) : à factoriser pour un `getAgentsBoss`.

## 6. Pièges et limites écrites dans le code

### 6.1 Une instance par base

README, `README.md:39-51` :

> **Une seule instance de Leon par base, un seul modèle de vecteurs à la fois.** Les tâches de fond (relève des outils, indexation, vecteurs) et quelques gardes (réponses en cours, nombre de réponses par personne) vivent dans le processus.
> Deux instances sur la même base (ou deux modèles actifs) ne cassent pas les droits, mais doublent des appels payants et peuvent effacer les vecteurs l'une de l'autre. Passer à plusieurs instances sera un chantier à part.

`README.md:62-64` : Railway démarre la nouvelle version avant d'arrêter l'ancienne ; `overlapSeconds: "0"` réduit le recouvrement au temps du démarrage (quelques dizaines de secondes) ; « Éviter de mettre en ligne pendant une relève ou un changement de modèle de vecteurs ». Une instance ouvre 7 connexions (4 de pool + 2 pg-boss + 1 écoute), 14 pendant le recouvrement (`db/client.ts:9-10`).

### 6.2 Ce qui vit en mémoire du processus et casserait avec plusieurs instances

| Quoi | Où | Effet à plusieurs instances |
|---|---|---|
| Garde « une réponse à la fois par discussion » et « au plus 2 réponses par utilisateur » | `src/server/discussion/agent.ts:35-37, 44-52`, `Set` sur `globalThis` via `Symbol.for('leon.discussion.replying')` | Le commentaire le dit : « sur plusieurs, la base refuse toujours une seconde réponse à la même question (`saveReply`), qui rend alors "en-cours" elle aussi ». Le plafond de 2 par utilisateur devient 2 par instance. |
| Garde « au plus 3 réponses en cours par utilisateur » | `src/server/answer/answer.ts:69-72`, `const answering = new Map<string, number>()` | Idem : 3 par instance. |
| File de création d'organisations | `src/server/auth/sign-up.ts:55-61`, `leonOrganizationQueue` | Le verrou Postgres de la personne sérialise d'une instance à l'autre (commentaire lignes 57-59) : pas de casse. |
| Cache de la réponse en tête | `src/server/answer/answer.ts:38` : `const cache = new Map<string, Cached>();` | Cache par processus : pas de casse apparente, seulement des échecs de cache (lecture partielle du fichier). |
| Jeton d'accès Pipedream | `src/server/connectors/pipedream.ts:71` : `let cachedToken: { clientId; token; expiresAt } \| null` | Un jeton par processus : pas de casse. |
| Purge des rappels cités une fois par heure | `src/server/search/worker.ts:86, 92-95`, `let purgedAt = 0` dans le worker du tic `requeue` | Chaque instance purge à son rythme : sans effet grave (purge idempotente), mais « une ligne vit 25 h au plus » suppose un seul rythme. |
| Singletons `PgBoss`, pool `pg`, démarrages de workers | `globalThis` (`leonBoss`, `leonPool`, `leon…Worker`) | Un par processus : c'est voulu. Chaque instance lance **tous** les workers. |
| Modèle de vecteurs actif | `getEmbedder(env)` ; README | Deux modèles actifs : vecteurs effacés l'un par l'autre (README). |

Ce qui est **déjà sûr** à plusieurs instances : les files pg-boss (reprise par la base), les plafonds `reserver_*` (verrou de ligne de `on conflict do update`), les clés `singletonKey` (portées par pg-boss en base), les droits (RLS), les versions de fil (compare-and-set), la planification `boss.schedule` (portée par la base ; la déduplication entre deux instances qui appellent `schedule` en même temps n'a pas été lue, section 7).

### 6.3 Commentaires `shortcut` et « à faire » lus

- `resume-worker.ts:63-68` : l'usage `resume` doit dater de moins d'une heure (`metadata.faits_le`) tant qu'un retrait peut manquer le serveur.
- `resume-worker.ts:69-71` (recopié) : « shortcut: aucun plafond par membre ni par organisation, seulement des bornes par appel : un porteur du jeton du poste peut multiplier les sessions, donc les appels, et retarder ceux des autres (file commune). appels_modele compte le coût sans rien arrêter ; plafonner par auteur sur 24 h le jour où l'étape `resume` y dépasse 5 $ par jour. »
- `thread-state-worker.ts:80-95` : un « shortcut » sur la lecture de `metadata.usages`.
- `agenda.ts:83-85` : « shortcut: une heure dans un autre fuseau … n'est pas lue ».
- `db/client.ts:11` : « shortcut: RDS (db.t4g.small) accepte ~200 connexions directes ; relever quand le débit des tâches le demande ».
- `pipeline/queue.ts:28-29` (audit 3 n° 5) : le tic des vecteurs peut dépasser la minute ; d'où `policy: 'stately'` sur `reindex`.
- `search/worker.ts:22-26` : en repli de sondage, un emplacement ne prend qu'un job par sondage ; d'où `INDEX_POLLING_SECONDS = 0.5` et `wakeQueueAfter`.

### 6.4 Pièges de pg-boss tels que le code les décrit

- **`stately` + `send`** : un second `send` de même clé pendant l'attente est **ignoré** (rend `null`). Pour avancer l'heure d'un job retardé, il faut `upsert` (`briefing/queue.ts:96-98`, `resume-queue.ts:41-43`).
- **`startAfter: 0`** plutôt qu'une date du serveur : « maintenant à l'horloge de la base, qui décide du réveil des lecteurs (une horloge du serveur en avance les laisserait dormir 30 s) » (`briefing/queue.ts:99-100`). `enqueueResume` avec `fin: true`, lui, passe une date calculée à l'horloge du serveur (`new Date(Date.now() + RESUME_END_SECONDS * 1000)`, `resume-queue.ts:53`) : l'écart d'horloge n'y compte pas pour 60 s, mais la règle de `startAfter: 0` n'y est pas appliquée.
- **Sondage** : avec l'écoute (`useListenNotify: true`), une boucle attend 30 s après chaque job sauf réveil ; d'où `wakeQueueAfter`. Si l'écoute échoue au démarrage, pg-boss revient au sondage rapide jusqu'au redémarrage (`logBossWarning`, `queue.ts:72-76`).
- **Politique d'une file qui change** : supprime et recrée la file (voir 2.1).
- **Fenêtre `singletonSeconds`** : doit rester sous `deleteAfterSeconds` (7 jours) ; la fenêtre vaut même pour un job fini ou échoué (`queue.ts:29-32`).
- **`flowIntervalSeconds: 300`** : Leon n'utilise ni `dependsOn` ni flux (`queue.ts:96`).
- **Ne rien citer dans l'erreur relancée** : toujours `safeErrorSummary`.
- **Tic manqué** : `missed: 'once'` seulement sur le tic de 6 h ; les tics de la minute n'en ont pas.
- **Parallélisme `batchSize: 1`** partout : un job par appel du handler.

### 6.5 Plafonds et gardes

- `reserver_point` : réservation **avant** l'appel ; si l'appel au modèle échoue (`LlmError`), la place est **perdue** et pg-boss reprend le job (jusqu'à 3 fois) : chaque reprise tente de réserver à nouveau. Rien dans le code lu ne rend une réservation. Au plafond : `'plafond'`, point laissé périmé jusqu'au lendemain. Le message de l'Accueil (`welcome.briefing.redoCapped`, `messages/*.json`) répète le nombre 4 : à changer avec `BRIEFING_DAILY_CAP` (`briefings.ts:55`).
- Le plafond d'un point compte **toutes organisations et tous projets confondus** pour la personne (`briefings.ts:51-52`).
- « About you » : pas de compteur, seulement la fenêtre de 3 jours (4 essais au plus, car `retryLimit: 3`).
- Résumés de session, état des fils : **aucun plafond** (commentaire `shortcut`).
- Le point du matin tourne à 2 en parallèle, 30 secondes chacun environ (`worker.ts:36-37`) : 100 personnes à 6 h font environ 25 minutes de file (annexe `08-etat-interne.md:270`).
- Un compte supprimé (`users.deletedAt`) n'entraîne pas d'appel : `accountIsGone`.
- Une clé de projet inventée ne met rien en file : `projectIsKnown` (`briefings.ts:269-278`).

### 6.6 Pièges de droits

- Le point est privé à son lecteur (`acl = [user_id]`, imposé par un `check` en base). Un résultat **partagé** (canal, fiche d'équipe) n'a pas d'équivalent dans le code (annexe `08-etat-interne.md:272`).
- La revérification à la lecture ne compte que des sources encore visibles (`count(*)` sous RLS) : si un agent produit un résultat citant des sources, il doit garder la liste `source_ids` **complète** (toutes les sources fournies au modèle, citées ou non).
- `gather.ts:29-34` : l'écart assumé à la décision D4 : les lectures du point sont les siennes (pas celles de `searchPassages`), toujours dans `withTenant` du lecteur. « Toute nouvelle règle de visibilité qui ne serait pas portée par la sécurité par ligne devra y être ajoutée. »
- Les files transportent `tenantId` et `userId` : un identifiant faux ou périmé est neutralisé par `resolveTenantContext` (appartenance revérifiée à chaque exécution).
- `indexIngestRun` lit avec `includeFormer: true` : le signal qu'il émet part sous les droits d'un ancien membre éventuel ; `signalProjectActivity` re-résout chaque destinataire sans `includeFormer`.

### 6.7 Signal et retards

- Le signal part **après** `status: 'done'` du run, donc après l'écriture des passages. Les vecteurs peuvent manquer encore (le tic `reindex` les complète) ; le point du matin, qui lit des tours (`turns`) et non des passages, n'en dépend pas.
- Le signal est « au mieux » : un échec est journalisé et avalé (`search.signal_failed`) ; la reprise vient du tic de 6 h ou de la prochaine lecture. Si l'indexation est relancée (reprise), le signal repart une seconde fois : sans conséquence pour le point (clé « stately »).
- Seuls les types `isCodeSessionKind(kind)` (Claude Code, Codex) et `github` ont un projet (`projectOfSource`, `queue.ts:184-213`) : **les autres sources ne signalent rien aujourd'hui** ; d'après le commentaire de `projectOfSource` (`queue.ts:181-183`), ce qui y mentionne quelqu'un entre dans son point au tic du matin.

## 7. Ce que je n'ai pas lu

- Les définitions de `gatherBriefingMaterial`, `readMentions`, `readChanges` (suite de `src/server/briefing/gather.ts` après la ligne 230) : seulement leurs types, constantes et signatures d'appel.
- `src/server/briefing/briefing-prompt.ts` (hors constantes lues par grep), `about-prompt.ts`, `about-material.ts`, `agenda-prompt.ts`, et les tests de tout `briefing/`, `agenda/`, `pipeline/`, `sessions/`, `memory/`.
- `src/server/sessions/threads.ts`, `thread-links.ts`, `thread-state.ts`, `condense.ts`, `render-context.ts`, `start-context.ts`, `reminder.ts`, `thread-read.ts` : seulement leurs lignes de files, de workers et de constantes. Je n'ai pas lu les règles de rangement et de liaison.
- `src/server/memory/` : j'ai lu `read-log.ts` (signature et en-tête) et la partie de `versions.ts` entre les lignes 143 et 235. Pas lu : `lessons.ts`, `notes.ts`, `labels.ts`, `sources.ts`, `stale.ts` (sauf deux constantes), `memory-section.ts`.
- La **bibliothèque pg-boss** : `node_modules` n'est pas installé dans cet environnement. Je cite l'usage qu'en fait Leon (version `12.37.1`, `package.json`) ; je n'ai pas lu ses types ni sa documentation. Je ne peux donc pas confirmer : le comportement exact de `policy: 'stately'` et `'short'`, la valeur de `deleteAfterSeconds`, la durée de vie d'un job terminé, la déduplication de `boss.schedule` entre deux instances, la possibilité de plusieurs plannings sur une même file, le rôle exact d'`upsert`.
- Où et comment le schéma `pgboss` est créé (`createSchema: false`) : migration ou script non lus.
- `src/server/search/embed-missing.ts` (`requeueStaleRuns`, `embedMissingBatch`), `src/server/ingest/` (sauf `enqueueIndexing` et `ingestTurns`), `src/server/connectors/sync.ts` (sauf `enqueueDueSyncs`), `src/server/connectors/ingest-items.ts`.
- Les fonctions SQL `apropos_a_proposer` (0045), `connector_syncs_due` (0008), `runs_en_attente` (0011) : je n'ai lu que leur appel.
- `src/server/llm/anthropic-llm.ts` hors `logUsage` ; `models.ts` hors lignes 1-60 et 110-153 ; `env.ts` ; `src/server/discussion/agent.ts` (boucle d'outils) et `src/lib/actions.ts` ; les routes `src/server/api/*` (seulement des appels `enqueue*` repérés par recherche) ; les pages `src/app/**` (sauf une ligne repérée par recherche).
- Les migrations 0073 (`agendas-a-refaire`), 0041, 0050 et 0062 : seulement leurs noms et leur effet sur `appels_modele_step_check` (par 0072).
- `README.md` : seulement les sections « Une instance, un modèle » et « En ligne (Railway) » (lignes 39-78).
- Aucune exécution : ni serveur, ni tests, ni migration.
