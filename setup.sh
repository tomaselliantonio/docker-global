#!/usr/bin/env bash
# Primo avvio / provisioning dei servizi di docker-global. Si può rilanciare: non rifà ciò che esiste già.
#   ./setup.sh
# Crea .env con segreti casuali, avvia tutto, crea gli account locali (Gitea, n8n, Beszel, Memos),
# configura runner Gitea Actions e agente Beszel. Le credenziali finiscono in credentials.txt (non versionato).
set -euo pipefail
cd "$(dirname "$0")"

CRED=credentials.txt
rnd() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-"${1:-24}"; }
getv() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }
setv() { # setv NOME VALORE  (aggiorna o aggiunge in .env)
  if grep -qE "^$1=" .env; then sed -i.bak -E "s#^$1=.*#$1=$2#" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi
}
note() { umask 177; echo "$*" >> "$CRED"; }
wait_http() { # wait_http host [secondi]
  for _ in $(seq 1 "${2:-60}"); do
    c=$(curl -s -o /dev/null -m 3 -w '%{http_code}' -H "Host: $1" http://127.0.0.1/ || true)
    [ "$c" != "000" ] && [ "$c" != "404" ] && [ "$c" != "502" ] && [ "$c" != "503" ] && return 0
    sleep 2
  done
  echo "!! $1 non risponde"; return 1
}

echo "== .env"
[ -f .env ] || cp .env.example .env
umask 177
[ -n "$(getv MINIO_ROOT_USER)" ]     || setv MINIO_ROOT_USER dev
[ -n "$(getv MINIO_ROOT_PASSWORD)" ] || { setv MINIO_ROOT_PASSWORD "$(rnd)"; }
[ -n "$(getv LINKDING_PASSWORD)" ]   || setv LINKDING_PASSWORD "$(rnd)"
[ -n "$(getv CONVERTX_JWT)" ]        || setv CONVERTX_JWT "$(rnd)"
[ -n "$(getv BESZEL_PASSWORD)" ]     || setv BESZEL_PASSWORD "Aa1$(rnd 16)"
setv BACKUP_HOST_DIR "$PWD/backups"
mkdir -p backups
[ -f "$CRED" ] || { umask 177; echo "# Credenziali locali (solo http://*.localhost) — NON committare" > "$CRED"; }
if ! grep -q '^minio ' "$CRED"; then
  note "minio     http://minio.localhost   utente: $(getv MINIO_ROOT_USER)   password: $(getv MINIO_ROOT_PASSWORD)   (S3: http://s3.localhost)"
  note "linkding  http://links.localhost   utente: dev   password: $(getv LINKDING_PASSWORD)   (login automatico via Traefik)"
  note "beszel    http://beszel.localhost  email: dev@docker.localhost   password: $(getv BESZEL_PASSWORD)   (login automatico)"
fi

echo "== rete + servizi"
docker network inspect web_network >/dev/null 2>&1 || docker network create web_network >/dev/null
docker compose up -d --build

echo "== gitea (utente dev, login automatico via Traefik)"
wait_http git.localhost
if ! docker exec -u git gitea gitea admin user list 2>/dev/null | grep -qw dev; then
  GP=$(rnd 20)
  docker exec -u git gitea gitea admin user create --admin --username dev --email dev@docker.localhost --password "$GP" --must-change-password=false >/dev/null
  note "gitea     http://git.localhost     utente: dev   password: $GP   (di solito non serve: login automatico)"
fi
if [ -z "$(getv GITEA_RUNNER_TOKEN)" ]; then
  setv GITEA_RUNNER_TOKEN "$(docker exec -u git gitea gitea actions generate-runner-token | tail -1)"
fi

echo "== n8n (proprietario)"
wait_http n8n.localhost
if ! grep -q '^n8n ' "$CRED"; then
  NP="Aa1$(rnd 16)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Host: n8n.localhost' -H 'Content-Type: application/json' \
    http://127.0.0.1/rest/owner/setup -d "{\"email\":\"admin@docker.localhost\",\"firstName\":\"Dev\",\"lastName\":\"Local\",\"password\":\"$NP\"}")
  if [ "$code" = "200" ]; then note "n8n      http://n8n.localhost     email: admin@docker.localhost   password: $NP   (sessione di 1 anno)"
  else echo "   n8n: proprietario già presente o setup non riuscito (HTTP $code), salto"; fi
fi

echo "== memos (admin)"
wait_http memos.localhost
if ! grep -q '^memos ' "$CRED"; then
  MP="Aa1$(rnd 16)"
  if curl -s -m 10 -X POST -H 'Host: memos.localhost' -H 'Content-Type: application/json' http://127.0.0.1/api/users \
       -d "{\"username\":\"dev\",\"password\":\"$MP\"}" | grep -q '"username":"dev"'; then
    note "memos     http://memos.localhost   utente: dev   password: $MP"
  else echo "   memos: utente già presente o API cambiata, crealo dalla UI"; fi
fi

echo "== beszel (utente, sistema, chiave agente)"
wait_http beszel.localhost
if [ -z "$(getv BESZEL_KEY)" ]; then
  BP=$(getv BESZEL_PASSWORD)
  docker exec beszel /beszel superuser upsert dev@docker.localhost "$BP" >/dev/null
  api() { curl -s -H 'Host: beszel.localhost' -H 'Content-Type: application/json' "$@"; }
  TKN=$(api -X POST http://127.0.0.1/api/collections/_superusers/auth-with-password \
        -d "{\"identity\":\"dev@docker.localhost\",\"password\":\"$BP\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  KEY=$(api -H "Authorization: $TKN" http://127.0.0.1/api/beszel/getkey | python3 -c "import sys,json;print(json.load(sys.stdin)['key'])")
  UID_=$(api -H "Authorization: $TKN" -X POST http://127.0.0.1/api/collections/users/records \
        -d "{\"email\":\"dev@docker.localhost\",\"password\":\"$BP\",\"passwordConfirm\":\"$BP\",\"emailVisibility\":true,\"verified\":true,\"username\":\"dev\",\"role\":\"admin\"}" \
        | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  api -H "Authorization: $TKN" -X POST http://127.0.0.1/api/collections/systems/records \
        -d "{\"name\":\"docker\",\"host\":\"beszel-agent\",\"port\":\"45876\",\"users\":[\"$UID_\"]}" >/dev/null
  setv BESZEL_KEY "$KEY"
  docker compose restart beszel >/dev/null   # rilegge AUTO_LOGIN ora che l'utente esiste
fi

echo "== runner Gitea Actions + agente Beszel"
setv COMPOSE_PROFILES provision
docker compose up -d

echo
echo "Fatto. Dashboard: http://homepage.localhost"
echo "Credenziali: $CRED   (Vaultwarden: crea tu l'account su http://vault.localhost, poi imposta SIGNUPS_ALLOWED=false)"
