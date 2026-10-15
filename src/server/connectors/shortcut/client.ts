import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import { apiTime } from './cursor';

// Les requêtes vers l'API REST de Shortcut et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.app.shortcut.com/api/v3';

// Ce que rend la recherche « Query Stories » (StorySlim) : le texte de l'histoire si on le demande,
// les numéros de ses commentaires mais pas leur texte.
export const StorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  app_url: z.string(),
  requested_by_id: z.string().nullish(),
  project_id: z.number().nullish(),
  epic_id: z.number().nullish(),
  comment_ids: z.array(z.number()).optional(), // [] évite une requête
  created_at: z.string(),
  updated_at: z.string().nullish(),
});
export const CommentSchema = z.object({
  id: z.number(),
  text: z.string().nullish(), // vide pour un commentaire supprimé
  author_id: z.string().nullish(), // vide pour un commentaire importé
  created_at: z.string(),
  deleted: z.boolean().optional(),
});
const MemberSchema = z.object({
  id: z.string(),
  profile: z
    .object({
      name: z.string().nullish(),
      mention_name: z.string().nullish(),
      email_address: z.string().nullish(),
    })
    .nullish(),
});
const AccountSchema = z.object({
  name: z.string(),
  workspace2: z.object({ name: z.string() }).nullish(),
});

export type Story = z.infer<typeof StorySchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Person = { name: string | null; email: string | null };

// Une histoire jamais modifiée n'a pas de date de modification : celle de sa création en tient lieu.
export const stampOf = (story: Story): string => story.updated_at ?? story.created_at;

export function shortcutClient(token: string, http: ConnectorHttp) {
  const headers = { 'Shortcut-Token': token };

  return {
    async account(): Promise<string> {
      const { name, workspace2 } = await http.json(
        { url: `${API}/member`, headers },
        AccountSchema,
      );
      return workspace2 ? `${name} (${workspace2.name})` : name;
    },

    // Les membres de l'espace, par identifiant : les histoires et les commentaires ne donnent que
    // l'identifiant de leur auteur.
    async people(): Promise<Map<string, Person>> {
      const rows = await http.json({ url: `${API}/members`, headers }, z.array(MemberSchema));
      return new Map(
        rows.map(({ id, profile }) => [
          id,
          {
            name: profile?.name?.trim() || profile?.mention_name || null,
            email: profile?.email_address || null,
          },
        ]),
      );
    },

    // Les histoires modifiées dans [from, until] (sans borne de fin si `until` manque), avec leur
    // description. La recherche n'est ni paginée ni triée : l'appelant trie.
    stories: (from: Date, until?: Date) =>
      http.json(
        {
          url: `${API}/stories/search`,
          method: 'POST',
          headers,
          body: {
            updated_at_start: apiTime(from),
            ...(until ? { updated_at_end: apiTime(until) } : {}),
            includes_description: true,
          },
        },
        z.array(StorySchema),
      ),

    comments: (storyId: number) =>
      http.json({ url: `${API}/stories/${storyId}/comments`, headers }, z.array(CommentSchema)),
  };
}

export type ShortcutClient = ReturnType<typeof shortcutClient>;
