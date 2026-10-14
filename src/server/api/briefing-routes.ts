import { Hono } from 'hono';
import type { z } from 'zod';
import type { BriefingResponseSchema } from '@/capture/api-contract';
import { buildBriefing } from '@/server/memory/briefing';
import { type ApiEnv, requireApiToken } from './require-api-token';

export const briefingRoutes = new Hono<ApiEnv>().get('/briefing', requireApiToken, async (c) => {
  const { markdown, reviewCount, entries } = await buildBriefing(c.var.ctx);
  const body: z.input<typeof BriefingResponseSchema> = {
    markdown,
    reviewCount,
    entries: entries.map((entry) => ({ ...entry, lastFactAt: entry.lastFactAt.toISOString() })),
  };
  return c.json(body);
});
