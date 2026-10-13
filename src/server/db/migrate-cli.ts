import { z } from 'zod';
import { runMigrations } from './migrate';

const AdminEnvSchema = z.object({ DATABASE_URL_ADMIN: z.string().regex(/^postgres(ql)?:\/\//) });

// Outil de développement : le SQL des migrations ne contient aucune donnée, et le message complet
// de l'erreur est indispensable pour corriger une migration (seule exception à logError).
async function main(): Promise<void> {
  const { DATABASE_URL_ADMIN } = AdminEnvSchema.parse(process.env);
  const applied = await runMigrations(DATABASE_URL_ADMIN);
  console.log(applied.length > 0 ? `Appliquées : ${applied.join(', ')}` : 'Base à jour.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
