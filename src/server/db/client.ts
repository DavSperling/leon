import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';

// Rangé sur globalThis, en production aussi : Next compile ce module en plusieurs copies (tâches de fond, route
// API, pages), et chacune ouvrirait sinon son propre pool. En développement, le rechargement à chaud non plus.
const globalForPool = globalThis as { leonPool?: Pool };

// Supabase en mode session refuse le 16e client d'un même rôle (EMAXCONNSESSION), et une mise en ligne fait
// tourner deux instances : 5 ici et 2 pour pg-boss (pipeline/queue.ts), soit 14 au plus pendant le recouvrement.
// shortcut: taillé pour la taille de pool par défaut de Supabase (15), à relever avec elle.
globalForPool.leonPool ??= new Pool({ connectionString: env.DATABASE_URL, max: 5 });
export const pool = globalForPool.leonPool;

export const db = drizzle({ client: pool });

// Le propriétaire des tables, un superutilisateur et un rôle BYPASSRLS passent outre la RLS sans aucune erreur :
// une DATABASE_URL qui pointe vers leon_owner (ou postgres sur Supabase) montrerait les données de chaque équipe
// à toutes les autres. Lancée au démarrage (instrumentation-node.ts), avant le moindre worker.
export async function assertRlsRole(client: Pick<Pool, 'query'> = pool): Promise<void> {
  // pg_has_role(…, 'USAGE') : propriétaire, membre du propriétaire (ses droits sont hérités) ou superutilisateur.
  const { rows } = await client.query<{ who: string; bypass: boolean; owner: boolean }>(
    `select current_user as who, rolsuper or rolbypassrls as bypass,
       exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
               and pg_has_role(relowner, 'USAGE')) as owner
     from pg_roles where rolname = current_user`,
  );
  const [role] = rows;
  if (role && !role.bypass && !role.owner) return;
  throw new Error(
    `DATABASE_URL se connecte en « ${role?.who} », qui ${role?.bypass ? 'passe outre la RLS (superutilisateur ou BYPASSRLS)' : 'possède les tables'} : la sécurité par ligne ne s'appliquerait pas. DATABASE_URL doit utiliser le rôle applicatif leon_app ; le propriétaire des tables ne sert qu'aux migrations.`,
  );
}
