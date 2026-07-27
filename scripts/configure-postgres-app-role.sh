#!/bin/sh
set -eu

DOCKER_BIN=${DOCKER_BIN:-/usr/local/bin/docker}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-/volume1/docker/ontime}
ENV_FILE="$PROJECT_DIRECTORY/.env"
read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

ADMIN_ROLE=$(read_env POSTGRES_USER)
DATABASE_NAME=$(read_env POSTGRES_DB)
[ -n "$DATABASE_NAME" ] || DATABASE_NAME=ontime
APP_ROLE=$ADMIN_ROLE
APP_PASSWORD=$(read_env POSTGRES_PASSWORD)

case "$APP_ROLE" in
  *[!a-zA-Z0-9_]*|'')
    echo "POSTGRES_APP_USER contient un caractère non permis." >&2
    exit 1
    ;;
esac

SQL_FILE=$(mktemp)
ENV_TEMP=$(mktemp "$PROJECT_DIRECTORY/.env.XXXXXX")
trap 'rm -f "$SQL_FILE" "$ENV_TEMP"' EXIT
chmod 600 "$SQL_FILE" "$ENV_TEMP"

{
  printf "\\set app_database '%s'\n" "$DATABASE_NAME"
  printf "\\set app_role '%s'\n" "$APP_ROLE"
  cat <<'SQL'
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_database', :'app_role')
\gexec

SELECT format('ALTER SCHEMA %I OWNER TO %I', nspname, :'app_role')
FROM pg_namespace
WHERE nspname IN ('public', 'drizzle')
\gexec

SELECT format(
  'ALTER %s %I.%I OWNER TO %I',
  CASE c.relkind
    WHEN 'r' THEN 'TABLE'
    WHEN 'p' THEN 'TABLE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'f' THEN 'FOREIGN TABLE'
  END,
  n.nspname,
  c.relname,
  :'app_role'
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'drizzle')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
\gexec

SELECT format(
  'ALTER FUNCTION %I.%I(%s) OWNER TO %I',
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  :'app_role'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'drizzle')
\gexec

GRANT CONNECT, CREATE, TEMPORARY ON DATABASE :"app_database" TO :"app_role";
GRANT USAGE, CREATE ON SCHEMA public, drizzle TO :"app_role";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, drizzle TO :"app_role";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, drizzle TO :"app_role";
SQL
} > "$SQL_FILE"

sudo -n "$DOCKER_BIN" exec -i ontime-db sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$SQL_FILE"

awk '
  !/^(POSTGRES_APP_USER|POSTGRES_APP_PASSWORD|DATABASE_URL)=/
' "$ENV_FILE" > "$ENV_TEMP"
{
  printf 'DATABASE_URL=postgresql://%s:%s@ontime-db:5432/%s\n' \
    "$APP_ROLE" "$APP_PASSWORD" "$DATABASE_NAME"
} >> "$ENV_TEMP"

chmod 600 "$ENV_TEMP"
mv "$ENV_TEMP" "$ENV_FILE"

sudo -n "$DOCKER_BIN" run --rm \
  --network ontime-data-network \
  -e PGPASSWORD="$APP_PASSWORD" \
  postgres:17.10-alpine \
  psql -h ontime-db -U "$APP_ROLE" -d "$DATABASE_NAME" -v ON_ERROR_STOP=1 \
  -Atc "SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user"

echo "Le compte PostgreSQL unique est configuré pour l'application."
