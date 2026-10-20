import { z } from 'zod';

// Seuls les champs lus. Graph rend les dates en UTC, avec un Z.

// Une date que `new Date` sait lire : une illisible ferait lever la conversion plus loin.
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const person = z.object({
  emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }),
});
const body = z.object({ contentType: z.string(), content: z.string().nullish() });
const when = z.object({ dateTime: z.string(), timeZone: z.string() });

export const MeSchema = z.object({
  id: z.string().nullish(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullish(),
  subject: z.string().nullish(),
  receivedDateTime: instant,
  from: person.nullish(),
  body: body.nullish(),
  webLink: z.string().nullish(),
});

const EventSchema = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  lastModifiedDateTime: instant,
  start: when.nullish(),
  end: when.nullish(),
  location: z.object({ displayName: z.string().nullish() }).nullish(),
  organizer: person.nullish(),
  isOrganizer: z.boolean().nullish(),
  isCancelled: z.boolean().nullish(),
  sensitivity: z.string().nullish(),
  attendees: z.array(person).nullish(),
  body: body.nullish(),
  webLink: z.string().nullish(),
});

const pageOf = <T extends z.ZodType>(row: T) =>
  z.object({ value: z.array(row), '@odata.nextLink': z.string().nullish() });

export const MessagesPageSchema = pageOf(MessageSchema);
export const EventsPageSchema = pageOf(EventSchema);
export type Message = z.infer<typeof MessageSchema>;
export type GraphEvent = z.infer<typeof EventSchema>;
export type Me = z.infer<typeof MeSchema>;
