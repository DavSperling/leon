import { z } from 'zod';

// Seuls les champs lus. Graph rend les dates en UTC, avec un Z.

// Une date que `new Date` sait lire : une illisible ferait lever la conversion plus loin.
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const listOf = <T extends z.ZodType>(row: T) =>
  z.object({ value: z.array(row), '@odata.nextLink': z.string().nullish() });

export const MeSchema = z.object({
  id: z.string().nullish(),
  displayName: z.string().nullish(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

const JoinedTeamSchema = z.object({ id: z.string(), displayName: z.string().nullish() });
export const JoinedTeamsSchema = listOf(JoinedTeamSchema);

// « public », « private » ou « hiddenMembership ». Absent ou inconnu : traité comme privé.
export const TeamSchema = z.object({ visibility: z.string().nullish() });

// « standard », « private » ou « shared » (avec Prefer: include-unknown-enum-members).
const ChannelSchema = z.object({
  id: z.string(),
  displayName: z.string().nullish(),
  membershipType: z.string().nullish(),
});
export const ChannelsSchema = listOf(ChannelSchema);

const ChatSchema = z.object({
  id: z.string(),
  topic: z.string().nullish(),
  members: z.array(z.object({ displayName: z.string().nullish() })).nullish(),
});
export const ChatsSchema = listOf(ChatSchema);

// Un message de canal ou de conversation. `deletedDateTime` : supprimé chez Microsoft (le message reste, vide).
const MessageSchema = z.object({
  id: z.string(),
  messageType: z.string().nullish(),
  createdDateTime: instant,
  lastModifiedDateTime: instant.nullish(),
  deletedDateTime: instant.nullish(),
  subject: z.string().nullish(),
  from: z.object({ user: z.object({ displayName: z.string().nullish() }).nullish() }).nullish(),
  body: z.object({ contentType: z.string(), content: z.string().nullish() }).nullish(),
  webUrl: z.string().nullish(),
});
export const MessagesSchema = listOf(MessageSchema);

// Un message de canal et ses réponses (`$expand=replies`) ; au-delà de la première page, `replies@odata.nextLink`.
const RootSchema = MessageSchema.extend({
  replies: z.array(MessageSchema).nullish(),
  'replies@odata.nextLink': z.string().nullish(),
});
export const RootsSchema = listOf(RootSchema);

// Un événement de l'agenda (calendarView). `onlineMeetingProvider` : « teamsForBusiness » pour une réunion Teams ;
// `sensitivity` : « normal », « personal », « private » ou « confidential ».
const PersonSchema = z.object({
  emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }).nullish(),
});
const EventSchema = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  isCancelled: z.boolean().nullish(),
  sensitivity: z.string().nullish(),
  onlineMeetingProvider: z.string().nullish(),
  onlineMeeting: z.object({ joinUrl: z.string().nullish() }).nullish(),
  webLink: z.string().nullish(),
  organizer: PersonSchema.nullish(),
  attendees: z.array(PersonSchema).nullish(),
});
export const EventsSchema = listOf(EventSchema);

// La réunion d'un lien de participation : une liste d'une réunion (onlinemeeting-get).
export const MeetingsSchema = listOf(z.object({ id: z.string() }));

const TranscriptSchema = z.object({
  id: z.string(),
  createdDateTime: instant,
  endDateTime: instant.nullish(),
});
export const TranscriptsSchema = listOf(TranscriptSchema);

export type Me = z.infer<typeof MeSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type Chat = z.infer<typeof ChatSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Root = z.infer<typeof RootSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
