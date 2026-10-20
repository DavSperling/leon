import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

const BASE_URL = 'https://api.fathom.ai/external/v1';

// Seulement les champs lus. Les dates sont de l'ISO 8601 avec fuseau (format date-time de la doc).
const date = z.iso.datetime({ offset: true });
const person = z.object({ name: z.string().nullish(), email: z.string().nullish() });

const MeetingSchema = z.object({
  recording_id: z.number().int(),
  title: z.string(),
  url: z.string().nullish(),
  created_at: date,
  recording_start_time: date,
  transcript: z
    .array(
      z.object({
        speaker: z.object({
          display_name: z.string(),
          matched_calendar_invitee_email: z.string().nullish(),
        }),
        text: z.string(),
        timestamp: z.string(), // HH:MM:SS
      }),
    )
    .nullish(),
  default_summary: z.object({ markdown_formatted: z.string().nullish() }).nullish(),
  calendar_invitees: z.array(person).nullish(),
  recorded_by: person.nullish(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

const MeetingListSchema = z.object({
  items: z.array(MeetingSchema),
  next_cursor: z.string().nullish(),
});

export function listMeetings(
  http: ConnectorHttp,
  apiKey: string,
  query: HttpRequest['query'],
): Promise<z.infer<typeof MeetingListSchema>> {
  return http.json(
    { url: `${BASE_URL}/meetings`, headers: { 'X-Api-Key': apiKey }, query },
    MeetingListSchema,
  );
}
