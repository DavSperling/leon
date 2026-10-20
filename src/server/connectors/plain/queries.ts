import { z } from 'zod';

// Ce qu'on demande à Plain et la forme de ce qu'il répond (seulement les champs lus).

export const ACCOUNT_QUERY = 'query Account { myWorkspace { name } }';

// Le tri par date de modification n'existe pas : par création, qui ne bouge jamais, la liste reste
// stable d'une page à l'autre pendant un passage.
export const THREADS_QUERY = `query Threads($filters: ThreadsFilter, $first: Int!, $after: String) {
  threads(filters: $filters, sortBy: { field: CREATED_AT, direction: ASC }, first: $first, after: $after) {
    edges { node { id ref title updatedAt { iso8601 } customer { fullName } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Un alias par type de message : leurs champs « text » n'ont pas tous la même nullité, et GraphQL
// refuse de les fusionner sous un même nom. Seul le texte du dernier message d'un courriel est lu
// (`textContent`), sans les réponses citées, qui sont des messages à part.
export const TIMELINE_QUERY = `query Timeline($threadId: ID!, $first: Int!, $after: String) {
  thread(threadId: $threadId) {
    timelineEntries(
      filters: { entryTypes: [EMAIL, CHAT, NOTE, SLACK_MESSAGE, SLACK_REPLY, MS_TEAMS_MESSAGE, DISCORD_MESSAGE] }
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          timestamp { iso8601 }
          actor {
            ... on UserActor { user { fullName email } }
            ... on CustomerActor { customer { fullName email { email } } }
            ... on MachineUserActor { machineUser { fullName } }
          }
          entry {
            ... on EmailEntry { email: textContent }
            ... on NoteEntry { note: text }
            ... on ChatEntry { chat: text }
            ... on SlackMessageEntry { slack: text }
            ... on SlackReplyEntry { slackReply: text }
            ... on MSTeamsMessageEntry { teams: text }
            ... on DiscordMessageEntry { discord: markdownContent }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const dateTime = z.object({ iso8601: z.string() });
export const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

export const thread = z.object({
  id: z.string(),
  ref: z.string(),
  title: z.string(),
  updatedAt: dateTime,
  customer: z.object({ fullName: z.string() }),
});
// Un acteur système ou un client supprimé n'a aucun de ces champs : l'objet reste vide.
const actor = z.object({
  user: z.object({ fullName: z.string(), email: z.string() }).optional(),
  customer: z.object({ fullName: z.string(), email: z.object({ email: z.string() }) }).optional(),
  machineUser: z.object({ fullName: z.string() }).optional(),
});
const text = z.string().nullish();
const entry = z.object({
  email: text,
  note: text,
  chat: text,
  slack: text,
  slackReply: text,
  teams: text,
  discord: text,
});
export const timelineNode = z.object({ id: z.string(), timestamp: dateTime, actor, entry });

export type PlainThread = z.infer<typeof thread>;
export type PlainEntry = z.infer<typeof timelineNode>;
