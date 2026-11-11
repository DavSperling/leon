import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { VERSION_N_MAX } from '@/capture/api-contract';
import type { TenantContext } from '@/server/auth/tenant-context';
import { writeNote } from '@/server/memory/notes';
import { guarded } from './guarded';

// `remember` (T57 ; D36, D38, C14 du plan de la mémoire à disposition) : le chemin de `leon note`, writeNote, avec le
// client pour outil (`mcp:<libellé>`). Sans `note`, une note neuve ; avec `note` et `version`, la version suivante de
// la note, si elle vient du même client. Il ne rend qu'un id et un numéro, jamais le texte.
export const RememberInputSchema = z.object({
  text: z.string().min(1).max(4000),
  about: z.string().max(200).optional(),
  note: z
    .uuid()
    .optional()
    .describe('The id of a note saved earlier with remember, to write its next version.'),
  version: z
    .number()
    .int()
    .min(1)
    .max(VERSION_N_MAX)
    .optional()
    .describe('With note: the number of its last version you read. Required with note.'),
});

const refusal = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });
const REFUSALS = {
  depassee: 'This note changed since that version: fetch it again before writing.',
  autre_outil: 'This note was written by another tool: save a new note instead.',
  introuvable: 'No note found.',
  invalide: 'Nothing to save: the text is empty.',
} as const;

export function registerRememberTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'remember',
    {
      title: 'Save a note',
      description:
        'Saves a piece of information to memory. It stays private to the user, and Leon indexes it so it can be found later. `about` names the subject (client, project, person…). To change a note you saved, give its id as `note` and the number of its last version as `version`: Leon writes the next version.',
      inputSchema: RememberInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('remember', async ({ text, about, note, version }) => {
      if ((note === undefined) !== (version === undefined)) {
        return refusal('Give note and version together.');
      }
      const written = await writeNote(ctx, {
        texte: about ? `About ${about}: ${text}` : text,
        outil: `mcp:${client}`,
        note,
        version,
      });
      if (typeof written !== 'object') return refusal(REFUSALS[written]);
      return {
        content: [{ type: 'text', text: `Saved: note ${written.id}, version ${written.n}.` }],
        structuredContent: written,
      };
    }),
  );
}
