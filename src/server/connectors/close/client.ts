import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API de Close et la forme des réponses lues. Seuls les champs utiles sont
// lus, et ceux qui ne sont pas indispensables ne font jamais échouer une réponse : une forme
// inattendue (`.catch`) vaut « champ absent ».

const API = 'https://api.close.com/api/v1';
const ACTIVITIES_PER_PAGE = 100;
// Close ne rend que les champs demandés. Pas de HTML (body_html, note_html) : le texte brut suffit
// et les e-mails pèsent lourd. Les transcriptions ne sont jamais rendues par défaut.
const ACTIVITY_FIELDS = [
  '_type',
  'id',
  'lead_id',
  'date_created',
  'activity_at',
  'user_name',
  'created_by_name',
  'note',
  'subject',
  'body_text',
  'text',
  'direction',
  'sender',
  'status',
  'duration',
  'envelope',
  'recording_transcript',
  'voicemail_transcript',
].join(',');

const text = z.string().nullish().catch(null);

const Utterance = z.object({ speaker_label: text, speaker_side: text, text });
const Transcript = z
  .object({ utterances: z.array(Utterance).nullish(), summary_text: text })
  .nullish()
  .catch(null);
const Envelope = z
  .object({ from: z.array(z.object({ email: text, name: text })).nullish() })
  .nullish()
  .catch(null);

const ActivitySchema = z.object({
  _type: z.string(),
  id: z.string(),
  date_created: z.string(),
  lead_id: text,
  activity_at: text,
  user_name: text,
  created_by_name: text,
  note: text,
  subject: text,
  body_text: text,
  text,
  direction: text,
  sender: text,
  status: text,
  duration: z.number().nullish().catch(null),
  envelope: Envelope,
  recording_transcript: Transcript,
  voicemail_transcript: Transcript,
});
export type Activity = z.infer<typeof ActivitySchema>;
export type Transcript = z.infer<typeof Transcript>;

// À la dernière page, `has_more` vaut false.
const ActivitiesReply = z.object({
  data: z.array(ActivitySchema),
  has_more: z.boolean().nullish(),
});
const MeReply = z.object({
  first_name: text,
  last_name: text,
  email: text,
  organizations: z
    .array(z.object({ name: text }))
    .nullish()
    .catch(null),
});
const LeadReply = z.object({ display_name: text });

export function closeClient(apiKey: string, http: ConnectorHttp) {
  // La clé est le nom d'utilisateur de l'authentification Basic, le mot de passe est vide.
  const headers = { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` };
  const leadNames = new Map<string, Promise<string | null>>(); // le cache d'un passage

  async function fetchLeadName(id: string): Promise<string | null> {
    try {
      const request = { url: `${API}/lead/${encodeURIComponent(id)}/`, headers };
      const reply = await http.json({ ...request, query: { _fields: 'display_name' } }, LeadReply);
      return reply.display_name?.trim() || null;
    } catch (error) {
      // Fiche supprimée, ou non lisible par cette clé : l'activité sort sans nom de fiche.
      if (error instanceof ConnectorHttpError && error.status === 404) return null;
      if (error instanceof ConnectorAuthError && error.status === 403) return null;
      throw error;
    }
  }

  return {
    async me(): Promise<{ name: string; organization: string | null; email: string | null }> {
      const reply = await http.json({ url: `${API}/me/`, headers }, MeReply);
      const name = [reply.first_name, reply.last_name].filter(Boolean).join(' ');
      return {
        name: name || reply.email || 'Close account',
        organization: reply.organizations?.[0]?.name ?? null,
        email: reply.email ?? null,
      };
    },

    // Toutes les activités créées depuis `from` (incluse), de toute nature. Close rend la liste de
    // la plus récente à la plus ancienne et ne documente aucun tri croissant : on la lit en entier,
    // et l'appelant la trie. Sauter ce qu'on a reçu (et non un nombre fixe) suit une page plus courte.
    async activitiesSince(from: Date): Promise<Activity[]> {
      const byId = new Map<string, Activity>();
      for (let skip = 0; ; ) {
        const query = {
          date_created__gte: from.toISOString(),
          _limit: ACTIVITIES_PER_PAGE,
          _skip: skip,
          _fields: ACTIVITY_FIELDS,
        };
        const reply = await http.json({ url: `${API}/activity/`, headers, query }, ActivitiesReply);
        const known = byId.size;
        for (const activity of reply.data) byId.set(activity.id, activity);
        // Une page sans nouveauté : le serveur tourne en rond, on ne boucle pas.
        if (!reply.has_more || byId.size === known) return [...byId.values()];
        skip += reply.data.length;
      }
    },

    // Le nom de la fiche (prospect), cherché une seule fois par passage.
    leadName(id: string): Promise<string | null> {
      const known = leadNames.get(id);
      if (known) return known;
      const pending = fetchLeadName(id);
      leadNames.set(id, pending);
      return pending;
    },
  };
}

export type CloseClient = ReturnType<typeof closeClient>;
