#!/usr/bin/env bash
# Выполняется на сервере сценарием deploy.ps1: собирает Docker-образ из присланной сборки
# и пересоздаёт контейнер. При первом запуске создаёт файл настроек с паролем.
set -euo pipefail

APP_DIR=${1:?каталог приложения}
NAME=${2:?имя контейнера}
PORT=${3:?порт}
TAG=${4:?метка образа}
SRC=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$APP_DIR/.env"
# Пользователь node внутри образа node:alpine.
CONTAINER_UID=1000

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "На сервере не найден Docker." >&2
  exit 1
fi
# Пользователю из группы docker sudo для него не нужен.
if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="$SUDO docker"; fi

$SUDO mkdir -p "$APP_DIR/data"
$SUDO chown -R "$CONTAINER_UID:$CONTAINER_UID" "$APP_DIR/data"

if [ ! -f "$ENV_FILE" ]; then
  PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  printf 'AUTH_USER=loot\nAUTH_PASSWORD=%s\n' "$PASSWORD" | $SUDO tee "$ENV_FILE" >/dev/null
  # Файл читает docker-клиент от имени того, кто деплоит, поэтому владелец — он.
  $SUDO chown "$(id -u):$(id -g)" "$ENV_FILE"
  $SUDO chmod 600 "$ENV_FILE"
  echo
  echo "==============================================================="
  echo " Создан файл настроек $ENV_FILE"
  echo " Логин:  loot"
  echo " Пароль: $PASSWORD"
  echo " Запишите пароль: больше он показан не будет."
  echo "==============================================================="
  echo
fi

tar -xzf "$SRC/release.tar.gz" -C "$SRC"
$DOCKER build --quiet -t "$NAME:$TAG" -f "$SRC/release.Dockerfile" "$SRC" >/dev/null
echo "Собран образ $NAME:$TAG"

run_container() {
  $DOCKER rm -f "$NAME" >/dev/null 2>&1 || true
  $DOCKER run -d --name "$NAME" --restart unless-stopped \
    -p "$PORT:8080" --env-file "$ENV_FILE" -v "$APP_DIR/data:/app/data" "$1" >/dev/null
}

# Проверяем изнутри контейнера: так не нужен curl на сервере и не мешает файрвол.
is_healthy() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if $DOCKER exec "$NAME" node -e \
      "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.status===200||r.status===401?0:1),()=>process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

PREVIOUS=$($DOCKER inspect -f '{{.Image}}' "$NAME" 2>/dev/null || true)
run_container "$NAME:$TAG"

if ! is_healthy; then
  echo "Новая версия не отвечает. Последние строки журнала:" >&2
  $DOCKER logs --tail 20 "$NAME" >&2 || true
  if [ -n "$PREVIOUS" ]; then
    echo "Возвращаю предыдущую версию." >&2
    run_container "$PREVIOUS"
  fi
  rm -rf "$SRC"
  exit 1
fi

# Оставляем текущий образ и один предыдущий (на случай ручного отката), остальные удаляем.
$DOCKER images "$NAME" --format '{{.Tag}}' | grep -vx "$TAG" | tail -n +2 | while read -r old; do
  $DOCKER rmi "$NAME:$old" >/dev/null 2>&1 || true
done

rm -rf "$SRC"
echo "Готово: контейнер $NAME работает на порту $PORT."
