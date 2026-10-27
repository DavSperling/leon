import { z } from 'zod';
import { type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API publique de Leexi et la forme des réponses (seulement les champs lus).

export const HOST = 'public-api.leexi.ai';
const CALLS_URL = `https://${HOST}/v1/calls`;

// Pas plus de 25 appels par requête : la transcription de chacun est dans la réponse, qui est
// limitée à 10 Mo. Le client commun ne reçoit ainsi jamais une page trop lourde.
const PAGE_SIZE = 25;

export type Credentials = { keyId: string; keySecret: string };

// Dates de la doc (« 2024-06-13T11:00:33.534Z »), avec fuseau explicite.
const DateTime = z.iso.datetime({ offset: true });
// La doc type les champs en texte, mais ses exemples en montrent à null : tout est facultatif.
const text = z.string().nullish();
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);

const PersonSchema = z.object({ name: text, email: text });
const SpeakerSchema = z.object({ name: text, email_address: text });
const PromptSchema = z.object({ category: text, completions: list(z.string()) });

const CallSchema = z.object({
  uuid: z.string().min(1),
  title: text,
  leexi_url: text,
  created_at: DateTime.nullish(),
  performed_at: DateTime.nullish(), // début de l'appel ou de la réunion
  updated_at: DateTime,
  summary: text,
  simple_transcript: text, // « Nom (00:00 - 00:10)\ntexte », présent avec with_simple_transcript
  participating_users: list(PersonSchema),
  customers: list(PersonSchema),
  speakers: list(SpeakerSchema),
  prompts: list(PromptSchema),
});
export type Call = z.infer<typeof CallSchema>;

const CallsPageSchema = z.object({
  data: z.array(CallSchema),
  pagination: z.object({ pages: z.number() }),
});
const CountSchema = z.object({ pagination: z.object({ count: z.number() }) });

// HTTP Basic : identifiant de clé comme utilisateur, secret comme mot de passe.
const authorization = ({ keyId, keySecret }: Credentials) => ({
  authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
});

async function getCalls<T>(
  http: ConnectorHttp,
  credentials: Credentials,
  query: Record<string, string | number | boolean>,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    return await http.json({ url: CALLS_URL, query, headers: authorization(credentials) }, schema);
  } catch (error) {
    // 402 : le forfait de l'entreprise est inactif, la clé n'y est pour rien.
    if (error instanceof ConnectorHttpError && error.status === 402) {
      throw new ConnectorHttpError(402, 'Leexi subscription inactive');
    }
    throw error;
  }
}

// Combien d'appels la clé voit : un appel léger qui dit aussi si la clé est acceptée.
export async function countCalls(http: ConnectorHttp, credentials: Credentials): Promise<number> {
  const body = await getCalls(http, credentials, { items: 1 }, CountSchema);
  return body.pagination.count;
}

// Les appels modifiés depuis `from`, du plus ancien au plus récent, une page de la liste à la fois,
// avec la transcription. Le filtre `from` porte sur la date de modification grâce à `date_filter`.
export async function* callPages(
  http: ConnectorHttp,
  credentials: Credentials,
  from: Date,
): AsyncGenerator<Call[]> {
  for (let page = 1, pages = 1; page <= pages; page++) {
    const body = await getCalls(
      http,
      credentials,
      {
        from: from.toISOString(),
        date_filter: 'updated_at',
        order: 'updated_at asc',
        items: PAGE_SIZE,
        page,
        with_simple_transcript: true,
      },
      CallsPageSchema,
    );
    if (body.data.length === 0) return;
    pages = body.pagination.pages;
    yield body.data;
  }
}
