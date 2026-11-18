#!/usr/bin/env bash
# Copie la base de Leon de Supabase vers RDS, puis compare les deux côtés.
#   ./migrer.sh copier     schéma + données de `public` (en leon_owner) et `pgboss` (en leon_app)
#   ./migrer.sh verifier   nombre de lignes de chaque table et valeur de chaque séquence, des deux côtés
# La base cible doit avoir été préparée par preparer-rds.sql. Adresses lues dans l'environnement (jamais dans le repo) :
#   SRC_OWNER_URL, SRC_APP_URL : Supabase, en leon_owner et leon_app
#   DST_OWNER_URL, DST_APP_URL : RDS, en leon_owner et leon_app
# Chaque schéma est copié par son propriétaire, comme à la source : les tables gardent le même propriétaire, et aucune
# n'est en FORCE ROW LEVEL SECURITY, donc le propriétaire lit et écrit toutes les lignes.
set -euo pipefail

PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
: "${SRC_OWNER_URL:?}" "${SRC_APP_URL:?}" "${DST_OWNER_URL:?}" "${DST_APP_URL:?}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Retire ce qui est propre à Supabase ou déjà posé par preparer-rds.sql : création et droits des schémas, droits par
# défaut des rôles Supabase (postgres, supabase_admin, anon…). Les lignes de données (blocs COPY) ne sont pas touchées.
filtrer() {
  awk '
    copy { print; if ($0 == "\\.") copy = 0; next }
    /^COPY .* FROM stdin;$/ { copy = 1; print; next }
    /^(CREATE SCHEMA|ALTER SCHEMA|COMMENT ON SCHEMA|ALTER DEFAULT PRIVILEGES) / { next }
    /^(GRANT|REVOKE) .* ON SCHEMA / { next }
    { print }
  '
}

copier_schema() { # schéma, adresse source, adresse cible
  local schema=$1 src=$2 dst=$3
  echo "→ $schema : copie"
  "$PG_BIN/pg_dump" "$src" --schema="$schema" --no-subscriptions --no-publications | filtrer > "$WORK/$schema.sql"
  "$PG_BIN/psql" "$dst" --quiet --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f "$WORK/$schema.sql" > /dev/null
}

copier() {
  local deja
  deja=$("$PG_BIN/psql" "$DST_OWNER_URL" -Atc "select count(*) from pg_tables where schemaname in ('public', 'pgboss')")
  if [ "$deja" != 0 ]; then
    echo "La base cible contient déjà $deja tables : on ne copie que dans une base vide." >&2
    exit 1
  fi
  copier_schema public "$SRC_OWNER_URL" "$DST_OWNER_URL"
  copier_schema pgboss "$SRC_APP_URL" "$DST_APP_URL"
  echo "Copie terminée."
}

# Une ligne par table (« schéma.table nombre ») et par séquence (« schéma.séquence valeur »), triées.
inventaire() { # adresse, schéma
  "$PG_BIN/psql" "$1" -At --no-psqlrc -v ON_ERROR_STOP=1 <<SQL
select format('select %L || '' '' || count(*) from %I.%I;', n.nspname || '.' || c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = '$2' and c.relkind = 'r'
union all
select format('select %L || '' '' || coalesce(last_value::text, ''-'') from pg_sequences where schemaname = %L and sequencename = %L;',
              schemaname || '.' || sequencename, schemaname, sequencename)
from pg_sequences where schemaname = '$2'
\gexec
SQL
}

verifier() {
  { inventaire "$SRC_OWNER_URL" public; inventaire "$SRC_APP_URL" pgboss; } | sort > "$WORK/source.txt"
  { inventaire "$DST_OWNER_URL" public; inventaire "$DST_APP_URL" pgboss; } | sort > "$WORK/cible.txt"
  if diff -u "$WORK/source.txt" "$WORK/cible.txt"; then
    echo "Identiques : $(wc -l < "$WORK/source.txt" | tr -d ' ') tables et séquences."
  else
    echo "Différences ci-dessus (- Supabase, + RDS)." >&2
    exit 1
  fi
}

case "${1:-}" in
  copier) copier ;;
  verifier) verifier ;;
  *) echo "Usage : $0 copier|verifier" >&2; exit 2 ;;
esac
