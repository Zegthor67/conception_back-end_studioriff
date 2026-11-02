#!/usr/bin/env bash
# Usage : ./backup.sh
# Crée une sauvegarde de la base dans backups/ et supprime celles de plus de 30 jours.
set -euo pipefail

set -a
source <(tr -d '\r' < .env)
set +a

RETENTION_DAYS=30
mkdir -p backups
FILE="backups/${POSTGRES_DB}_$(date -u +%Y%m%d_%H%M%S).dump"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$FILE"
echo "Sauvegarde créée : $FILE ($(wc -c < "$FILE") octets)"

find backups -name '*.dump' -mtime +"$RETENTION_DAYS" -print -delete
