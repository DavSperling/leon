import { z } from 'zod';

// Les réponses de Missive, seulement les champs lus. Les dates sont des secondes Unix.

const Person = z.object({ name: z.string().nullish(), email: z.string().nullish() });

export const ConversationSchema = z.object({
  id: z.string(),
  last_activity_at: z.number(),
  // Un invité de la conversation ne reçoit que ces deux champs.
  subject: z.string().nullish(),
  latest_message_subject: z.string().nullish(),
  web_url: z.string().nullish(),
  organization: z.object({ name: z.string() }).nullish().catch(null),
  team: z.object({ name: z.string() }).nullish().catch(null),
  shared_label_names: z.string().nullish(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
export const ConversationsSchema = z.object({ conversations: z.array(ConversationSchema) });

// Courriel : { name, address } ; autres canaux (SMS, messageries) : { id, name, username }.
const Sender = z.object({
  name: z.string().nullish(),
  address: z.string().nullish(),
  username: z.string().nullish(),
});

// La liste des messages n'a pas le corps : il se lit à part (BodiesSchema).
export const MessageSchema = z.object({
  id: z.string(),
  delivered_at: z.number(),
  preview: z.string().nullish(),
  from_field: Sender.nullish().catch(null),
  author: Person.nullish().catch(null), // la personne qui a écrit un message sortant
});
export const MessagesSchema = z.object({ messages: z.array(MessageSchema) });
export type Message = z.infer<typeof MessageSchema> & { body: string | null };

export const BodiesSchema = z.object({
  messages: z.array(z.object({ id: z.string(), body: z.string().nullish() })),
});

export const CommentSchema = z.object({
  id: z.string(),
  body: z.string().nullish(),
  created_at: z.number(),
  author: Person.nullish().catch(null),
});
export type Comment = z.infer<typeof CommentSchema>;
export const CommentsSchema = z.object({ comments: z.array(CommentSchema) });

export const UsersSchema = z.object({
  users: z.array(
    z.object({
      me: z.boolean().nullish(),
      name: z.string().nullish(),
      email: z.string().nullish(),
    }),
  ),
});
export const OrganizationsSchema = z.object({
  organizations: z.array(z.object({ name: z.string() })),
});
