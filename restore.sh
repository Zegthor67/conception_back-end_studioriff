#!/usr/bin/env bash
# Usage : ./restore.sh backups/fichier.dump [base_cible]
# Restaure la sauvegarde dans une NOUVELLE base (studio_riff_restore par défaut),
# puis compare le nombre de lignes avec la base d'origine.
set -euo pipefail

set -a
source <(tr -d '\r' < .env)
set +a

FILE="${1:?Usage : ./restore.sh backups/fichier.dump [base_cible]}"
TARGET="${2:-studio_riff_restore}"

if [ "$TARGET" = "$POSTGRES_DB" ]; then
  echo "Refusé : on ne restaure pas dans la base d'origine ($POSTGRES_DB)"
  exit 1
fi

docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$TARGET"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$TARGET"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$TARGET" --no-owner < "$FILE"
echo "Sauvegarde $FILE restaurée dans la base $TARGET"
echo

count() {
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$1" -tAc "SELECT count(*) FROM $2"
}

printf "%-20s %12s %12s\n" "table" "$POSTGRES_DB" "$TARGET"
for table in rooms room_maintenances members bookings schema_migrations; do
  printf "%-20s %12s %12s\n" "$table" "$(count "$POSTGRES_DB" "$table")" "$(count "$TARGET" "$table")"
done
