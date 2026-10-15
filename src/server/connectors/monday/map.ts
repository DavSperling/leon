import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { MondayItem, MondayUser } from './queries';

// Conversion des réponses de monday.com en éléments. Les mises à jour et leurs réponses sont du
// HTML ; les colonnes ont déjà un texte lisible (`text`).

// Les colonnes qui ne disent rien de l'élément : son nom (déjà le titre), les dates automatiques
// (elles changent à chaque modification et le corps serait alors refait pour rien), les fichiers,
// les boutons, les sous-éléments et le numéro. Les noms de types sont ceux de l'énumération
// ColumnType de l'API.
const SKIPPED_COLUMNS = new Set([
  'name',
  'last_updated',
  'creation_log',
  'file',
  'button',
  'subtasks',
  'item_id',
]);

// Une date lue dans le fuseau du serveur serait fausse sans qu'on le voie : sans fuseau, elle est
// refusée. L'outil écrit « …Z » ou « +00:00 » ; « 2026-10-10 14:00:00 UTC » est aussi converti.
const WITH_ZONE = /(Z|UTC|GMT|[+-]\d{2}:?\d{2})$/i;

export function toIso(value: string | null): string | null {
  if (value === null || !WITH_ZONE.test(value.trim())) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const author = (user: MondayUser): ConnectorTurn['author'] => ({
  name: user?.name ?? null,
  email: user?.email ?? null,
});

type Comment = { id: string; body: string; created_at: string | null; creator: MondayUser };

function commentTurn(kind: 'update' | 'reply', comment: Comment): ConnectorTurn | null {
  const text = htmlToText(comment.body);
  const ts = toIso(comment.created_at);
  if (text === '' || ts === null) return null;
  return {
    externalId: `${kind}:${comment.id}`,
    role: 'participant',
    author: author(comment.creator),
    text,
    ts,
  };
}

// Le nom, puis « Statut : En cours », « Échéance : 2026-11-30 »… pour les colonnes remplies.
// Sans aucune colonne remplie, le nom seul n'apprend rien : pas de corps.
function bodyText(item: MondayItem): string | null {
  const lines = item.column_values
    .filter((value) => !SKIPPED_COLUMNS.has(value.type) && value.text?.trim())
    .map((value) => `${value.column.title} : ${value.text?.trim()}`);
  return lines.length > 0 ? [item.name, ...lines].join('\n') : null;
}

const byDate = (a: ConnectorTurn, b: ConnectorTurn) => Date.parse(a.ts) - Date.parse(b.ts);

// Un élément sans date lisible, ou sans rien à lire, n'est pas rendu.
export function itemToConnectorItem(item: MondayItem): ConnectorItem | null {
  const updatedAt = toIso(item.updated_at ?? item.created_at);
  if (updatedAt === null) return null;
  const comments = item.updates
    .flatMap((update) => [
      commentTurn('update', update),
      ...update.replies.map((reply) => commentTurn('reply', reply)),
    ])
    .filter((turn): turn is ConnectorTurn => turn !== null)
    .sort(byDate);
  const text = bodyText(item);
  // Le corps vaut à la date de la dernière modification de l'élément.
  const body: ConnectorTurn[] = text
    ? [{ externalId: 'body', role: 'document', author: author(item.creator), text, ts: updatedAt }]
    : [];
  const turns = [...body, ...comments];
  if (turns.length === 0) return null;
  const { board, group } = item;
  return {
    externalId: `item:${item.id}`,
    nature: 'ticket',
    title: item.name,
    url: item.url,
    updatedAt,
    origin: {
      ...(board?.workspace ? { workspace: board.workspace.name } : {}),
      ...(board ? { board: board.name } : {}),
      ...(group ? { group: group.title } : {}),
    },
    turns,
  };
}
