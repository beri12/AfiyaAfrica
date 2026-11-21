#!/usr/bin/env bash
# Encrypted PostgreSQL backup.
#   BACKUP_PASSPHRASE_FILE=/secure/backup.pass ./scripts/backup.sh [output-dir]
# Produces a custom-format pg_dump, encrypted with AES-256 (openssl, PBKDF2), plus a SHA-256 checksum.
# Schedule via cron/systemd (e.g. daily 01:30) and copy to off-site storage. See docs/deployment.md.
set -euo pipefail
OUT_DIR="${1:-./backups}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:?Set BACKUP_PASSPHRASE_FILE to a file containing the encryption passphrase}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
COMPOSE="${COMPOSE:-docker compose}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/afyalink-$STAMP.dump.enc"

$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS_FILE" -out "$FILE"

sha256sum "$FILE" > "$FILE.sha256"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
find "$OUT_DIR" -name 'afyalink-*.dump.enc*' -mtime "+$RETENTION_DAYS" -print -delete
