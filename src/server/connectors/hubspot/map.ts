import { htmlToText } from '../normalize';
import type { ConnectorItem } from '../types';
import { emailSender } from './email';
import type { EngagementType, Hit, LinkedKind, Person } from './schemas';

// De la réponse de HubSpot à un élément du socle : une activité (note, appel, réunion, e-mail) est
// un seul tour `document`, daté de sa dernière modification.

type Props = Hit['properties'];
export type EngagementSpec = {
  type: EngagementType;
  prefix: string; // « note » : l'identifiant de l'élément est « note:123 »
  label: string;
  subject: string | null; // propriété qui porte l'objet de l'activité
  properties: string[]; // celles que la recherche demande
  text(props: Props): string;
  sender?(props: Props): Person | null; // l'auteur quand ce n'est pas le propriétaire
};

// Les corps des notes, appels et réunions sont du HTML ; le texte d'un e-mail est du texte brut
// (htmlToText prendrait « <paul@client.test> » pour une balise).
const html = (value: string | null | undefined) => htmlToText(value ?? '').trim();

function meetingText(props: Props): string {
  const notes = html(props.hs_internal_meeting_notes);
  return [html(props.hs_meeting_body), notes && `Notes internes :\n${notes}`]
    .filter(Boolean)
    .join('\n\n');
}

export const ENGAGEMENTS: EngagementSpec[] = [
  {
    type: 'notes',
    prefix: 'note',
    label: 'Note',
    subject: null,
    properties: ['hs_note_body', 'hubspot_owner_id', 'hs_lastmodifieddate'],
    text: (props) => html(props.hs_note_body),
  },
  {
    type: 'calls',
    prefix: 'call',
    label: 'Appel',
    subject: 'hs_call_title',
    properties: ['hs_call_title', 'hs_call_body', 'hubspot_owner_id', 'hs_lastmodifieddate'],
    text: (props) => html(props.hs_call_body),
  },
  {
    type: 'meetings',
    prefix: 'meeting',
    label: 'Réunion',
    subject: 'hs_meeting_title',
    properties: [
      'hs_meeting_title',
      'hs_meeting_body',
      'hs_internal_meeting_notes',
      'hubspot_owner_id',
      'hs_lastmodifieddate',
    ],
    text: meetingText,
  },
  {
    type: 'emails',
    prefix: 'email',
    label: 'E-mail',
    subject: 'hs_email_subject',
    properties: [
      'hs_email_subject',
      'hs_email_text',
      'hs_email_html',
      'hs_email_headers',
      'hubspot_owner_id',
      'hs_lastmodifieddate',
    ],
    text: (props) => props.hs_email_text?.trim() || html(props.hs_email_html),
    sender: emailSender,
  },
];

// L'instant de dernière modification, celui sur lequel la recherche filtre et trie ; à défaut, la
// date de la fiche.
export function modifiedAt(hit: Hit): number {
  const modified = Date.parse(hit.properties.hs_lastmodifieddate ?? '');
  return Number.isNaN(modified) ? Date.parse(hit.updatedAt) : modified;
}

export type Readable = { hit: Hit; text: string };

// Une activité sans texte n'apprend rien : elle n'est pas rendue (mais le curseur la dépasse).
export function readable(spec: EngagementSpec, hits: Hit[]): Readable[] {
  return hits
    .map((hit) => ({ hit, text: spec.text(hit.properties) }))
    .filter((row) => row.text !== '');
}

export type Linked = { kind: LinkedKind; name: string };
const ORIGIN_KEY: Record<LinkedKind, string> = {
  companies: 'company',
  deals: 'deal',
  contacts: 'contact',
};

export function toItem(
  spec: EngagementSpec,
  row: Readable,
  owners: Map<string, Person>,
  linked: Linked | undefined,
): ConnectorItem {
  const { hit, text } = row;
  const updatedAt = new Date(modifiedAt(hit)).toISOString();
  const ownerId = hit.properties.hubspot_owner_id;
  const owner = (ownerId ? owners.get(ownerId) : undefined) ?? { name: null, email: null };
  const subject = spec.subject ? hit.properties[spec.subject]?.trim() : null;
  const parts = [spec.label, subject, linked?.name].filter(Boolean);
  return {
    externalId: `${spec.prefix}:${hit.id}`,
    nature: 'note',
    title: parts.length > 1 ? parts.join(' · ') : `${spec.label} #${hit.id}`,
    url: null, // HubSpot ne documente aucun lien vers une fiche
    updatedAt,
    origin: { type: spec.prefix, ...(linked ? { [ORIGIN_KEY[linked.kind]]: linked.name } : {}) },
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: spec.sender?.(hit.properties) ?? owner,
        text,
        ts: updatedAt,
      },
    ],
  };
}
