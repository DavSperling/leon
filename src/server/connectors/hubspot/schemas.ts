import { z } from 'zod';

// La forme des réponses de HubSpot lues (seulement les champs utiles).

export type EngagementType = 'notes' | 'calls' | 'meetings' | 'emails';
export type LinkedKind = 'companies' | 'deals' | 'contacts';

const Properties = z.record(z.string(), z.string().nullish());
export const HitSchema = z.object({
  id: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
  properties: Properties,
});
export const SearchReply = z.object({
  results: z.array(HitSchema),
  paging: z.object({ next: z.object({ after: z.string() }).nullish() }).nullish(),
});
// toObjectId est un nombre dans l'exemple de la doc ; une chaîne ne coûte rien à accepter.
export const LinksReply = z.object({
  results: z.array(
    z.object({
      from: z.object({ id: z.string() }),
      to: z.array(z.object({ toObjectId: z.union([z.number(), z.string()]).transform(String) })),
    }),
  ),
});
export const NamesReply = z.object({
  results: z.array(z.object({ id: z.string(), properties: Properties })),
});
export const OwnersReply = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullish(),
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
    }),
  ),
  paging: z.object({ next: z.object({ after: z.string() }).nullish() }).nullish(),
});
export const AccountReply = z.object({ portalId: z.number() });

export type Hit = z.infer<typeof HitSchema>;
export type Person = { name: string | null; email: string | null };
