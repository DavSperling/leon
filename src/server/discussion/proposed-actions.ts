import { and, asc, eq, gt, sql } from 'drizzle-orm';
import {
  ACTION_VALID_MS,
  type ActionError,
  type ActionKind,
  type ActionView,
  parseActionView,
} from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { withTenant } from '@/server/db/with-tenant';

// Les actions que Leon propose dans une discussion (0037-actions.sql), côté base seulement : un outil les enregistre
// sans rien faire, l'utilisateur les annule ou les confirme d'un clic, et seule la confirmation les fait exécuter
// (github-actions.ts), une fois, avec sa propre connexion. La ligne garde la réponse de l'outil : c'est le journal
// des écritures.

export type ActionRow = typeof actions.$inferSelect;
export type TimedAction = ActionView & { createdAt: Date };
export type Outcome = { url: string | null; error: ActionError | null };

// Une ligne illisible donne null : elle n'empêche pas d'afficher la discussion.
function toView(row: ActionRow): TimedAction | null {
  const expired =
    row.status === 'proposee' && Date.now() - row.createdAt.getTime() >= ACTION_VALID_MS;
  const view = parseActionView({ ...row, status: expired ? 'expiree' : row.status });
  return view && { ...view, createdAt: row.createdAt };
}

export async function proposeAction(
  ctx: TenantContext,
  input: {
    discussionId: string;
    connectionId: string;
    kind: ActionKind;
    params: Record<string, string>;
  },
): Promise<TimedAction> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .insert(actions)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        discussionId: input.discussionId,
        connectionId: input.connectionId,
        kind: input.kind,
        params: input.params,
        acl: [ctx.userId],
      })
      .returning(),
  );
  const view = toView(row as ActionRow);
  if (!view) throw new Error('Action illisible');
  return view;
}

// Les actions d'une discussion de l'utilisateur, de la plus ancienne à la plus récente.
export async function listDiscussionActions(
  ctx: TenantContext,
  discussionId: string,
): Promise<TimedAction[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(actions)
      .where(eq(actions.discussionId, discussionId))
      .orderBy(asc(actions.createdAt), asc(actions.id)),
  );
  return rows.flatMap((row) => toView(row) ?? []);
}

export async function readAction(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) => tx.select().from(actions).where(eq(actions.id, id)));
  return row ? toView(row) : null;
}

// Seule une action encore proposée change : un clic sur une action décidée ou sur celle d'un autre (invisible)
// ne change rien.
const pending = (id: string) => and(eq(actions.id, id), eq(actions.status, 'proposee'));

export async function cancelAction(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'annulee', decidedAt: sql`now()` })
      .where(pending(id))
      .returning(),
  );
  return row ? toView(row) : readAction(ctx, id);
}

// La réservation : proposee → en-cours, si elle a moins d'une heure. Une seule confirmation la reçoit, même sur
// deux onglets ou deux serveurs ; les autres rendent null.
export async function claimAction(ctx: TenantContext, id: string): Promise<ActionRow | null> {
  const [claimed] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'en-cours', decidedAt: sql`now()` })
      .where(
        and(
          pending(id),
          gt(actions.createdAt, sql`now() - make_interval(secs => ${ACTION_VALID_MS / 1000})`),
        ),
      )
      .returning(),
  );
  return claimed ?? null;
}

// en-cours → faite ou echouee, avec la réponse de l'outil.
export async function finishAction(
  ctx: TenantContext,
  id: string,
  outcome: Outcome,
): Promise<TimedAction | null> {
  const [done] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: outcome.error ? 'echouee' : 'faite', result: outcome })
      .where(and(eq(actions.id, id), eq(actions.status, 'en-cours')))
      .returning(),
  );
  return done ? toView(done) : null;
}
