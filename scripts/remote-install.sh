#!/usr/bin/env bash
# Выполняется на сервере сценарием deploy.ps1: ставит новую сборку и перезапускает службу.
# При первом запуске создаёт пользователя, файл настроек с паролем и службу systemd.
set -euo pipefail

APP_DIR=${1:?каталог приложения}
SERVICE=${2:?имя службы}
PORT=${3:?порт}
SRC=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$APP_DIR/.env"
UNIT_FILE="/etc/systemd/system/$SERVICE.service"

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

NODE=$(command -v node || true)
if [ -z "$NODE" ]; then
  echo "На сервере не найден Node.js. Установите версию 20 или новее и запустите деплой снова." >&2
  exit 1
fi
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "На сервере Node.js $NODE_MAJOR, нужен 20 или новее." >&2
  exit 1
fi

if ! id "$SERVICE" >/dev/null 2>&1; then
  echo "Создаю пользователя $SERVICE"
  $SUDO useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE"
fi

$SUDO mkdir -p "$APP_DIR/data"

if ! $SUDO test -f "$ENV_FILE"; then
  PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  printf 'HOST=0.0.0.0\nPORT=%s\nAUTH_USER=loot\nAUTH_PASSWORD=%s\nDATA_DIR=%s/data\n' "$PORT" "$PASSWORD" "$APP_DIR" |
    $SUDO tee "$ENV_FILE" >/dev/null
  echo
  echo "==============================================================="
  echo " Создан файл настроек $ENV_FILE"
  echo " Логин:  loot"
  echo " Пароль: $PASSWORD"
  echo " Запишите пароль: больше он показан не будет."
  echo "==============================================================="
  echo
fi
$SUDO chown "root:$SERVICE" "$ENV_FILE"
$SUDO chmod 640 "$ENV_FILE"

# Распаковываем рядом и подменяем каталоги уже готовыми, чтобы служба не увидела половину сборки.
$SUDO rm -rf "$APP_DIR/release.new"
$SUDO mkdir "$APP_DIR/release.new"
$SUDO tar -xzf "$SRC/release.tar.gz" -C "$APP_DIR/release.new"
for dir in dist dist-server; do
  $SUDO rm -rf "$APP_DIR/$dir.old"
  if $SUDO test -d "$APP_DIR/$dir"; then $SUDO mv "$APP_DIR/$dir" "$APP_DIR/$dir.old"; fi
  $SUDO mv "$APP_DIR/release.new/$dir" "$APP_DIR/$dir"
done
$SUDO rm -rf "$APP_DIR/release.new"
$SUDO chown -R "$SERVICE:$SERVICE" "$APP_DIR/data"

$SUDO tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Loot filter editor
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE dist-server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

$SUDO systemctl daemon-reload
$SUDO systemctl enable "$SERVICE" >/dev/null 2>&1
$SUDO systemctl restart "$SERVICE"

# Порт берём из файла настроек: на сервере его могли поменять после первой установки.
ACTUAL_PORT=$($SUDO sed -n 's/^PORT=//p' "$ENV_FILE")
STATUS=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  STATUS=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${ACTUAL_PORT:-$PORT}/" || true)
  if [ "$STATUS" = 200 ] || [ "$STATUS" = 401 ]; then break; fi
done

rm -rf "$SRC"

if [ "$STATUS" != 200 ] && [ "$STATUS" != 401 ]; then
  echo "Служба не отвечает (код $STATUS). Последние строки журнала:" >&2
  $SUDO journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
  exit 1
fi
echo "Готово: служба $SERVICE работает на порту ${ACTUAL_PORT:-$PORT}."
