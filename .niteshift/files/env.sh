# Shared shell environment for PostHog's dev processes.
#
# Sourced by .niteshift/setup and by every service in .niteshift/services.yaml, so
# they all see the same interpreter, toolchain, and repository defaults.

_NS_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PATH="/opt/node-$(cat "$_NS_REPO_ROOT/.nvmrc")/bin:$PATH"
# shellcheck disable=SC1091
source "$_NS_REPO_ROOT/.venv/bin/activate"

# Precedence matches bin/start: shell env > .env.local > .env.development > .env.services.
# op:// references are skipped rather than exported as literal garbage.
_ns_load_env_file() {
    [ -f "$1" ] || return 0
    while IFS='=' read -r name value; do
        [[ -z "$name" || "$name" == \#* ]] && continue
        [[ "$value" == *op://* ]] && continue
        if [[ -z "${!name:-}" ]]; then
            export "$name=$value"
        fi
    done < "$1"
    return 0
}
_ns_load_env_file "$_NS_REPO_ROOT/.env.local"
_ns_load_env_file "$_NS_REPO_ROOT/.env.development"
_ns_load_env_file "$_NS_REPO_ROOT/.env.services"

export COMPOSE_PROJECT_NAME=posthog
export DAGSTER_HOME="$_NS_REPO_ROOT/.dagster_home"

# Persons DB URLs need shell expansion, so bin/start computes them too.
export PERSONS_DATABASE_URL="${PERSONS_DATABASE_URL:-postgres://posthog:posthog@${PGHOST:-db}:${PGPORT:-5432}/posthog_persons}"
export PERSONS_READONLY_DATABASE_URL="${PERSONS_READONLY_DATABASE_URL:-$PERSONS_DATABASE_URL}"
export PERSONS_DB_WRITER_URL="${PERSONS_DB_WRITER_URL:-$PERSONS_DATABASE_URL}"
export PERSONS_DB_READER_URL="${PERSONS_DB_READER_URL:-$PERSONS_READONLY_DATABASE_URL}"

# The browser reaches the stack through the Caddy front door on 8010, never localhost:8234.
export NS_PUBLIC_ORIGIN="${NITESHIFT_PORT_8010_URL:-http://localhost:8010}"
