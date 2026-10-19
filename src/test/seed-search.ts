import { randomUUID } from 'node:crypto';
import type { SourceKind, TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import type { PipelineJob } from '@/server/pipeline/queue';
import { adminDb } from './db';

// Fixtures de l'indexation : insertion par le rôle propriétaire, hors sécurité par ligne. Chaque appel crée
// sa source, ses tours et son run (ids aléatoires) : la base de test est partagée.

export type SeedTurn = {
  text: string;
  ts?: Date;
  role?: TurnRole;
  authorName?: string;
  authorEmail?: string;
};

export type SeededRun = {
  job: PipelineJob;
  sourceId: string;
  turnIds: string[];
};

// Une source, ses tours (un seul par défaut) et un run d'indexation qui les nomme. `acl` vaut celle de la
// source, des tours et du run ; `updatedAt` date le dernier changement d'état du run.
export async function seedRun(
  owner: TenantContext,
  input: {
    turns?: SeedTurn[];
    kind?: SourceKind;
    acl?: string[];
    status?: 'queued' | 'running' | 'done' | 'failed';
    updatedAt?: Date;
    title?: string | null;
    // nature, url, origin… comme les écrit l'ingestion des connecteurs (connectors/ingest-items.ts).
    metadata?: Record<string, unknown>;
    lastTurnAt?: Date;
  },
): Promise<SeededRun> {
  const acl = input.acl ?? [owner.userId];
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId: owner.tenantId,
      kind: input.kind ?? 'claude_code',
      externalId: randomUUID(),
      ownerUserId: owner.userId,
      title: input.title === undefined ? 'Source de test' : input.title,
      acl,
      metadata: input.metadata ?? {},
      lastTurnAt: input.lastTurnAt ?? null,
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source de test non créée');
  const now = new Date();
  const seeded = input.turns ?? [{ text: 'Tour de test.' }];
  const rows = await adminDb
    .insert(turns)
    .values(
      seeded.map((turn, index) => ({
        tenantId: owner.tenantId,
        sourceId: source.id,
        externalId: `tour-${index}`,
        role: turn.role ?? 'user',
        text: turn.text,
        ts: turn.ts ?? now,
        captureMode: 'connector' as const,
        authorName: turn.authorName ?? null,
        authorEmail: turn.authorEmail ?? null,
        acl,
      })),
    )
    .returning({ id: turns.id, externalId: turns.externalId });
  const turnIds = rows
    .toSorted((a, b) => Number(a.externalId.slice(5)) - Number(b.externalId.slice(5)))
    .map((row) => row.id);
  const updatedAt = input.updatedAt ?? now;
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId: owner.tenantId,
      sourceId: source.id,
      turnIds,
      status: input.status ?? 'queued',
      acl,
      createdAt: updatedAt,
      updatedAt,
    })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  return {
    job: { ingestRunId: run.id, tenantId: owner.tenantId, userId: owner.userId },
    sourceId: source.id,
    turnIds,
  };
}

// `count` passages sans vecteur, tous d'une même source et d'un même tour, dont le texte contient `token`
// (un fournisseur de test qui ne répond qu'à ce jeton ne touche que ces passages).
export async function seedPassages(
  owner: TenantContext,
  input: { count: number; token: string; acl?: string[] },
): Promise<{ sourceId: string; passageIds: string[] }> {
  const acl = input.acl ?? [owner.userId];
  const { sourceId, turnIds } = await seedRun(owner, {
    acl,
    status: 'done',
    turns: [{ text: `Tour ${input.token}` }],
  });
  const turnId = turnIds[0] as string;
  const rows = await adminDb
    .insert(passages)
    .values(
      Array.from({ length: input.count }, (_, ord) => {
        const text = `Passage ${ord} ${input.token}`;
        return {
          tenantId: owner.tenantId,
          sourceId,
          turnId,
          ord,
          text,
          charStart: 0,
          charEnd: text.length,
          ts: new Date(),
          acl,
        };
      }),
    )
    .returning({ id: passages.id });
  return { sourceId, passageIds: rows.map((row) => row.id) };
}
