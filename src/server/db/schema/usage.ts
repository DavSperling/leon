import { integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PIPELINE_LLM_STEPS } from '@/server/llm/llm';
import { organizations } from './auth';

// Coût de chaque appel au LLM (0007-llm-usage.sql). Insertion seule pour le rôle de l'app.
export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  ingestRunId: uuid('ingest_run_id'),
  step: text('step', { enum: PIPELINE_LLM_STEPS }).notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens').notNull(),
  cacheWriteTokens: integer('cache_write_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 12, scale: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
