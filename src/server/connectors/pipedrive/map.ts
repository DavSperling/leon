import { htmlToText } from '../normalize';
import type { ConnectorItem } from '../types';
import type { Activity, Note, Person } from './schemas';

// De la réponse de Pipedrive à un élément du socle. Une note ou une activité est un seul tour
// `document`, daté de la dernière modification : le texte décrit l'état à cette date. Sans texte (ou
// supprimée), elle n'est pas rendue : le repère de lecture avance quand même (stream.ts).

const NO_PERSON: Person = { name: null, email: null };

// Les types fournis avec tout compte Pipedrive ; un type créé par l'entreprise garde sa clé.
const TYPE_LABELS: Record<string, string> = {
  call: 'Appel',
  meeting: 'Réunion',
  task: 'Tâche',
  deadline: 'Échéance',
  email: 'E-mail',
  lunch: 'Déjeuner',
};

type Links = { dealId?: number | null; personId?: number | null; orgId?: number | null };

// Le lien vers la fiche : l'affaire, sinon la personne, sinon l'organisation. Une note ou une
// activité n'a pas de page à elle dans Pipedrive.
function pageUrl(company: string, { dealId, personId, orgId }: Links): string | null {
  const base = `https://${company}.pipedrive.com`;
  if (dealId) return `${base}/deal/${dealId}`;
  if (personId) return `${base}/person/${personId}`;
  if (orgId) return `${base}/organization/${orgId}`;
  return null;
}

function compact(entries: Array<[string, string | number | null | undefined]>) {
  const kept = entries.filter((entry): entry is [string, string | number] => Boolean(entry[1]));
  return Object.fromEntries(kept.map(([name, value]) => [name, String(value)]));
}

export function noteToItem(company: string, note: Note): ConnectorItem | null {
  const text = htmlToText(note.content ?? '');
  if (note.active_flag === false || text === '') return null;
  const deal = note.deal?.title;
  const person = note.person?.name;
  const organization = note.organization?.name;
  const target = deal || person || organization;
  return {
    externalId: `note:${note.id}`,
    nature: 'note',
    title: target ? `Note · ${target}` : 'Note',
    url: pageUrl(company, { dealId: note.deal_id, personId: note.person_id, orgId: note.org_id }),
    updatedAt: note.at,
    origin: compact([
      ['company', company],
      ['deal', deal],
      ['person', person],
      ['organization', organization],
    ]),
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: { name: note.user?.name || null, email: note.user?.email || null },
        text,
        ts: note.at,
      },
    ],
  };
}

// « Appel : Rappel devis (fait, échéance 2026-10-06) », puis la description publique, puis la note.
function activityText(activity: Activity, label: string): string | null {
  const description = htmlToText(activity.public_description ?? '');
  const note = htmlToText(activity.note ?? '');
  if (description === '' && note === '') return null;
  const state = [activity.done ? 'fait' : 'à faire'];
  if (activity.due_date) state.push(`échéance ${activity.due_date}`);
  const subject = activity.subject ? `${label} : ${activity.subject}` : label;
  return [`${subject} (${state.join(', ')})`, description, note].filter(Boolean).join('\n\n');
}

// `people` n'est appelée que pour une activité rendue : la liste des utilisateurs n'est lue qu'au
// premier besoin.
export async function activityToItem(
  company: string,
  activity: Activity,
  people: () => Promise<Map<number, Person>>,
): Promise<ConnectorItem | null> {
  const label = TYPE_LABELS[activity.type ?? ''] ?? activity.type ?? 'Activité';
  const text = activityText(activity, label);
  if (activity.is_deleted || text === null) return null;
  const authorId = activity.creator_user_id ?? activity.owner_id;
  const author = authorId == null ? NO_PERSON : ((await people()).get(authorId) ?? NO_PERSON);
  const links = { dealId: activity.deal_id, personId: activity.person_id, orgId: activity.org_id };
  return {
    externalId: `activity:${activity.id}`,
    nature: 'note',
    title: activity.subject ? `${label} · ${activity.subject}` : label,
    url: pageUrl(company, links),
    updatedAt: activity.at,
    origin: compact([
      ['company', company],
      ['dealId', activity.deal_id],
      ['personId', activity.person_id],
      ['organizationId', activity.org_id],
    ]),
    turns: [{ externalId: 'body', role: 'document', author, text, ts: activity.at }],
  };
}
