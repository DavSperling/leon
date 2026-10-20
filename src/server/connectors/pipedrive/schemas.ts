import { z } from 'zod';

// La forme des réponses de Pipedrive (seulement les champs utiles).

export type Person = { name: string | null; email: string | null };

// La v1 rend « AAAA-MM-JJ HH:MM:SS » sans fuseau, en UTC (la doc le dit pour l'écriture des notes) ;
// la v2 rend de l'ISO 8601 avec Z. Une autre forme est refusée.
const DateText = z
  .string()
  .transform((value) =>
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value,
  )
  .pipe(z.iso.datetime({ offset: true }));

const Id = z.number().nullish();
// `key` et `at` : ce que l'ordre de lecture (stream.ts) compare.
const withOrder = <T extends { id: number; add_time: string; update_time?: string | null }>(
  row: T,
) => ({ ...row, key: String(row.id), at: row.update_time ?? row.add_time });

export const NoteSchema = z
  .object({
    id: z.number(),
    active_flag: z.boolean().nullish(), // faux : note supprimée
    add_time: DateText,
    update_time: DateText.nullish(),
    content: z.string().nullish(), // HTML
    deal_id: Id,
    person_id: Id,
    org_id: Id,
    deal: z.object({ title: z.string().nullish() }).nullish(),
    person: z.object({ name: z.string().nullish() }).nullish(),
    organization: z.object({ name: z.string().nullish() }).nullish(),
    user: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
  })
  .transform(withOrder);
// Une liste vide arrive avec `data: null` en v1.
export const NotesPageSchema = z.object({
  data: z.array(NoteSchema).nullish(),
  additional_data: z
    .object({
      pagination: z
        .object({
          more_items_in_collection: z.boolean().nullish(),
          next_start: z.number().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export const ActivitySchema = z
  .object({
    id: z.number(),
    subject: z.string().nullish(),
    type: z.string().nullish(), // « call », « meeting », « task »… ou un type de l'entreprise
    owner_id: Id,
    creator_user_id: Id,
    is_deleted: z.boolean().nullish(),
    add_time: DateText,
    update_time: DateText.nullish(),
    deal_id: Id,
    person_id: Id,
    org_id: Id,
    due_date: z.string().nullish(),
    done: z.boolean().nullish(),
    public_description: z.string().nullish(),
    note: z.string().nullish(), // HTML
  })
  .transform(withOrder);
export const ActivitiesPageSchema = z.object({
  data: z.array(ActivitySchema).nullish(),
  additional_data: z.object({ next_cursor: z.string().nullish() }).nullish(),
});

export const MeSchema = z.object({
  data: z.object({
    name: z.string().nullish(),
    company_name: z.string().nullish(),
  }),
});
export const UsersSchema = z.object({
  data: z
    .array(z.object({ id: z.number(), name: z.string().nullish(), email: z.string().nullish() }))
    .nullish(),
});

export type Note = z.infer<typeof NoteSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
