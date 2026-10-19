import { eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { epochToDate, sourceInfoFrom } from './filters-sql';
import type { ContextTurn, SourceInfo } from './types';

// Lire une source, ou le passage d'une source dans son contexte : les tours voisins, sous les droits du lecteur.
// Un identifiant invisible, inconnu ou mal écrit donne `null`, sans rien dire de ce qui existe.

const UuidSchema = z.uuid();
export const SOURCE_MAX_CHARS = 20_000;
const WINDOW_MAX = 20;

// L'ordre des tours d'une source : leur date, puis l'ordre d'écriture, puis l'identifiant (un ordre stable).
const TURN_ORDER = sql`t.ts, t.created_at, t.id`;

async function loadSource(tx: Tx, sourceId: string): Promise<SourceInfo | null> {
  const [row] = await tx
    .select({
      id: sources.id,
      kind: sources.kind,
      title: sources.title,
      metadata: sources.metadata,
      lastTurnAt: sources.lastTurnAt,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(eq(sources.id, sourceId));
  if (!row) return null;
  let lastTs = row.lastTurnAt;
  if (!lastTs) {
    const [latest] = await tx
      .select({ ts: max(turns.ts) })
      .from(turns)
      .where(eq(turns.sourceId, sourceId));
    lastTs = latest?.ts ?? row.createdAt;
  }
  return sourceInfoFrom({ ...row, lastTs });
}

type TurnRow = {
  id: string;
  role: TurnRole;
  author_name: string | null;
  epoch: string;
  text: string;
};

function toContextTurn(row: TurnRow, hitTurnId: string | null): ContextTurn {
  return {
    turnId: row.id,
    role: row.role,
    authorName: row.author_name,
    ts: epochToDate(row.epoch),
    text: row.text,
    isHit: row.id === hitTurnId,
  };
}

function clampWindow(value: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), WINDOW_MAX) : 0;
}

// Le tour du passage, marqué, avec `before` tours avant et `after` tours après (2 et 2 par défaut), dans l'ordre
// de la source.
export async function fetchPassageContext(
  ctx: TenantContext,
  passageId: string,
  window: { before: number; after: number } = { before: 2, after: 2 },
): Promise<{ source: SourceInfo; turns: ContextTurn[] } | null> {
  if (!UuidSchema.safeParse(passageId).success) return null;
  const before = clampWindow(window.before);
  const after = clampWindow(window.after);
  return withTenant(ctx, async (tx) => {
    const [hit] = await tx
      .select({ sourceId: passages.sourceId, turnId: passages.turnId })
      .from(passages)
      .where(eq(passages.id, passageId));
    if (!hit) return null;
    const source = await loadSource(tx, hit.sourceId);
    if (!source) return null;
    // Les tours sont numérotés sans leur texte : seule la fenêtre est lue en entier.
    const { rows } = await tx.execute<TurnRow>(sql`
      with ordered as (
        select t.id, row_number() over (order by ${TURN_ORDER}) as n
        from turns t
        where t.tenant_id = ${ctx.tenantId} and t.source_id = ${hit.sourceId}
      ), hit_at as (select n from ordered where id = ${hit.turnId})
      select t.id, t.role, t.author_name, extract(epoch from t.ts) as epoch, t.text
      from ordered o
      join hit_at on o.n between hit_at.n - ${before} and hit_at.n + ${after}
      join turns t on t.id = o.id
      order by o.n`);
    // Le tour du passage n'est pas lisible : le passage ne l'est pas non plus.
    if (rows.length === 0) return null;
    return { source, turns: rows.map((row) => toContextTurn(row, hit.turnId)) };
  });
}

// Les tours de la source dans l'ordre, jusqu'à `maxChars` caractères de texte (20 000 par défaut) : le dernier
// tour lu est coupé à la limite, et `truncated` le dit. Aucun tour n'est marqué.
export async function fetchSource(
  ctx: TenantContext,
  sourceId: string,
  options: { maxChars?: number } = {},
): Promise<{ source: SourceInfo; turns: ContextTurn[]; truncated: boolean } | null> {
  if (!UuidSchema.safeParse(sourceId).success) return null;
  const maxChars = Math.max(0, Math.floor(options.maxChars ?? SOURCE_MAX_CHARS));
  return withTenant(ctx, async (tx) => {
    const source = await loadSource(tx, sourceId);
    if (!source) return null;
    // La base ne rend que les tours qui commencent avant la limite (elle compte des caractères, JavaScript des
    // unités UTF-16, jamais moins) : une source de 5 000 messages n'est pas lue en entier pour en garder 20 000
    // caractères. Le tour qui suit le dernier lu est inclus, pour savoir si la lecture est coupée.
    const { rows } = await tx.execute<TurnRow>(sql`
      select id, role, author_name, extract(epoch from ts) as epoch, text
      from (
        select t.id, t.role, t.author_name, t.ts, t.created_at, t.text,
               sum(char_length(t.text)) over (order by ${TURN_ORDER}) as running
        from turns t
        where t.tenant_id = ${ctx.tenantId} and t.source_id = ${sourceId}
      ) ordered
      where running - char_length(text) <= ${maxChars}
      order by ts, created_at, id`);
    const result: ContextTurn[] = [];
    let left = maxChars;
    let truncated = false;
    for (const row of rows) {
      if (left <= 0) {
        truncated = true;
        break;
      }
      if (row.text.length <= left) {
        result.push(toContextTurn(row, null));
        left -= row.text.length;
        continue;
      }
      result.push(toContextTurn({ ...row, text: cutText(row.text, left) }, null));
      truncated = true;
      break;
    }
    return { source, turns: result, truncated };
  });
}

// Coupe à `max` unités UTF-16 sans séparer les deux moitiés d'un émoji.
function cutText(text: string, max: number): string {
  const high = text.charCodeAt(max - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? max - 1 : max);
}
