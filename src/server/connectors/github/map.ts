import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Issue, Review, ReviewComment } from './client';

// De la réponse de GitHub à un élément du socle : le corps est le tour `document`, daté de la
// dernière modification ; chaque commentaire, avis ou commentaire de revue garde sa propre date.

export type Discussion = {
  comments: Comment[];
  reviews: Review[];
  reviewComments: ReviewComment[];
};

type Row = { body?: string | null; user?: { login: string } | null };

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

export function toItem(
  repo: string,
  issue: Issue,
  { comments, reviews, reviewComments }: Discussion,
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
  return {
    externalId: `${issue.pull_request ? 'pr' : 'issue'}:${repo}#${issue.number}`,
    nature: 'ticket',
    title: `#${issue.number} ${issue.title}`,
    url: issue.html_url,
    updatedAt: issue.updated_at,
    origin: { repo },
    turns: [turn('body', 'document', issue, issue.updated_at), ...replies].filter(isTurn),
  };
}
