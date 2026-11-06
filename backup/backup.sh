#!/bin/sh
# Backup notturno (03:00 UTC) di tutti i volumi Docker nominati -> ./backups/<timestamp>/<volume>.tgz, tiene gli ultimi 7.
# Esegui subito:  docker exec volume_backup /backup.sh now
set -u
backup() {
  ts=$(date +%Y%m%d-%H%M%S); mkdir -p "/backups/$ts"
  for v in $(docker volume ls -q | grep -vE '^[0-9a-f]{64}$'); do
    case "$v" in *_cache|buildx*) continue;; esac
    if docker run --rm -v "$v":/v:ro -v "$BACKUP_HOST_DIR/$ts":/b alpine:3 tar czf "/b/$v.tgz" -C /v . 2>/dev/null; then echo "ok   $v"; else echo "FAIL $v"; fi
  done
  ls -1dt /backups/*/ 2>/dev/null | tail -n +8 | xargs -r rm -rf
  echo "backup $ts completato"
}
if [ "${1:-}" = "now" ]; then backup; exit 0; fi
echo "in attesa delle 03:00 UTC..."
while true; do
  if [ "$(date +%H)" = "03" ] && [ ! -f "/tmp/done-$(date +%F)" ]; then backup && touch "/tmp/done-$(date +%F)"; fi
  sleep 300
done
