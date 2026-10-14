import { z } from 'zod';

// Contrat des tours captés, partagé avec la CLI et l'extension (décision D1 : imports relatifs seulement).
export const SOURCE_KINDS = ['claude_code', 'claude_ai', 'chatgpt', 'mcp_remember'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const CAPTURE_MODES = ['file', 'network', 'dom', 'manual'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];
export const TURN_TEXT_MAX = 20_000; // caractères par tour, après nettoyage
export const TURNS_PER_BATCH_MAX = 200;
export const INGEST_BODY_MAX_BYTES = 2 * 1024 * 1024;

export const TurnSchema = z
  .object({
    external_id: z.string().min(1).max(200),
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(TURN_TEXT_MAX),
    ts: z.iso.datetime({ offset: true }),
    capture_mode: z.enum(CAPTURE_MODES),
  })
  .strict();
export type Turn = z.infer<typeof TurnSchema>;

export const IngestPayloadSchema = z
  .object({
    source: z
      .object({
        kind: z.enum(SOURCE_KINDS),
        external_id: z.string().min(1).max(200),
        title: z.string().min(1).max(300).optional(),
      })
      .strict(),
    turns: z.array(TurnSchema).min(1).max(TURNS_PER_BATCH_MAX),
  })
  .strict();
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

export const IngestResultSchema = z.object({
  sourceId: z.uuid(),
  inserted: z.number().int(),
  skipped: z.number().int(),
  ingestRunId: z.uuid().nullable(),
});
export type IngestResult = z.infer<typeof IngestResultSchema>;
