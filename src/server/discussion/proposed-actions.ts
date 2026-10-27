import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ACTION_VALID_MS,
  type ActionError,
  type ActionView,
  type BranchParams,
  parseActionView,
} from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { refPath } from '@/server/connectors/github/client';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { OAuthRefusedError } from '@/server/connectors/oauth';
import { actions } from '@/server/db/schema/actions';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { type LiveDeps, myGithubConnections, openGithub } from './github-live';

// Les actions que Leon propose dans une discussion (0037-actions.sql) : un outil les enregistre sans rien faire,
// l'utilisateur les confirme ou les annule d'un clic, et seule la confirmation les exécute, une fois, avec sa
// propre connexion. La ligne garde la réponse de l'outil : c'est le journal des écritures.

type Row = typeof actions.$inferSelect;
export type TimedAction = ActionView & { createdAt: Date };

const UuidSchema = z.uuid();

function toView(row: Row): TimedAction {
  const expired =
    row.status === 'proposee' && Date.now() - row.createdAt.getTime() >= ACTION_VALID_MS;
  const view = parseActionView({ ...row, status: expired ? 'expiree' : row.status });
  if (!view) throw new Error('Action illisible');
  return { ...view, createdAt: row.createdAt };
}

export async function proposeBranch(
  ctx: TenantContext,
  input: { discussionId: string; connectionId: string; params: BranchParams },
): Promise<TimedAction> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .insert(actions)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        discussionId: input.discussionId,
        connectionId: input.connectionId,
        kind: 'github.creer_branche',
        params: input.params,
        acl: [ctx.userId],
      })
      .returning(),
  );
  return toView(row as Row);
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
  return rows.map(toView);
}

async function readAction(ctx: TenantContext, id: string): Promise<TimedAction | null> {
  const [row] = await withTenant(ctx, (tx) => tx.select().from(actions).where(eq(actions.id, id)));
  return row ? toView(row) : null;
}

// Annuler, ou confirmer et exécuter. Seule une action encore proposée (et pas expirée) change : un second clic,
// ou un clic sur l'action d'un autre (invisible), rend l'action telle qu'elle est, ou null.
export async function decideAction(
  ctx: TenantContext,
  id: string,
  decision: 'confirmer' | 'annuler',
  deps: LiveDeps = {},
): Promise<TimedAction | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  const pending = and(eq(actions.id, id), eq(actions.status, 'proposee'));
  if (decision === 'annuler') {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(actions)
        .set({ status: 'annulee', decidedAt: sql`now()` })
        .where(pending)
        .returning(),
    );
    return row ? toView(row) : readAction(ctx, id);
  }
  // La réservation : une seule confirmation passe, même sur deux onglets ou deux serveurs.
  const [claimed] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: 'en-cours', decidedAt: sql`now()` })
      .where(
        and(
          pending,
          gt(actions.createdAt, sql`now() - make_interval(secs => ${ACTION_VALID_MS / 1000})`),
        ),
      )
      .returning(),
  );
  if (!claimed) return readAction(ctx, id);
  const result = await execute(ctx, claimed, deps);
  const [done] = await withTenant(ctx, (tx) =>
    tx
      .update(actions)
      .set({ status: result.error ? 'echouee' : 'faite', result })
      .where(eq(actions.id, id))
      .returning(),
  );
  return toView(done as Row);
}

type Outcome = { url: string | null; error: ActionError | null };
const failed = (error: ActionError): Outcome => ({ url: null, error });

// Créer la branche avec la connexion de l'auteur, celle de la proposition. Rien du texte de GitHub n'est gardé.
async function execute(ctx: TenantContext, row: Row, deps: LiveDeps): Promise<Outcome> {
  const params = row.params as BranchParams;
  const connection = (await myGithubConnections(ctx)).find((c) => c.id === row.connectionId);
  if (!connection) return failed('connexion');
  try {
    const { github } = await openGithub(ctx, connection, deps);
    try {
      await github.createBranch(params.repo, params.branch, params.sha);
    } catch (error) {
      // 422 : la branche existe. Sur le commit proposé, c'est notre création, reprise par le client après une
      // réponse perdue : elle est faite. Ailleurs, c'est une autre branche du même nom.
      if (!(error instanceof ConnectorHttpError && error.status === 422)) throw error;
      const sha = await github.branchSha(params.repo, params.branch).catch(() => null);
      if (sha !== params.sha) return failed('existe');
    }
    return { url: `https://github.com/${params.repo}/tree/${refPath(params.branch)}`, error: null };
  } catch (error) {
    if (error instanceof OAuthRefusedError) return failed('connexion');
    if (error instanceof ConnectorAuthError)
      return failed(error.status === 403 ? 'droits' : 'connexion');
    if (error instanceof ConnectorHttpError && error.status === 404) return failed('introuvable');
    logError('action.github', error, { action: row.id });
    return failed('echec');
  }
}
