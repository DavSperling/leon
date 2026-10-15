import { randomUUID } from 'node:crypto';
import {
  type AnyColumn,
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { withTenant } from '@/server/db/with-tenant';
import { decryptSecret, encryptSecret } from './crypto';
import type { ConnectionRef } from './ingest-items';

export type ConnectionStatus = 'active' | 'paused' | 'error';

// Ce que voit l'interface : jamais le secret, seulement ses 4 derniers caractères.
export type ConnectionView = {
  id: string;
  provider: ProviderId;
  label: string;
  config: Record<string, unknown>;
  secretHint: string;
  status: ConnectionStatus;
  since: Date;
  nextSyncAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  itemsSynced: number;
  createdBy: { id: string; name: string };
  createdAt: Date;
};

// Configuration fusionnée, secrets compris : réservée à la relève et au test de la connexion.
export type LoadedConnection = ConnectionRef & {
  config: Record<string, unknown>;
  cursor: string | null;
  since: Date;
};

export type SyncOutcome =
  | { kind: 'ok'; again: 'soon' | 'later' }
  | { kind: 'auth_error'; message: string }
  | { kind: 'error'; message: string };

const LAST_ERROR_MAX = 300;
const SecretsSchema = z.record(z.string(), z.unknown());

// Les données associées lient le secret à sa ligne : recopié ailleurs, il ne se déchiffre plus.
const aadOf = (tenantId: string, connectionId: string) => `${tenantId}:${connectionId}`;

// Texte coupé par caractères (et non par unités UTF-16) : Postgres compte les caractères.
const cut = (text: string, max: number) => Array.from(text).slice(0, max).join('');

// Décision D4 : les champs secrets sont chiffrés ensemble, les autres restent lisibles.
function sealSecrets(
  config: Record<string, unknown>,
  secretFields: readonly string[],
  aad: string,
): { secret: string; secretHint: string } {
  const secrets: Record<string, unknown> = {};
  for (const name of secretFields) if (name in config) secrets[name] = config[name];
  const first = secretFields[0];
  const hint = first === undefined ? '' : String(config[first] ?? '');
  return {
    secret: encryptSecret(JSON.stringify(secrets), aad),
    secretHint: Array.from(hint).slice(-4).join(''),
  };
}

function openConfig(config: Record<string, unknown>, secretFields: readonly string[]) {
  return Object.fromEntries(
    Object.entries(config).filter(([name]) => !secretFields.includes(name)),
  );
}

// Une pause demandée pendant un passage ou un remplacement de clé l'emporte : la valeur de
// la colonne reste celle de la pause.
const unlessPaused = (value: SQL | AnyColumn, whenPaused: SQL | AnyColumn) =>
  sql`case when ${connections.status} = 'paused' then ${whenPaused} else ${value} end`;

const NO_DATE = sql`null::timestamptz`;

// Le message de `JSON.parse` peut citer le texte lu : on n'en garde rien.
function parseSecrets(plain: string): Record<string, unknown> {
  try {
    return SecretsSchema.parse(JSON.parse(plain));
  } catch {
    throw new Error('Secret illisible');
  }
}

export async function createConnection(
  ctx: TenantContext,
  input: {
    provider: ProviderId;
    label: string;
    config: Record<string, unknown>;
    secretFields: readonly string[];
    since: Date;
  },
): Promise<string> {
  const id = randomUUID();
  const sealed = sealSecrets(input.config, input.secretFields, aadOf(ctx.tenantId, id));
  await withTenant(ctx, (tx) =>
    tx.insert(connections).values({
      id,
      tenantId: ctx.tenantId,
      createdBy: ctx.userId,
      provider: input.provider,
      label: input.label,
      config: openConfig(input.config, input.secretFields),
      ...sealed,
      since: input.since,
      nextSyncAt: sql`now()`,
      acl: [ctx.tenantId],
    }),
  );
  return id;
}

// Aucune colonne `secret` ici : la liste est écrite champ par champ.
export async function listConnections(ctx: TenantContext): Promise<ConnectionView[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: connections.id,
        provider: connections.provider,
        label: connections.label,
        config: connections.config,
        secretHint: connections.secretHint,
        status: connections.status,
        since: connections.since,
        nextSyncAt: connections.nextSyncAt,
        lastSyncAt: connections.lastSyncAt,
        lastError: connections.lastError,
        itemsSynced: connections.itemsSynced,
        createdAt: connections.createdAt,
        creatorId: users.id,
        creatorName: users.name,
      })
      .from(connections)
      .innerJoin(users, eq(users.id, connections.createdBy))
      .orderBy(asc(connections.createdAt), asc(connections.id)),
  );
  return rows.map(({ creatorId, creatorName, ...view }) => ({
    ...view,
    createdBy: { id: creatorId, name: creatorName },
  }));
}

// `config` porte tous les champs secrets de l'outil ; les champs ouverts ne sont pas réécrits.
// C'est le remède à « Clé refusée » : la connexion repart tout de suite, sauf si elle est en pause.
export async function replaceConnectionSecret(
  ctx: TenantContext,
  id: string,
  config: Record<string, unknown>,
  secretFields: readonly string[],
): Promise<boolean> {
  const sealed = sealSecrets(config, secretFields, aadOf(ctx.tenantId, id));
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({
        ...sealed,
        status: unlessPaused(sql`'active'::text`, connections.status),
        lastError: unlessPaused(sql`null::text`, connections.lastError),
        nextSyncAt: unlessPaused(sql`now()`, NO_DATE),
        updatedAt: sql`now()`,
      })
      .where(eq(connections.id, id))
      .returning({ id: connections.id }),
  );
  return rows.length > 0;
}

export async function setConnectionPaused(
  ctx: TenantContext,
  id: string,
  paused: boolean,
): Promise<boolean> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set(
        paused
          ? { status: 'paused', nextSyncAt: null, updatedAt: sql`now()` }
          : { status: 'active', nextSyncAt: sql`now()`, updatedAt: sql`now()` },
      )
      .where(and(eq(connections.id, id), paused ? undefined : eq(connections.status, 'paused')))
      .returning({ id: connections.id }),
  );
  return rows.length > 0;
}

// Une connexion en pause n'a pas d'échéance : « Synchroniser maintenant » ne la réveille pas.
export async function requestSyncNow(ctx: TenantContext, id: string): Promise<boolean> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({ status: 'active', nextSyncAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(connections.id, id), inArray(connections.status, ['active', 'error'])))
      .returning({ id: connections.id }),
  );
  return rows.length > 0;
}

// Les sources déjà captées restent : leur `connection_id` passe à nul (clé étrangère).
export async function deleteConnection(ctx: TenantContext, id: string): Promise<boolean> {
  const rows = await withTenant(ctx, (tx) =>
    tx.delete(connections).where(eq(connections.id, id)).returning({ id: connections.id }),
  );
  return rows.length > 0;
}

// Réservées à la relève ------------------------------------------------------------------------

// Une réservation de plus de 30 minutes est réputée abandonnée. Le secret est déchiffré après
// la validation de la réservation : une clé illisible laisse la réservation posée, `finishSync`
// la libère. L'erreur de déchiffrement remonte, sans le secret.
export async function claimConnection(
  ctx: TenantContext,
  id: string,
): Promise<LoadedConnection | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({ syncLockAt: sql`now()`, lastSyncStartedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(connections.id, id),
          inArray(connections.status, ['active', 'error']),
          lte(connections.nextSyncAt, sql`now()`),
          or(
            isNull(connections.syncLockAt),
            lt(connections.syncLockAt, sql`now() - interval '30 minutes'`),
          ),
        ),
      )
      .returning({
        id: connections.id,
        provider: connections.provider,
        createdBy: connections.createdBy,
        config: connections.config,
        secret: connections.secret,
        cursor: connections.cursor,
        since: connections.since,
      }),
  );
  if (!row) return null;
  const { secret, config, ...loaded } = row;
  const secrets = parseSecrets(decryptSecret(secret, aadOf(ctx.tenantId, id)));
  return { ...loaded, config: { ...config, ...secrets } };
}

export async function saveSyncProgress(
  ctx: TenantContext,
  id: string,
  cursor: string,
  itemsAdded: number,
): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({
        cursor,
        itemsSynced: sql`${connections.itemsSynced} + ${itemsAdded}`,
        updatedAt: sql`now()`,
      })
      .where(eq(connections.id, id)),
  );
}

const NEXT_SYNC = {
  soon: sql`now() + interval '1 minute'`,
  later: sql`now() + interval '15 minutes'`,
  retry: sql`now() + interval '1 hour'`,
  never: NO_DATE,
};

function outcomeColumns(outcome: SyncOutcome) {
  if (outcome.kind === 'ok') {
    return { status: 'active', nextSync: NEXT_SYNC[outcome.again], lastError: null };
  }
  const nextSync = outcome.kind === 'auth_error' ? NEXT_SYNC.never : NEXT_SYNC.retry;
  return { status: 'error', nextSync, lastError: cut(outcome.message, LAST_ERROR_MAX) };
}

export async function finishSync(
  ctx: TenantContext,
  id: string,
  outcome: SyncOutcome,
): Promise<void> {
  const { status, nextSync, lastError } = outcomeColumns(outcome);
  await withTenant(ctx, (tx) =>
    tx
      .update(connections)
      .set({
        status: unlessPaused(sql`${status}::text`, connections.status),
        nextSyncAt: unlessPaused(nextSync, NO_DATE),
        lastError,
        lastSyncAt: outcome.kind === 'ok' ? sql`now()` : undefined,
        syncLockAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(connections.id, id)),
  );
}
