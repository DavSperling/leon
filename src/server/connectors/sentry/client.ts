import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API de Sentry et la forme des réponses lues (seulement les champs utiles :
// ni la trace de pile, ni les données d'événement, que zod laisse tomber).

const LIST_LIMIT = 100; // le maximum de Sentry pour la liste des problèmes
const IsoDate = z.iso.datetime({ offset: true });

export type Access = { token: string; organization: string; region: string };

const OrganizationSchema = z.object({ name: z.string(), slug: z.string() });

export const IssueSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string(),
  culprit: z.string().nullish(),
  permalink: z.string().nullish(),
  level: z.string().nullish(),
  status: z.string().nullish(),
  count: z.union([z.string(), z.number()]).nullish(), // une chaîne chez Sentry : « "42" »
  userCount: z.number().nullish(),
  firstSeen: IsoDate.nullish().catch(null),
  lastSeen: IsoDate,
  numComments: z.number().nullish(),
  assignedTo: z.object({ name: z.string().nullish() }).nullish().catch(null),
  project: z.object({ slug: z.string(), name: z.string().nullish() }),
});
export type Issue = z.infer<typeof IssueSchema>;

// L'historique d'un problème mêle toutes sortes d'activités ; seules les notes sont lues.
const ActivitySchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string(),
  dateCreated: IsoDate.nullish().catch(null),
  user: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish().catch(null),
  data: z.unknown(),
});
const DetailSchema = z.object({ activity: z.array(ActivitySchema).nullish() });
const NoteDataSchema = z.object({ text: z.string() });

export type Note = {
  id: string;
  text: string;
  at: string;
  author: { name: string | null; email: string | null };
};

export function sentryClient({ token, organization, region }: Access, http: ConnectorHttp) {
  const headers = { authorization: `Bearer ${token}` };
  const base = `https://${region}/api/0/organizations/${encodeURIComponent(organization)}`;

  return {
    organization: () => http.json({ url: `${base}/`, headers }, OrganizationSchema),

    // Une lecture de la liste, pour s'assurer que le jeton a la portée event:read.
    async checkIssues(): Promise<void> {
      await http.json(
        { url: `${base}/issues/`, headers, query: { query: 'lastSeen:-1m', limit: 1 } },
        z.array(z.unknown()),
      );
    },

    // Les problèmes vus dans les dernières `minutes`, tous statuts (une requête non vide écarte le
    // filtre « non résolus » par défaut), du plus récent au plus ancien : Sentry ne sait pas trier
    // dans l'autre sens. La page suivante se redemande par son seul `cursor`, à l'hôte configuré.
    async *issues(minutes: number): AsyncGenerator<Issue[]> {
      let cursor: string | undefined;
      do {
        const query = {
          query: `lastSeen:-${minutes}m`,
          sort: 'date',
          limit: LIST_LIMIT,
          collapse: 'stats',
          cursor,
        };
        const { data, nextUrl } = await http.page(
          { url: `${base}/issues/`, headers, query },
          z.array(IssueSchema),
        );
        yield data;
        cursor = (nextUrl && new URL(nextUrl).searchParams.get('cursor')) || undefined;
      } while (cursor);
    },

    // Les 100 dernières activités du problème, dont ses notes (Sentry ne publie pas de liste de commentaires).
    async notes(issueId: string): Promise<Note[]> {
      const detail = await http.json(
        { url: `${base}/issues/${encodeURIComponent(issueId)}/`, headers },
        DetailSchema,
      );
      const notes: Note[] = [];
      for (const activity of detail.activity ?? []) {
        const data = NoteDataSchema.safeParse(activity.data);
        if (activity.type !== 'note' || !data.success || !activity.dateCreated) continue;
        notes.push({
          id: String(activity.id),
          text: data.data.text,
          at: activity.dateCreated,
          author: { name: activity.user?.name ?? null, email: activity.user?.email ?? null },
        });
      }
      return notes;
    },
  };
}

export type SentryClient = ReturnType<typeof sentryClient>;
