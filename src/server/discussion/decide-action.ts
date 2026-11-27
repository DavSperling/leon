import { z } from 'zod';
import { actionTool } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { executeGithubAction } from './github-actions';
import type { LiveDeps } from './github-live';
import {
  cancelAction,
  claimAction,
  finishAction,
  readAction,
  type TimedAction,
} from './proposed-actions';
import { executeTicketAction } from './ticket-actions';

// Le clic sur une action proposée, quel que soit l'outil où elle écrit : GitHub (github-actions.ts), ou Linear, Trello
// et Notion (ticket-actions.ts).

const UuidSchema = z.uuid();

// Annuler, ou confirmer et exécuter. Seule une action encore proposée (et pas expirée) change : un second clic,
// ou un clic sur l'action d'un autre (invisible), rend l'action telle qu'elle est, ou null.
export async function decideAction(
  ctx: TenantContext,
  id: string,
  decision: 'confirmer' | 'annuler',
  deps: LiveDeps = {},
): Promise<TimedAction | null> {
  if (!UuidSchema.safeParse(id).success) return null;
  if (decision === 'annuler') return cancelAction(ctx, id);
  if (decision !== 'confirmer') return null;
  const claimed = await claimAction(ctx, id);
  if (!claimed) return readAction(ctx, id);
  const execute = actionTool(claimed.kind) === 'github' ? executeGithubAction : executeTicketAction;
  return finishAction(ctx, id, await execute(ctx, claimed, deps));
}
