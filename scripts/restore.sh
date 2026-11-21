#!/usr/bin/env bash
# Restore an encrypted backup into the compose PostgreSQL service.
#   BACKUP_PASSPHRASE_FILE=/secure/backup.pass ./scripts/restore.sh backups/afyalink-XXXX.dump.enc
# WARNING: replaces the current database contents. Stop the api service first:  docker compose stop api
set -euo pipefail
FILE="${1:?Usage: restore.sh <backup.dump.enc>}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE}"
COMPOSE="${COMPOSE:-docker compose}"
if [[ -f "$FILE.sha256" ]]; then sha256sum -c "$FILE.sha256"; fi
if [[ "${CONFIRM:-}" != "yes" ]]; then
  read -r -p "This will OVERWRITE the database. Type 'yes' to continue: " ans
  [[ "$ans" == "yes" ]] || { echo "Aborted"; exit 1; }
fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$PASS_FILE" -in "$FILE" \
  | $COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction'
echo "Restore complete. Start the API again: $COMPOSE start api"
