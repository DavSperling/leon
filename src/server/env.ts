import { z } from 'zod';

// Une variable laissée vide (« ANTHROPIC_API_KEY= » après cp .env.example) vaut une variable absente.
const emptyIsAbsent = (value: unknown) => (value === '' ? undefined : value);

export const EnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ANTHROPIC_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
});
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

// Validé à l'import, donc au démarrage de l'app (voir instrumentation.ts).
export const env = parseEnv(process.env);
