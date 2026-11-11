import { and, eq, isNull, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lecons } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { filTitle } from '@/server/sessions/thread-read';
import { FIL, type Fil } from '@/server/sessions/threads';
import { listLessons } from './lessons';
import {
  type Cible,
  type HistoryVersion,
  historiesIn,
  readVersion,
  restoreVersion,
} from './versions';

// La section Mémoire du site (T55 ; D33, D34, D37, C12 et C13 du plan de la mémoire à disposition) : ce que l'auteur
// y lit, et la restauration, qui n'a lieu que là. Tout se lit sous withTenant, avec en plus le filtre de l'auteur : la
// politique equipe_lit (0057) ouvrirait sinon à un manager les fils d'un subordonné. Une version ne se montre que si
// elle est lisible (la règle de versions.ts). Ces lectures sont celles de l'auteur sur le site, pas d'un agent : rien
// n'est noté au journal (D35). Les actions du site (reglages/actions.ts) les appellent sous la session du navigateur.

// Ce que l'historique montre d'une version (C12) : son numéro, sa date, qui l'a écrite et pourquoi.
export type MemoryVersion = HistoryVersion;
export type MemoryThread = {
  id: string;
  titre: string;
  projet: string | null;
  // Fusionné dans un autre fil (D21) : il reste, masqué ailleurs, avec ses versions.
  absorbe: boolean;
  // Le numéro de sa dernière version, lisible ou non (0 sans version) : celui que « Remettre » attend (D34).
  n: number;
  versions: MemoryVersion[];
};
export type MemoryLesson = {
  id: string;
  projet: string | null;
  // Le texte et le numéro de sa dernière version, celle qu'une correction attend (D34).
  texte: string;
  n: number;
  accepteeLe: Date;
  versions: MemoryVersion[];
};
// Une cible de l'historique : un fil de l'auteur, ou une de ses leçons non retirées.
export type MemoryTarget = { cible: 'fil' | 'lecon'; id: string };

// Les fils de l'auteur, tous dépôts confondus, absorbés compris, du plus récent au plus ancien, avec leur historique
// lu d'un coup.
// shortcut: tous les fils, sans pagination ; à paginer si un auteur en a des centaines.
export async function listMemoryThreads(ctx: TenantContext): Promise<MemoryThread[]> {
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<Fil>(sql`
      select s.id, s.metadata from sources s
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
      order by s.created_at desc, s.id`);
    const histories = await historiesIn(tx, ctx, { sourceIds: rows.map((fil) => fil.id) });
    return rows.map((fil) => {
      const projet = fil.metadata.project;
      const history = histories.get(fil.id);
      return {
        id: fil.id,
        titre: filTitle(fil),
        projet: typeof projet === 'string' ? projet : null,
        absorbe: fil.metadata.absorbe_par != null,
        n: history?.n ?? 0,
        versions: history?.versions ?? [],
      };
    });
  });
}

// Les leçons non retirées de l'auteur, tous dépôts confondus, dans l'ordre de D37, avec leurs versions lisibles.
export async function listMemoryLessons(ctx: TenantContext): Promise<MemoryLesson[]> {
  const lessons = await listLessons(ctx);
  const histories = await withTenant(ctx, (tx) =>
    historiesIn(tx, ctx, { leconIds: lessons.map((lesson) => lesson.id) }),
  );
  return lessons.map((lesson) => ({
    id: lesson.id,
    projet: lesson.projet,
    texte: lesson.texte,
    n: lesson.n,
    accepteeLe: lesson.accepteeLe,
    versions: histories.get(lesson.id)?.versions ?? [],
  }));
}

// Les dépôts des fils de l'auteur, une fois chacun : le choix du dépôt d'une leçon (ou « tous mes dépôts »).
export async function listMemoryRepos(ctx: TenantContext): Promise<string[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ projet: string }>(sql`
      select distinct s.metadata->>'project' as projet from sources s
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
        and s.metadata->>'project' is not null
      order by 1`),
  );
  return rows.map((row) => row.projet);
}

// La cible si elle est à l'auteur : un fil (jamais une note, que T57 restaure par writeNote), ou une leçon non retirée.
// Sinon null : celle d'un collègue est introuvable.
async function targetOf(ctx: TenantContext, target: MemoryTarget): Promise<Cible | null> {
  return withTenant(ctx, async (tx) => {
    if (target.cible === 'lecon') {
      const [lesson] = await tx
        .select({ id: lecons.id })
        .from(lecons)
        .where(
          and(
            eq(lecons.tenantId, ctx.tenantId),
            eq(lecons.id, target.id),
            eq(lecons.ownerUserId, ctx.userId),
            isNull(lecons.retireeLe),
          ),
        );
      return lesson ? { leconId: lesson.id } : null;
    }
    const { rows } = await tx.execute<{ id: string }>(sql`
      select s.id from sources s
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
        and s.id = ${target.id}`);
    return rows[0]?.id ?? null;
  });
}

// Le texte d'une version, si elle est lisible ; sinon null, jamais une autre à sa place (D33).
export async function readMemoryVersion(
  ctx: TenantContext,
  input: MemoryTarget & { n: number },
): Promise<(MemoryVersion & { texte: string }) | null> {
  const cible = await targetOf(ctx, input);
  const version = cible === null ? null : await readVersion(ctx, cible, input.n);
  if (!version) return null;
  const { n, texte, creeLe, ecritPar, motif } = version;
  return { n, texte, creeLe, ecritPar, motif };
}

// « Remettre cette version » (D33, C12) : v(depuis+1), écrite par l'humain, avec le texte et les entrées de la version
// n, si elle est lisible et que la dernière est encore `depuis` (compare-and-set, D34). Rien n'est effacé. Sinon
// « depassee » (modifiée entre-temps) ou « introuvable ».
export async function restoreMemoryVersion(
  ctx: TenantContext,
  input: MemoryTarget & { n: number; depuis: number },
): Promise<{ n: number } | 'depassee' | 'introuvable'> {
  const cible = await targetOf(ctx, input);
  if (cible === null) return 'introuvable';
  const restored = await restoreVersion(ctx, {
    ...(typeof cible === 'string' ? { sourceId: cible } : cible),
    n: input.n,
    depuis: input.depuis,
  });
  if (typeof restored === 'object' || restored === 'depassee') return restored;
  // « gardee » ne vaut que pour la liste du serveur ; « illisible » : la version n'est pas à montrer.
  return 'introuvable';
}
