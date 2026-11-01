import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  BRIEFING_PROJECT_PARAM,
  PASSATION_BRANCH_PARAM,
  PassationWriteSchema,
} from '@/capture/api-contract';
import { PROJECT_KEY_PATTERN } from '@/capture/turn';
import { lastPassationAt, readBranchState } from '@/server/passation/state';
import { writePassation } from '@/server/passation/write';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Les routes de passation, lues et écrites par la CLI (crochets de démarrage et de fin de session). Comme le point du
// matin : jeton personnel, clé de projet calculée par la CLI, jamais une adresse de remote.

const ProjectSchema = z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN);
const BranchSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w./-]+$/);
const BODY_MAX_BYTES = 32 * 1024;

function readQuery(query: (name: string) => string | undefined) {
  const project = ProjectSchema.safeParse(query(BRIEFING_PROJECT_PARAM));
  const rawBranch = query(PASSATION_BRANCH_PARAM);
  const branch =
    rawBranch === undefined || rawBranch === '' ? null : BranchSchema.safeParse(rawBranch);
  if (!project.success || (branch !== null && !branch.success)) return null;
  return { project: project.data, branch: branch === null ? null : branch.data };
}

export const passationRoutes = new Hono<ApiEnv>()
  .post(
    '/passation',
    requireApiToken,
    bodyLimit({
      maxSize: BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    async (c) => {
      const parsed = PassationWriteSchema.safeParse(await c.req.json().catch(() => undefined));
      // Sans les valeurs reçues : elles peuvent contenir des secrets.
      if (!parsed.success || !PROJECT_KEY_PATTERN.test(parsed.data.projet)) {
        return c.json({ error: 'Invalid request' }, 400);
      }
      const { texte, projet, branche, outil } = parsed.data;
      return c.json(
        await writePassation(c.var.ctx, { texte, project: projet, branch: branche, tool: outil }),
        201,
      );
    },
  )
  .get('/passation', requireApiToken, async (c) => {
    const query = readQuery((name) => c.req.query(name));
    if (query === null) return c.json({ error: 'Missing or invalid project' }, 400);
    return c.json({ markdown: await readBranchState(c.var.ctx, query.project, query.branch) });
  })
  .get('/passation/derniere', requireApiToken, async (c) => {
    const query = readQuery((name) => c.req.query(name));
    if (query === null) return c.json({ error: 'Missing or invalid project' }, 400);
    const at = await lastPassationAt(c.var.ctx, query.project, query.branch);
    return c.json({ at: at?.toISOString() ?? null });
  });
