#!/usr/bin/env bash
# Выполняется на сервере сценарием deploy.ps1: собирает Docker-образ из присланной сборки
# и пересоздаёт контейнер. Если задан домен, рядом поднимается Caddy с HTTPS.
set -euo pipefail

APP_DIR=${1:?каталог приложения}
NAME=${2:?имя контейнера}
PORT=${3:?порт}
TAG=${4:?метка образа}
# «-» вместо пустого значения: пустой аргумент по пути через ssh теряется.
DOMAIN=${5:--}
if [ "$DOMAIN" = "-" ]; then DOMAIN=""; fi
# Через запятую: домены с тем же сайтом и домены, перенаправляющие на основной.
ALIASES=${6:--}
if [ "$ALIASES" = "-" ]; then ALIASES=""; fi
REDIRECTS=${7:--}
if [ "$REDIRECTS" = "-" ]; then REDIRECTS=""; fi
# public — сайт открыт всем, пароль снимается; password — пароль как раньше.
ACCESS=${8:-password}

SRC=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$APP_DIR/.env"
NETWORK="$NAME-net"
CADDY="$NAME-caddy"
CADDY_DIR="$APP_DIR/caddy"
# Пользователь node внутри образа node:alpine.
CONTAINER_UID=1000

# Временный каталог с присланной сборкой (и паролем) убираем при любом исходе.
trap 'rm -rf "$SRC"' EXIT

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "На сервере не найден Docker." >&2
  exit 1
fi
# Пользователю из группы docker sudo для него не нужен.
if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="$SUDO docker"; fi

$SUDO mkdir -p "$APP_DIR/data"
$SUDO chown -R "$CONTAINER_UID:$CONTAINER_UID" "$APP_DIR/data"

write_env() {
  # Меняем только логин и пароль: прочие настройки, вписанные в файл вручную, остаются.
  local rest=""
  if [ -f "$ENV_FILE" ]; then rest=$($SUDO grep -vE '^(AUTH_USER|AUTH_PASSWORD)=' "$ENV_FILE" || true); fi
  {
    printf 'AUTH_USER=loot\nAUTH_PASSWORD=%s\n' "$1"
    if [ -n "$rest" ]; then printf '%s\n' "$rest"; fi
  } | $SUDO tee "$ENV_FILE" >/dev/null
  # Файл читает docker-клиент от имени того, кто деплоит, поэтому владелец — он.
  $SUDO chown "$(id -u):$(id -g)" "$ENV_FILE"
  $SUDO chmod 600 "$ENV_FILE"
}

if [ "$ACCESS" = "public" ]; then
  write_env ""
  echo "Пароль снят: сайт открыт всем."
elif [ -f "$SRC/password.txt" ]; then
  # Пароль задан в deploy.config.json — он главнее того, что лежит на сервере.
  write_env "$(tr -d '\r\n' <"$SRC/password.txt")"
  echo "Пароль взят из deploy.config.json (логин loot)."
elif [ ! -f "$ENV_FILE" ]; then
  PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  write_env "$PASSWORD"
  echo
  echo "==============================================================="
  echo " Создан файл настроек $ENV_FILE"
  echo " Логин:  loot"
  echo " Пароль: $PASSWORD"
  echo " Запишите пароль: больше он показан не будет."
  echo "==============================================================="
  echo
fi

if [ -f "$SRC/env.txt" ]; then
  # Переменные из deploy.config.json: заменяем одноимённые в .env, остальные строки не трогаем.
  KEYS=$(cut -d= -f1 "$SRC/env.txt" | paste -sd'|' -)
  REST=$($SUDO grep -vE "^($KEYS)=" "$ENV_FILE" 2>/dev/null || true)
  { if [ -n "$REST" ]; then printf '%s\n' "$REST"; fi; cat "$SRC/env.txt"; } | $SUDO tee "$ENV_FILE" >/dev/null
  $SUDO chown "$(id -u):$(id -g)" "$ENV_FILE"
  $SUDO chmod 600 "$ENV_FILE"
  echo "Переменные окружения обновлены: ${KEYS//|/, }."
fi

tar -xzf "$SRC/release.tar.gz" -C "$SRC"
$DOCKER build --quiet -t "$NAME:$TAG" -f "$SRC/release.Dockerfile" "$SRC" >/dev/null
echo "Собран образ $NAME:$TAG"

# Общая сеть, чтобы Caddy обращался к приложению, а приложение к базе по имени контейнера.
$DOCKER network inspect "$NETWORK" >/dev/null 2>&1 || $DOCKER network create "$NETWORK" >/dev/null

# --- База данных: Postgres в своём контейнере, наружу не публикуется — к ней ходит только приложение.
DB="$NAME-db"
DB_DIR="$APP_DIR/postgres"
DB_ENV="$APP_DIR/db.env"
if [ ! -f "$DB_ENV" ]; then
  # Пароль создаётся один раз; hex — чтобы без экранирования вставлять в адрес базы.
  DB_PASSWORD=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'POSTGRES_USER=loot\nPOSTGRES_DB=loot\nPOSTGRES_PASSWORD=%s\n' "$DB_PASSWORD" | $SUDO tee "$DB_ENV" >/dev/null
  $SUDO chown "$(id -u):$(id -g)" "$DB_ENV"
  $SUDO chmod 600 "$DB_ENV"
  echo "Создан пароль базы данных: $DB_ENV"
fi
DB_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$DB_ENV" | cut -d= -f2-)
if [ "$($DOCKER inspect -f '{{.State.Running}}' "$DB" 2>/dev/null || true)" != "true" ]; then
  $DOCKER rm -f "$DB" >/dev/null 2>&1 || true
  $SUDO mkdir -p "$DB_DIR"
  # Настройки под маленький сервер: памяти на всё 2 ГБ.
  $DOCKER run -d --name "$DB" --restart unless-stopped --network "$NETWORK" \
    --env-file "$DB_ENV" -v "$DB_DIR:/var/lib/postgresql/data" \
    postgres:17-alpine -c shared_buffers=64MB -c max_connections=30 >/dev/null
  echo "Запущен Postgres ($DB), данные — в $DB_DIR"
fi
for _ in $(seq 30); do
  if $DOCKER exec "$DB" pg_isready -h 127.0.0.1 -U loot -d loot >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! $DOCKER exec "$DB" pg_isready -h 127.0.0.1 -U loot -d loot >/dev/null 2>&1; then
  echo "База данных не запустилась. Последние строки журнала:" >&2
  $DOCKER logs --tail 20 "$DB" >&2 || true
  exit 1
fi
# Адрес базы — в настройки приложения (одноимённую строку заменяем, остальные не трогаем).
REST=$($SUDO grep -v '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null || true)
{ if [ -n "$REST" ]; then printf '%s\n' "$REST"; fi; printf 'DATABASE_URL=postgres://loot:%s@%s:5432/loot\n' "$DB_PASSWORD" "$DB"; } | $SUDO tee "$ENV_FILE" >/dev/null
$SUDO chmod 600 "$ENV_FILE"

# --- Резервные копии базы: каждый день в 03:30 UTC, хранятся последние 14.
BACKUP_DIR="$APP_DIR/backups"
$SUDO mkdir -p "$BACKUP_DIR"
$SUDO chmod 700 "$BACKUP_DIR"
cat <<BACKUP | $SUDO tee "$APP_DIR/backup.sh" >/dev/null
#!/usr/bin/env bash
# Создан remote-install.sh. Резервная копия базы: pg_dump, сжатый gzip; старше 14 последних — удаляются.
# Восстановить: gunzip -c файл.sql.gz | docker exec -i $DB psql -U loot -d loot
set -euo pipefail
FILE="$BACKUP_DIR/loot-\$(date -u +%Y%m%d-%H%M).sql.gz"
docker exec $DB pg_dump -U loot --clean --if-exists loot | gzip > "\$FILE.tmp"
mv "\$FILE.tmp" "\$FILE"
ls -1t "$BACKUP_DIR"/loot-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "\$(date -u '+%F %T') \$FILE \$(du -h "\$FILE" | cut -f1)"
BACKUP
$SUDO chmod 700 "$APP_DIR/backup.sh"
printf '30 3 * * * root %s >> %s 2>&1\n' "$APP_DIR/backup.sh" "$BACKUP_DIR/backup.log" | $SUDO tee "/etc/cron.d/$NAME-backup" >/dev/null
$SUDO chmod 644 "/etc/cron.d/$NAME-backup"

# С доменом приложение наружу напрямую не публикуется: иначе пароль можно было бы отправить мимо HTTPS.
if [ -n "$DOMAIN" ]; then PUBLISH="127.0.0.1:$PORT:8080"; else PUBLISH="$PORT:8080"; fi

run_container() {
  $DOCKER rm -f "$NAME" >/dev/null 2>&1 || true
  $DOCKER run -d --name "$NAME" --restart unless-stopped --network "$NETWORK" \
    -p "$PUBLISH" --env-file "$ENV_FILE" -v "$APP_DIR/data:/app/data" "$1" >/dev/null
}

# Запрос из контейнера приложения: так не нужен curl на сервере. Годится любой ответ 200 или 401.
responds() {
  $DOCKER exec "$NAME" node -e \
    "fetch('$1').then(r=>process.exit(r.status===200||r.status===401?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1
}

wait_for() {
  local url=$1 attempts=$2
  for _ in $(seq "$attempts"); do
    sleep 1
    if responds "$url"; then return 0; fi
  done
  return 1
}

PREVIOUS=$($DOCKER inspect -f '{{.Image}}' "$NAME" 2>/dev/null || true)
run_container "$NAME:$TAG"

if ! wait_for "http://127.0.0.1:8080/" 10; then
  echo "Новая версия не отвечает. Последние строки журнала:" >&2
  $DOCKER logs --tail 20 "$NAME" >&2 || true
  if [ -n "$PREVIOUS" ]; then
    echo "Возвращаю предыдущую версию." >&2
    run_container "$PREVIOUS"
  fi
  exit 1
fi

# Оставляем текущий образ и один предыдущий (на случай ручного отката), остальные удаляем.
# grep без совпадений (других образов ещё нет) возвращает 1 — это не ошибка.
$DOCKER images "$NAME" --format '{{.Tag}}' | { grep -vx "$TAG" || true; } | tail -n +2 | while read -r old; do
  $DOCKER rmi "$NAME:$old" >/dev/null 2>&1 || true
done

if [ -z "$DOMAIN" ]; then
  $DOCKER rm -f "$CADDY" >/dev/null 2>&1 || true
  echo "Готово: http://<адрес-сервера>:$PORT (без HTTPS — пароль передаётся в открытом виде)."
  exit 0
fi

SITES="$DOMAIN"
if [ -n "$ALIASES" ]; then SITES="$SITES, ${ALIASES//,/, }"; fi
CADDYFILE=$(printf '%s {\n\tencode gzip\n\treverse_proxy %s:8080\n}\n' "$SITES" "$NAME")
if [ -n "$REDIRECTS" ]; then
  # Путь и параметры сохраняются; #-часть адреса браузер переносит сам.
  CADDYFILE="$CADDYFILE
$(printf '%s {\n\tredir https://%s{uri} permanent\n}\n' "${REDIRECTS//,/, }" "$DOMAIN")"
fi
CADDY_RUNNING=$($DOCKER inspect -f '{{.State.Running}}' "$CADDY" 2>/dev/null || true)
# Caddy не трогаем, если он работает с теми же настройками: сертификат и соединения остаются на месте.
if [ "$CADDY_RUNNING" != "true" ] || [ "$CADDYFILE" != "$($SUDO cat "$CADDY_DIR/Caddyfile" 2>/dev/null || true)" ]; then
  $SUDO mkdir -p "$CADDY_DIR/data" "$CADDY_DIR/config"
  printf '%s\n' "$CADDYFILE" | $SUDO tee "$CADDY_DIR/Caddyfile" >/dev/null
  $DOCKER rm -f "$CADDY" >/dev/null 2>&1 || true
  # Сертификаты лежат в caddy/data и переживают пересоздание контейнера.
  $DOCKER run -d --name "$CADDY" --restart unless-stopped --network "$NETWORK" \
    -p 80:80 -p 443:443 -p 443:443/udp \
    -v "$CADDY_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$CADDY_DIR/data:/data" -v "$CADDY_DIR/config:/config" \
    caddy:2-alpine >/dev/null
  echo "Запущен Caddy для $DOMAIN; получение сертификата занимает до минуты."
fi

if wait_for "https://$DOMAIN/" 60; then
  echo "Готово: https://$DOMAIN"
else
  # Приложение уже работает, поэтому это предупреждение, а не провал деплоя.
  echo
  echo "ВНИМАНИЕ: https://$DOMAIN пока не отвечает. Приложение запущено, но сертификат не получен."
  echo "Проверьте, что DNS-запись домена указывает на этот сервер и порты 80 и 443 открыты."
  echo "Последние строки журнала Caddy:"
  $DOCKER logs --tail 15 "$CADDY" 2>&1 || true
fi
