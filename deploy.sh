#!/usr/bin/env bash
# Деплой AdRush: собирает образ ЛОКАЛЬНО и выкатывает только app.jar на сервер
# (у сервера флапает сеть к Docker Hub/npm/Maven — собирать на нём ненадёжно).
#
# Запуск из Git Bash, из корня проекта:
#   bash deploy.sh "сообщение коммита"   — закоммитить+запушить, собрать и выкатить
#   bash deploy.sh                        — без коммита: просто собрать текущий код и выкатить
#
# ВАЖНО: пересоздаётся только контейнер app. postgres/minio (БД и хранилище) НЕ трогаются.

set -euo pipefail

cd "$(dirname "$0")"
JAR="$HOME/Downloads/app.jar"
MSG="${1:-}"

echo "==> 1/6 git"
if [ -n "$MSG" ]; then
  git add -A
  git reset -q -- redbull_dump.html 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "    нет изменений для коммита"
  else
    git commit -m "$MSG"
    git push origin main
  fi
else
  echo "    без коммита (сообщение не передано)"
fi

echo "==> 2/6 локальная сборка образа (она же проверка компиляции)"
docker compose build app

echo "==> 3/6 извлечение app.jar из образа"
docker tag adrproject-app:latest adrush-app:latest
cid=$(docker create adrush-app:latest)
docker cp "$cid:/app/app.jar" "$JAR"
docker rm "$cid" >/dev/null
SIZE=$(stat -c %s "$JAR")
echo "    jar: $SIZE байт"

echo "==> 4/6 передача на сервер (медленный аплинк — может занять ~10-13 мин)"
scp -o ServerAliveInterval=30 "$JAR" adrush:/opt/adrush/app.jar

echo "==> 5/6 сборка тонкого образа на сервере + пересоздание ТОЛЬКО app"
ssh adrush bash -s -- "$SIZE" <<'REMOTE'
set -e
cd /opt/adrush
[ "$(stat -c %s app.jar)" = "$1" ] || { echo "    размер jar на сервере не совпал — передача неполная"; exit 1; }
rm -rf _thin && mkdir _thin && mv app.jar _thin/app.jar
cat > _thin/Dockerfile <<'EOF'
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
EOF
docker build -t adrush-app:latest _thin >/dev/null
docker compose up -d --no-build --force-recreate --no-deps app
REMOTE

echo "==> 6/6 проверка (ждём HTTP 200)"
ssh adrush 'for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: adrush.website" http://127.0.0.1:8080/ 2>/dev/null || echo 000); if [ "$c" = 200 ]; then echo "    OK: сайт отвечает 200"; break; fi; sleep 3; done; docker compose -f /opt/adrush/docker-compose.yml ps --format "{{.Name}} {{.Status}}"'

echo ""
echo "Готово. Открой https://adrush.website"
