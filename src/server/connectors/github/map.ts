import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Issue, Pull, Review, ReviewComment } from './client';

// De la réponse de GitHub à un élément du socle : le corps est le tour `document`, daté de la
// dernière modification ; chaque commentaire, avis ou commentaire de revue garde sa propre date.

export type Discussion = {
  comments: Comment[];
  reviews: Review[];
  reviewComments: ReviewComment[];
};

type Row = {
  body?: string | null;
  user?: { login: string } | null;
  author_association?: string | null;
};

// Sur un dépôt public, n'importe qui ouvre un ticket ou commente : seuls le propriétaire, les membres
// de l'organisation et les collaborateurs invités sont de l'équipe. Les autres (contributeur passé,
// première contribution, inconnu) sont extérieurs. Sans le champ, GitHub ne dit rien : pas de côté.
const TEAM_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
function sideOf(association: string | null | undefined): ConnectorTurn['side'] {
  if (!association) return undefined;
  return TEAM_ASSOCIATIONS.has(association) ? 'team' : 'external';
}

// Un tour sans texte n'existe pas (corps nul, avis qui n'est qu'une approbation).
function turn(
  externalId: string,
  role: ConnectorTurn['role'],
  row: Row,
  ts: string,
  intro = '',
): ConnectorTurn | null {
  const text = row.body?.trim();
  if (!text) return null;
  return {
    externalId,
    role,
    author: { name: row.user?.login ?? null, email: null },
    side: sideOf(row.author_association),
    text: intro + text,
    ts,
  };
}

// Un avis en brouillon (sans date d'envoi) n'est visible que de son auteur : jamais repris.
function reviewTurn(review: Review): ConnectorTurn | null {
  if (review.state === 'PENDING' || !review.submitted_at) return null;
  return turn(`review:${review.id}`, 'participant', review, review.submitted_at);
}

function isTurn(value: ConnectorTurn | null): value is ConnectorTurn {
  return value !== null;
}

// Les tickets qu'une PR ferme, d'après les mots-clés de GitHub suivis de #n, dans l'ordre, sans doublon.
// shortcut: les renvois vers un autre dépôt (propriétaire/dépôt#n) et par adresse sont ignorés, à ajouter si on en voit.
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const closedIssues = (body: string | null | undefined): string =>
  [...new Set([...(body ?? '').matchAll(CLOSING)].map((match) => `#${match[1]}`))].join(' ');

// Une valeur d'origine tient en 300 caractères (ce que la lecture garde, filters-sql.ts), coupée sur un séparateur.
const ORIGIN_VALUE_MAX = 300;
function cut(value: string): string {
  if (value.length <= ORIGIN_VALUE_MAX) return value;
  const head = value.slice(0, ORIGIN_VALUE_MAX + 1);
  const at = Math.max(head.lastIndexOf(' '), head.lastIndexOf(','));
  return at > 0 ? head.slice(0, at) : head.slice(0, ORIGIN_VALUE_MAX);
}

// L'état d'un ticket ou d'une PR (T13, section 1.1 de la spec #108), en texte, à côté du dépôt. Il ne va jamais
// dans un tour : chaque transition en créerait un nouveau. `pull` : le détail d'une PR, null s'il n'a pas été lu.
function facts(issue: Issue, pull: Pull | null): Record<string, string> {
  const mergedAt = issue.pull_request?.merged_at;
  const closed = issue.state_reason ? `closed:${issue.state_reason}` : 'closed';
  const etat = issue.state === 'open' ? 'open' : mergedAt ? 'merged' : closed;
  const side = sideOf(issue.author_association);
  const entries: [string, string | null | undefined][] = [
    ['etat', etat],
    ['fini_le', mergedAt ?? (etat === 'closed:completed' ? issue.closed_at : null)],
    ['auteur', issue.user?.login],
    ['cote', side && (side === 'team' ? 'equipe' : 'exterieur')],
    ['assignes', issue.assignees?.map((assignee) => assignee.login).join(',')],
    ['branche', pull?.head.ref],
    ['tete', pull?.head.repo?.full_name],
    ['brouillon', pull?.draft ? 'oui' : null],
    ['ferme', issue.pull_request ? closedIssues(issue.body) : null],
  ];
  return Object.fromEntries(
    entries.flatMap(([key, value]) => (value ? [[key, cut(value)] as const] : [])),
  );
}

export function toItem(
  repo: string,
  issue: Issue,
  { comments, reviews, reviewComments }: Discussion,
  pull: Pull | null = null,
): ConnectorItem {
  const replies = [
    ...comments.map((c) => turn(`comment:${c.id}`, 'participant', c, c.created_at)),
    ...reviews.map(reviewTurn),
    ...reviewComments.map((c) =>
      turn(
        `review-comment:${c.id}`,
        'participant',
        c,
        c.created_at,
        `Commentaire sur ${c.path} :\n`,
      ),
    ),
  ]
    .filter(isTurn)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  // Une PR sans description existe quand même, avec ses faits : son titre lui tient lieu de corps (spec #108, 1.2).
  const body =
    turn('body', 'document', issue, issue.updated_at) ??
    (issue.pull_request
      ? turn('body', 'document', { ...issue, body: issue.title }, issue.updated_at)
      : null);
  return {
    externalId: `${issue.pull_request ? 'pr' : 'issue'}:${repo}#${issue.number}`,
    nature: 'ticket',
    title: `#${issue.number} ${issue.title}`,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    origin: { repo, ...facts(issue, pull) },
    turns: [body, ...replies].filter(isTurn),
  };
}
