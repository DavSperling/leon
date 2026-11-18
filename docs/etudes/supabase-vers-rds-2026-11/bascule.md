# Bascule de la production vers RDS

Base cible : instance RDS `leon` (PostgreSQL 17.11, db.t4g.small, eu-central-1, compte AWS 2941-4345-5019), créée le
18/11/2026. Mots de passe de `leon_owner` et `leon_app` : `~/.config/leon-rds/secrets.env` sur le Mac de David
(jamais dans le repo). Mot de passe du compte maître `leon_admin` : Secrets Manager, jamais affiché.

## Une fois

1. Préparer la base (CloudShell, en compte maître) : `preparer-rds.sql`, avec `db=leon`. Les mots de passe des rôles y
   arrivent hachés (SCRAM), calculés sur le Mac.
2. Répétition : préparer `leon_essai`, `./migrer.sh copier`, `./migrer.sh verifier`, `pnpm db:migrate` doit répondre
   « Base à jour. », puis supprimer `leon_essai`.

## Le jour J (20 à 40 min de coupure)

1. **Arrêter le service Railway** (sinon des écritures arrivent sur Supabase pendant la copie et se perdent).
2. `./migrer.sh copier` puis `./migrer.sh verifier` (Supabase → `leon`).
3. Dans Railway, remplacer `DATABASE_URL` et `DATABASE_URL_ADMIN` par les adresses RDS :
   `postgres://leon_app:<mot de passe>@<adresse RDS>:5432/leon?sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem`
   (et `leon_owner` pour l'admin). La version déployée doit contenir `certs/rds-eu-central-1-bundle.pem`.
4. Redémarrer le service. `pnpm db:migrate` avant déploiement ne trouve rien à faire. Attendre `/api/health` au vert,
   se connecter, poser une question.

## Retour arrière

Remettre les deux anciennes adresses Supabase dans Railway et redéployer. Tout ce qui a été écrit sur RDS depuis la
bascule est alors perdu côté Supabase. On garde Supabase intact deux semaines avant de le supprimer.
