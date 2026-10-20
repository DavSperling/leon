import type { ConnectorItem } from '../types';
import type { Activity } from './client';
import { directionOf, textOf } from './text';

// De l'activité de Close à un élément du socle : un élément et un tour par activité, daté du
// moment où elle a eu lieu (`activity_at`, par exemple l'envoi d'un e-mail synchronisé plus tard).

type Kind = {
  label: string;
  nature: 'note' | 'fil';
  role: 'document' | 'participant';
  hasStatus: boolean; // un e-mail ou un SMS peut ne pas être parti
};

// Les seules activités lues. Les autres (création de fiche, changement de statut, tâche,
// réunion…) n'apportent pas de texte à retenir.
const KINDS = new Map<string, Kind>([
  ['Note', { label: 'Note', nature: 'note', role: 'document', hasStatus: false }],
  ['Call', { label: 'Appel', nature: 'note', role: 'document', hasStatus: false }],
  ['Email', { label: 'E-mail', nature: 'fil', role: 'participant', hasStatus: true }],
  ['SMS', { label: 'SMS', nature: 'fil', role: 'participant', hasStatus: true }],
  ['WhatsAppMessage', { label: 'WhatsApp', nature: 'fil', role: 'participant', hasStatus: false }],
]);

// Un brouillon, un envoi programmé ou en échec reste privé ou n'est pas parti : il n'est pas lu.
const NOT_SENT = new Set(['draft', 'scheduled', 'outbox', 'error']);

const DEFAULT_TITLE = 'Prospect Close';
const WITH_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

export const isReadType = (type: string) => KINDS.has(type);

// Une date sans fuseau serait lue dans celui du serveur : on la refuse.
export function dateOf(value: string | null | undefined): Date | null {
  if (!value || !WITH_ZONE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Reçu, l'e-mail est signé par son expéditeur ; envoyé, par l'utilisateur de Close. Un SMS ou un
// message WhatsApp reçu vient du prospect, dont Close ne donne pas le nom ici.
function authorOf(activity: Activity): { name: string | null; email: string | null } {
  const from = activity.envelope?.from?.[0];
  const user = activity.user_name?.trim() || activity.created_by_name?.trim() || null;
  const received = directionOf(activity) === 'received';
  if (activity._type === 'Email') {
    const sender = activity.sender?.trim() || null;
    return received
      ? { name: from?.name?.trim() || null, email: from?.email?.trim() || sender }
      : {
          name: user ?? (from?.name?.trim() || null),
          email: sender ?? (from?.email?.trim() || null),
        };
  }
  return { name: received ? null : user, email: null };
}

export async function toItem(
  activity: Activity,
  leadName: (id: string) => Promise<string | null>,
): Promise<ConnectorItem | null> {
  const kind = KINDS.get(activity._type);
  const occurredAt = dateOf(activity.activity_at) ?? dateOf(activity.date_created);
  if (!kind || !occurredAt) return null;
  if (kind.hasStatus && activity.status && NOT_SENT.has(activity.status)) return null;
  const text = textOf(activity);
  if (!text) return null;
  const name = activity.lead_id ? await leadName(activity.lead_id) : null;
  const iso = occurredAt.toISOString();
  return {
    externalId: `activity:${activity.id}`,
    nature: kind.nature,
    title: name ?? DEFAULT_TITLE,
    // Close n'a pas de lien vers une activité : la fiche du prospect.
    url: activity.lead_id
      ? `https://app.close.com/lead/${encodeURIComponent(activity.lead_id)}/`
      : null,
    updatedAt: iso,
    origin: { ...(name ? { lead: name } : {}), type: kind.label },
    turns: [{ externalId: 'body', role: kind.role, author: authorOf(activity), text, ts: iso }],
  };
}
