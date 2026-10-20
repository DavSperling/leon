import { z } from 'zod';
import { EMBEDDER_IDS } from './embeddings/embedder';
import { SUPPORTED_MODEL_IDS } from './llm/models';

// Une variable laissée vide (« ANTHROPIC_API_KEY= » après cp .env.example) vaut une variable absente.
const emptyIsAbsent = (value: unknown) => (value === '' ? undefined : value);

// Le réglage qu'exige chaque fournisseur réel de vecteurs : le factice n'en demande aucun.
const EMBEDDER_SETTING = {
  voyage: 'VOYAGE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  'bge-m3': 'LEON_BGE_URL',
  openrouter: 'OPENROUTER_API_KEY',
} as const;

// Un modèle de la table de models.ts. Un autre ferait échouer chaque appel (repli ou effort que son API refuse) :
// on refuse de démarrer, en disant lesquels marchent.
const supportedModel = (name: string) =>
  z.enum(SUPPORTED_MODEL_IDS, {
    error: () => `${name} : modèle pris en charge attendu (${SUPPORTED_MODEL_IDS.join(', ')})`,
  });

export const EnvSchema = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // Lu pour refuser le faux modèle en production ; posé par Next, jamais dans .env.example.
    NODE_ENV: z.string().optional(),
    ANTHROPIC_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    // Faux modèle déterministe, sans réseau, pour les essais et les démos sans clé. Absent : le vrai modèle.
    LEON_LLM: z.preprocess(emptyIsAbsent, z.enum(['factice']).optional()),
    // Modèle de chaque étape. Absent : le défaut de models.ts.
    LEON_MODEL_REPONSE: z.preprocess(
      emptyIsAbsent,
      supportedModel('LEON_MODEL_REPONSE').optional(),
    ),
    LEON_MODEL_DISCUSSION: z.preprocess(
      emptyIsAbsent,
      supportedModel('LEON_MODEL_DISCUSSION').optional(),
    ),
    LEON_MODEL_POINT: z.preprocess(emptyIsAbsent, supportedModel('LEON_MODEL_POINT').optional()),
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
    // Adresse du service bge-m3 : http ou https seulement. Sans http:// (« bge-service:8080 »), zod seul
    // l'accepterait et l'indexation échouerait en silence au premier appel.
    LEON_BGE_URL: z.preprocess(emptyIsAbsent, z.url({ protocol: /^https?$/ }).optional()),
    // OpenRouter : une clé et un modèle de vecteurs de 1 024 valeurs (voyageai/voyage-4, mistralai/mistral-embed-2312,
    // baai/bge-m3…), pour comparer les candidats avec un seul compte.
    OPENROUTER_API_KEY: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
    LEON_EMBEDDINGS_MODEL: z.preprocess(emptyIsAbsent, z.string().min(1).optional()),
  })
  .superRefine((env, ctx) => {
    // Un faux modèle en ligne répondrait à des questions réelles avec du texte factice : on refuse de démarrer.
    if (env.LEON_LLM === 'factice' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['LEON_LLM'],
        message:
          'LEON_LLM=factice : interdit en production (le faux modèle sert aux essais sans clé)',
      });
    }
    const id = env.LEON_EMBEDDINGS;
    if (id === undefined || id === 'factice') return;
    if (id === 'openrouter' && env.LEON_EMBEDDINGS_MODEL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['LEON_EMBEDDINGS_MODEL'],
        message: 'LEON_EMBEDDINGS_MODEL : obligatoire avec LEON_EMBEDDINGS=openrouter',
      });
    }
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
