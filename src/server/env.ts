import { z } from 'zod';
import { EMBEDDER_IDS } from './embeddings/registry';

// Une variable laissée vide (« ANTHROPIC_API_KEY= » après cp .env.example) vaut une variable absente.
const emptyIsAbsent = (value: unknown) => (value === '' ? undefined : value);

// Le réglage qu'exige chaque fournisseur réel de vecteurs : le factice n'en demande aucun.
const EMBEDDER_SETTING = {
  voyage: 'VOYAGE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  'bge-m3': 'LEON_BGE_URL',
} as const;

export const EnvSchema = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    ANTHROPIC_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    // Clé de chiffrement des clés d'API des connecteurs : 32 octets en base64.
    LEON_CONNECTORS_KEY: z.preprocess(
      emptyIsAbsent,
      z
        .string()
        .refine(
          (v) => Buffer.from(v, 'base64').length === 32,
          'LEON_CONNECTORS_KEY : 32 octets en base64',
        )
        .optional(),
    ),
    // Fournisseur de vecteurs de la recherche. Absent : recherche par le texte seul, aucun défaut.
    LEON_EMBEDDINGS: z.preprocess(emptyIsAbsent, z.enum(EMBEDDER_IDS).optional()),
    VOYAGE_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    MISTRAL_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    LEON_BGE_URL: z.preprocess(emptyIsAbsent, z.url().optional()),
  })
  .superRefine((env, ctx) => {
    const id = env.LEON_EMBEDDINGS;
    if (id === undefined || id === 'factice') return;
    const setting = EMBEDDER_SETTING[id];
    if (env[setting] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [setting],
        message: `${setting} : obligatoire avec LEON_EMBEDDINGS=${id}`,
      });
    }
  });
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

// Validé à l'import, donc au démarrage de l'app (voir instrumentation.ts).
export const env = parseEnv(process.env);
