import { type CoulisseBloc, type CoulissesRequest, TEXTE_MAX } from '@/capture/api-contract';
import { prepareTurnText } from '@/capture/prepare-turn-text';
import { factText, recheckCommand, reduceToolName } from '@/capture/session-facts';
import { stripLeonBlocks } from '@/capture/strip-leon-blocks';
import { BACKSTAGE_ROLES } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import {
  createIngestRun,
  enqueueIndexing,
  insertNewTurns,
  type TurnRow,
  upsertSource,
} from './ingest-turns';
import { isWithdrawn } from './record-facts';

// Les outils dont la cible est un chemin du dépôt (C10 amendé le 12/11) : le fichier, ou le `path` de la recherche.
const PATH_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'LS',
]);
// Un chemin absolu (Unix, le dossier personnel) ou une URL (`schéma:`, qui couvre aussi la lettre de lecteur `C:`)
// sort du dépôt ; un saut de ligne casserait la ligne du tour.
const OUTSIDE_REPO = /^(?:[\\/~]|[A-Za-z][A-Za-z0-9+.-]*:)|[\r\n]/;

// La seconde barrière, après la CLI : une cible n'est gardée que pour Bash (la commande réduite, sinon [commande]) et
// pour un chemin relatif au dépôt. Pour tout autre outil, elle est retirée : une CLI ancienne ou modifiée ne fait
// jamais ranger une URL, un motif ou une requête. Puis le masque et la borne.
function recheckTarget(outil: string, cible: string | undefined): string | null {
  if (cible === undefined || cible === '') return null;
  if (outil === 'Bash') return recheckCommand(cible);
  if (!PATH_TOOLS.has(outil) || OUTSIDE_REPO.test(cible) || cible.split(/[\\/]/).includes('..'))
    return null;
  return factText(cible, TEXTE_MAX) || null;
}

// Le texte du tour, toujours écrit par le serveur : null quand rien ne reste à garder. La ligne d'un appel est masquée
// en entier : reduceToolName ne masque rien, et un nom d'outil peut avoir la forme d'une clé (C10).
function blocText(bloc: CoulisseBloc): string | null {
  if (bloc.role === 'appel_outil') {
    const outil = reduceToolName(bloc.outil);
    const cible = recheckTarget(outil, bloc.cible);
    return factText([outil, cible, bloc.statut].filter((part) => part !== null).join(' · '));
  }
  const text = prepareTurnText(stripLeonBlocks(bloc.texte));
  if (text === null) return null;
  return bloc.role === 'sous_agent' ? `[${bloc.partie}]\n${text}` : text;
}

// Un compteur par rôle, relevé par le lot 11 : les blocs et les octets reçus, sans texte ni identifiant de session.
function countReceived(blocs: CoulisseBloc[]): void {
  for (const role of BACKSTAGE_ROLES) {
    const received = blocs.filter((bloc) => bloc.role === role);
    if (received.length === 0) continue;
    const octets = received.reduce((sum, bloc) => sum + Buffer.byteLength(JSON.stringify(bloc)), 0);
    console.info('[leon]', `coulisses.${role}`, { blocs: received.length, octets });
  }
}

// Les coulisses d'une session (C10 amendé le 12/11) : un tour par bloc, dans la session du porteur (créée si elle manque,
// jamais celle d'un collègue : upsertSource filtre sur le propriétaire), sous son ACL. L'envoi répété est idempotent :
// le premier tour écrit d'un `id` gagne, statut compris (insertNewTurns). `last_turn_at` ne bouge pas : une coulisse
// n'est pas un tour de la conversation, et ne doit pas relancer ce qui suit sa fin. Après un retrait sans accord
// postérieur, rien n'est écrit : 'retire', que la route rend en 403. L'indexation part une fois l'écriture validée.
export async function recordBackstage(
  ctx: TenantContext,
  payload: CoulissesRequest,
  tokenId: string,
): Promise<'retire' | 'ecrit'> {
  const result = await withTenant(ctx, async (tx) => {
    if (await isWithdrawn(tx, ctx, tokenId, payload)) return 'retire' as const;
    const sourceId = await upsertSource(
      tx,
      ctx,
      { kind: payload.kind, external_id: payload.external_id },
      undefined,
    );
    const rows = payload.blocs.flatMap((bloc): TurnRow[] => {
      const text = blocText(bloc);
      if (text === null) return [];
      return [
        {
          tenantId: ctx.tenantId,
          sourceId,
          externalId: `coulisse:${bloc.id}`,
          role: bloc.role,
          text,
          ts: new Date(bloc.ts),
          captureMode: 'file',
          injecte: null,
          acl: [ctx.userId],
        },
      ];
    });
    const { ids } = await insertNewTurns(tx, rows);
    return ids.length === 0 ? null : createIngestRun(tx, ctx, sourceId, ids, [ctx.userId]);
  });
  if (result === 'retire') return result;
  if (result !== null) await enqueueIndexing(ctx, result);
  countReceived(payload.blocs);
  return 'ecrit';
}
