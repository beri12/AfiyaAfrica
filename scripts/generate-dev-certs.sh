#!/usr/bin/env bash
# Self-signed certificate for local/staging use ONLY. Use real certificates (e.g. Let's Encrypt) in production.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/infrastructure/nginx/certs"
mkdir -p "$DIR"
if [[ -f "$DIR/fullchain.pem" ]]; then echo "Certificates already exist in $DIR"; exit 0; fi
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/privkey.pem" -out "$DIR/fullchain.pem" \
  -subj "/CN=${1:-localhost}" -addext "subjectAltName=DNS:${1:-localhost}"
chmod 600 "$DIR/privkey.pem"
echo "Self-signed certificate written to $DIR"
