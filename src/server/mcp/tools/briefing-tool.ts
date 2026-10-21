import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BriefingResponseSchema } from '@/capture/api-contract';
import { PROJECT_KEY_PATTERN } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefingResponse, latestBriefingProject } from '@/server/briefing/briefings';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { guarded } from './guarded';

// L'outil `briefing` : le point du matin sur un projet, pour les clients qui n'ont pas le crochet de démarrage de
// Claude Code (ChatGPT, Cursor). Il rend la même chose que la route du crochet (`GET /api/v1/briefing`), sous les
// droits du porteur du jeton : le dernier point prêt, ou le message d'attente (le recalcul est alors mis en file), ou,
// sans modèle sur ce serveur, le message qui dit qu'aucun point n'est préparé.

const PROJECT_INPUT_MAX_CHARS = 300;
const KEY_MAX_CHARS = 200;
const OWNER_AND_REPO = /^[a-z0-9._-]+\/[a-z0-9._-]+$/;

const InputSchema = z.object({
  projet: z
    .string()
    .max(PROJECT_INPUT_MAX_CHARS)
    .nullish()
    .describe(
      "Le projet : son dépôt GitHub (github.com/propriétaire/dépôt, ou propriétaire/dépôt). Facultatif : sans lui, le dernier point que l'utilisateur a lu.",
    ),
});

export const BRIEFING_DESCRIPTION =
  "Le point du matin sur un projet, préparé à l'avance par Leon : ce que l'utilisateur y a fait dans ses dernières sessions Claude Code, ce qui a bougé depuis (demandes de fusion, tickets, messages qui le mentionnent) et ce qui reste ouvert, avec ses sources. À lire au début d'un travail sur ce projet.";

const INVALID_PROJECT =
  'Projet invalide : donne son dépôt GitHub (github.com/propriétaire/dépôt ou propriétaire/dépôt).';

// La clé du projet (D9) d'après ce qu'écrit l'utilisateur : la clé elle-même, « propriétaire/dépôt », ou l'adresse
// https du dépôt. Null pour tout le reste (un autre hébergeur, une adresse avec identifiants).
export function projectKeyFromInput(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  const path = text
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const key = text.startsWith('dossier:')
    ? text
    : OWNER_AND_REPO.test(path) && !path.split('/').some((part) => part === '.' || part === '..')
      ? `github.com/${path}`
      : null;
  return key !== null && key.length <= KEY_MAX_CHARS && PROJECT_KEY_PATTERN.test(key) ? key : null;
}

export function registerBriefingTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'briefing',
    {
      title: 'Le point du matin',
      description: BRIEFING_DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: BriefingResponseSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('briefing', async ({ projet }) => {
      let project: string | null;
      if (projet == null || projet.trim() === '') {
        project = await latestBriefingProject(ctx);
      } else {
        project = projectKeyFromInput(projet);
        if (project === null) {
          return { isError: true, content: [{ type: 'text', text: INVALID_PROJECT }] };
        }
      }
      const body = await briefingResponse(ctx, project, { modelReady: getLlm(env) !== null });
      return { content: [{ type: 'text', text: body.markdown }], structuredContent: body };
    }),
  );
}
