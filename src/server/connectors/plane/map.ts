import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Member, Project, WorkItem } from './client';

// De la réponse de Plane à un élément du socle : la description est le tour `document`, datée de
// la dernière modification ; chaque commentaire garde sa propre date.

type Author = ConnectorTurn['author'];
type Person = { display_name?: string | null; email?: string | null } | null | undefined;

const NOBODY: Author = { name: null, email: null };

const authorOf = (person: Person): Author =>
  person
    ? { name: person.display_name?.trim() || null, email: person.email?.trim() || null }
    : NOBODY;

export function peopleById(members: Member[]): Map<string, Author> {
  return new Map(members.map((member) => [member.member_id, authorOf(member.member)]));
}

// L'éditeur de Plane range le texte d'un élément de liste dans un paragraphe (« <li><p>…</p></li> ») :
// tel quel, `htmlToText` écrit « - », une ligne vide, puis le texte.
const unwrapListParagraphs = (html: string): string =>
  html.replace(/<li\b[^>]*>\s*<p\b[^>]*>/gi, '<li>').replace(/<\/p>\s*<\/li>/gi, '</li>');

const textOf = (html: string | null | undefined): string =>
  htmlToText(unwrapListParagraphs(html ?? ''));

// Les commentaires masqués (spam, abus) ne sont pas repris. Un commentaire sans texte non plus.
function commentTurns(comments: Comment[]): ConnectorTurn[] {
  const byDate = (a: Comment, b: Comment) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
  return comments
    .filter((comment) => !comment.hidden_at)
    .sort(byDate)
    .flatMap((comment) => {
      const text = comment.comment_html
        ? textOf(comment.comment_html)
        : (comment.comment_stripped?.trim() ?? '');
      if (text === '') return [];
      const turn: ConnectorTurn = {
        externalId: `comment:${comment.id}`,
        role: 'participant',
        author: authorOf(comment.actor),
        text,
        ts: comment.created_at,
      };
      return [turn];
    });
}

type Input = {
  workspace: string;
  project: Project;
  row: WorkItem;
  comments: Comment[];
  people: Map<string, Author>;
};

// Un élément sans description ni commentaire n'est pas rendu : son titre seul n'apprend rien.
export function toItem({ workspace, project, row, comments, people }: Input): ConnectorItem | null {
  const key = `${project.identifier}-${row.sequence_id}`;
  const turns: ConnectorTurn[] = [];
  const description = textOf(row.description_html);
  if (description !== '') {
    const creator = row.created_by_id ?? row.updated_by_id;
    turns.push({
      externalId: 'body',
      role: 'document',
      author: (creator ? people.get(creator) : undefined) ?? NOBODY,
      text: description,
      ts: row.updated_at,
    });
  }
  turns.push(...commentTurns(comments));
  if (turns.length === 0) return null;
  return {
    externalId: `work-item:${row.id}`,
    nature: 'ticket',
    title: `${key} ${row.name}`,
    url: `https://app.plane.so/${workspace}/browse/${key}`,
    updatedAt: row.updated_at,
    origin: { workspace, project: project.name },
    turns,
  };
}
