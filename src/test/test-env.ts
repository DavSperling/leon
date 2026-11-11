// Environnement des tests : Postgres local de docker compose (mots de passe de développement, pas des secrets).
// LEON_TEST_DATABASE choisit la base (défaut leon_test) : une branche qui supprime ou change des tables
// travaille sur sa propre base pour ne pas casser celle que partagent les autres.

const SHARED_DATABASE = 'leon_test';
// Un nom qui commence par leon_test : refuse la base de développement (leon) et tout caractère
// (/, ?, @, #) qui changerait l'adresse de connexion.
const DATABASE_NAME = /^leon_test[a-z0-9_]*$/;

// Migrations qui suppriment des données : elles ne s'appliquent jamais par accident à la base partagée.
export const MIGRATIONS_DESTRUCTIVES = ['0010-suppression-tri.sql'];
export const ACCEPT_DESTRUCTIVE_VARIABLE = 'LEON_TEST_ACCEPTE_MIGRATIONS_DESTRUCTIVES';

export function testDatabaseName(raw: string | undefined): string {
  const name = raw ?? SHARED_DATABASE;
  if (!DATABASE_NAME.test(name)) {
    throw new Error(
      `LEON_TEST_DATABASE doit nommer une base de test : « ${SHARED_DATABASE} » ou un nom qui commence par « ${SHARED_DATABASE}_ » (lettres minuscules, chiffres et tirets bas).`,
    );
  }
  return name;
}

// Renvoie le message de refus (en français) si les migrations en attente supprimeraient des données de la base
// partagée par les branches ; null sinon. `accepted` : l'équipe a décidé de migrer leon_test.
export function refuseMigrationsDestructives(input: {
  database: string;
  pending: string[];
  accepted: boolean;
}): string | null {
  if (input.database !== SHARED_DATABASE || input.pending.length === 0 || input.accepted) {
    return null;
  }
  return [
    `La migration ${input.pending.join(', ')} supprime des tables : elle ne s'applique pas à ${SHARED_DATABASE},`,
    'la base de test que partagent main et les autres branches.',
    `Lancez les tests avec LEON_TEST_DATABASE=${SHARED_DATABASE}_<nom> (base créée une fois, voir le plan du deuxième jet).`,
    `Si toute l'équipe est d'accord pour migrer ${SHARED_DATABASE}, ajoutez ${ACCEPT_DESTRUCTIVE_VARIABLE}=oui.`,
  ].join(' ');
}

const database = testDatabaseName(process.env.LEON_TEST_DATABASE);

export const TEST_ENV = {
  DATABASE_URL: `postgres://leon_app:leon_app@127.0.0.1:54329/${database}`,
  DATABASE_URL_ADMIN: `postgres://leon_owner:leon_owner@127.0.0.1:54329/${database}`,
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // Clé fixe de test (32 octets), pas un secret : la même dans tous les workers Vitest.
  LEON_CONNECTORS_KEY: Buffer.alloc(32, 7).toString('base64'),
  // Vitest range TEST_ENV dans process.env et env.ts le valide à l'import : une variable de fournisseur de
  // vecteurs exportée dans le shell (essai de Voyage, de Mistral ou de bge-m3) changerait l'environnement des
  // tests et les ferait échouer à l'import. Vide vaut absent : les tests voient le même environnement partout.
  LEON_EMBEDDINGS: '',
  VOYAGE_API_KEY: '',
  MISTRAL_API_KEY: '',
  LEON_BGE_URL: '',
  OPENROUTER_API_KEY: '',
  LEON_EMBEDDINGS_MODEL: '',
  // Même raison pour le modèle d'IA : une clé Anthropic exportée dans le shell ferait rendre un vrai client à
  // getLlm (appel réseau, ou un test « aucun modèle » qui dépend du poste), un faux modèle exporté pour une
  // démo changerait les tests, et un modèle réglé par étape changerait le modèle attendu.
  ANTHROPIC_API_KEY: '',
  LEON_LLM: '',
  LEON_MODEL_REPONSE: '',
  LEON_MODEL_DISCUSSION: '',
  LEON_MODEL_POINT: '',
  LEON_MODEL_RESUME: '',
  LEON_MODEL_FIL: '',
  // Une clé Resend exportée dans le shell ferait partir de vrais e-mails pendant les tests.
  RESEND_API_KEY: '',
  LEON_EMAIL_FROM: '',
  // Les boutons Google et Microsoft : des clés du poste ne changent pas l'écran que voient les tests.
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  MICROSOFT_CLIENT_ID: '',
  MICROSOFT_CLIENT_SECRET: '',
  // L'en-tête où le proxy de confiance pose l'adresse du client (rate-limit.ts), comme Caddy en production.
  LEON_IP_HEADER: 'x-real-ip',
  // Les admins de /admin : le défaut de env.ts, jamais la liste du poste.
  LEON_ADMINS: '',
} as const;
