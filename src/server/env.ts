import { z } from 'zod';

// Une variable laissée vide (« ANTHROPIC_API_KEY= » après cp .env.example) vaut une variable absente.
const emptyIsAbsent = (value: unknown) => (value === '' ? undefined : value);

// Modèle d'une étape du pipeline (voir src/server/llm/config.ts) : « anthropic:<modèle> » ou
// « openrouter:<fournisseur>/<modèle> ». Absent, l'étape garde son modèle Anthropic par défaut.
const llmChoice = z.preprocess(
  emptyIsAbsent,
  z
    .string()
    .regex(/^(anthropic:[a-z0-9][a-z0-9.-]*|openrouter:[a-z0-9-]+\/[a-z0-9][a-z0-9.:_-]*)$/i, {
      message: 'format attendu : anthropic:<modèle> ou openrouter:<fournisseur>/<modèle>',
    })
    .optional(),
);

export const EnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ANTHROPIC_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
  OPENROUTER_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
  LEON_LLM_TRIAGE: llmChoice,
  LEON_LLM_EXTRACTION: llmChoice,
  LEON_LLM_RANGEMENT: llmChoice,
});
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

// Validé à l'import, donc au démarrage de l'app (voir instrumentation.ts).
export const env = parseEnv(process.env);
