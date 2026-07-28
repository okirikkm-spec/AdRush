# Деплой AdRush на боевой сервер

Инструкция, как выкатывать изменения на **https://adrush.website** (сервер `176.123.160.115`).

## TL;DR

```bash
# 1. Закоммитить и запушить
git add -A && git commit -m "..." && git push origin main

# 2. Собрать образ ЛОКАЛЬНО
docker compose build app

# 3. Достать jar из образа
docker tag adrproject-app:latest adrush-app:latest
cid=$(docker create adrush-app:latest)
docker cp "$cid:/app/app.jar" "$HOME/Downloads/app.jar"
docker rm "$cid"

# 4. Передать jar на сервер
scp "$HOME/Downloads/app.jar" adrush:/opt/adrush/app.jar

# 5. На сервере: собрать тонкий образ и пересоздать ТОЛЬКО app
ssh adrush 'cd /opt/adrush && \
  rm -rf _thin && mkdir _thin && mv app.jar _thin/app.jar && \
  printf "FROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY app.jar app.jar\nEXPOSE 8080\nENTRYPOINT [\"java\",\"-jar\",\"app.jar\"]\n" > _thin/Dockerfile && \
  docker build -t adrush-app:latest _thin && \
  docker compose up -d --no-build --force-recreate --no-deps app'
```

---

## Почему так, а не `git pull && docker compose up --build` на сервере

У боевого сервера **нестабильная сеть** к внешним реестрам (Docker Hub, npm, Maven Central) и к GitHub — сборка на сервере регулярно зависает или падает (`TLS handshake timeout`, `npm install` висит на 0% CPU, `git fetch` не отвечает). При этом **SSH-канал стабилен**.

Поэтому:
- **собираем образ локально** (где интернет рабочий);
- на сервер шлём **только `app.jar` (~82 МБ)**, а не весь образ (~300 МБ сжатого — при медленном аплинке это ~50 мин);
- на сервере собираем **тонкий образ** из уже скачанного базового `eclipse-temurin:21-jre` (без обращения в интернет).

Тонкий образ идентичен финальной стадии `Dockerfile` (`FROM eclipse-temurin:21-jre` + `COPY app.jar`), поэтому он корректен (в т.ч. `curl` для RedBull-парсера присутствует в базовом образе).

---

## Предусловия (уже настроено)

- **SSH-алиас** `adrush` → `root@176.123.160.115` (ключ `~/.ssh/adrush_key`). Файл `~/.ssh/config`:
  ```
  Host adrush
      HostName 176.123.160.115
      User root
      IdentityFile ~/.ssh/adrush_key
      IdentitiesOnly yes
  ```
- Локально: **Docker Desktop**.
- На сервере: Docker + Compose, каталог `/opt/adrush` (клон репозитория), файл `/opt/adrush/.env` с секретами (БД/JWT/MinIO/админ), nginx + Let's Encrypt.
- **SMTP** (код подтверждения при привязке почты в профиле) — переменные в том же `/opt/adrush/.env`:
  ```
  MAIL_HOST=smtp.yandex.ru      # пусто/не задано → письма не уходят, код пишется в лог
  MAIL_PORT=465
  MAIL_USERNAME=noreply@ваш-домен
  MAIL_PASSWORD=пароль-приложения
  MAIL_FROM=noreply@ваш-домен   # обычно обязан совпадать с MAIL_USERNAME
  MAIL_SSL=true                 # 465 → SSL; для 587 поставь MAIL_SSL=false и MAIL_STARTTLS=true
  MAIL_STARTTLS=false
  ```
  Проверить отправку после деплоя: привязать почту в профиле; при `MAIL_HOST=` код виден в `docker compose logs app`.
- В `/opt/adrush/docker-compose.yml` порты postgres/minio/app привязаны к `127.0.0.1` (локальная правка клона; наружу только 80/443 через nginx).

---

## Пошагово

### Шаг 1. Закоммитить и запушить
```bash
cd ~/Desktop/AdrProject
git add -A
git commit -m "Краткое описание изменений"
git push origin main
```
> Не коммить `redbull_dump.html` (отладочный дамп) — он в рантайме не нужен.

### Шаг 2. Собрать образ локально (это же — проверка компиляции)
```bash
docker compose build app
```
Локальный проект называется `adrproject`, поэтому образ собирается как **`adrproject-app:latest`**.
Если сборка упала — на сервер ничего не ушло, чини и повторяй.

### Шаг 3. Извлечь `app.jar` из образа
```bash
docker tag adrproject-app:latest adrush-app:latest
cid=$(docker create adrush-app:latest)
docker cp "$cid:/app/app.jar" "$HOME/Downloads/app.jar"
docker rm "$cid"
ls -l "$HOME/Downloads/app.jar"   # запомни размер для проверки
```
(Опционально) убедиться, что в jar твой новый код, напр.:
```bash
unzip -p "$HOME/Downloads/app.jar" BOOT-INF/classes/<путь к .class> | grep -c "<строка из изменения>"
```

### Шаг 4. Передать jar на сервер
```bash
scp "$HOME/Downloads/app.jar" adrush:/opt/adrush/app.jar
# Аплинк медленный (~100 КБ/с) → 82 МБ ≈ 13 минут. Это норма, не зависание.
ssh adrush 'stat -c %s /opt/adrush/app.jar'   # сверить размер с шагом 3
```

### Шаг 5. Собрать тонкий образ и пересоздать `app`
```bash
ssh adrush 'set -e
cd /opt/adrush
rm -rf _thin && mkdir _thin && mv app.jar _thin/app.jar
printf "FROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY app.jar app.jar\nEXPOSE 8080\nENTRYPOINT [\"java\",\"-jar\",\"app.jar\"]\n" > _thin/Dockerfile
docker build -t adrush-app:latest _thin
docker compose up -d --no-build --force-recreate --no-deps app'
```
> ⚠️ **Только `--no-deps app`** — пересоздаётся **только контейнер приложения**. `postgres` и `minio` (и их volume с данными) НЕ трогаются. Никогда не делай `docker compose down -v` и не удаляй volume — это сотрёт БД и хранилище.

### Шаг 6. Проверить
```bash
ssh adrush 'cd /opt/adrush
docker compose ps
# дождаться 200
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: adrush.website" http://127.0.0.1:8080/); [ "$c" = 200 ] && { echo OK; break; }; sleep 3; done
docker compose logs app --since 3m | grep -iE "Started AdrenRush|ERROR|Unable to start"
# фронт-бандл (должен смениться после правок фронта)
curl -s -k -H "Host: adrush.website" https://127.0.0.1/ | grep -oE "static/js/main\.[a-z0-9]+\.js" | head -1'
```
Снаружи: открыть **https://adrush.website** (с рабочей сети; локальный аплинк иногда флапает, тогда внешний `curl` даёт 000 — это проблема клиента, не сервера).

---

## Важные нюансы

- **Сохранность данных.** Деплоится только `app`. БД (`postgres-data`) и хранилище (`minio-data`) живут в Docker volume и переживают пересоздание контейнера. Проверка: `docker compose ps` — у `postgres`/`minio` аптайм не сбрасывается.
- **Миграции схемы.** Hibernate `ddl-auto=update` сам добавляет новые таблицы/колонки при старте. ⚠️ Новая **NOT NULL** колонка в уже заполненную таблицу должна иметь `columnDefinition = "... not null default ..."`, иначе старт упадёт. Nullable-колонки добавляются без проблем.
- **Если флапнул `git push`/`git fetch`** (сеть сервера к GitHub) — код на сервер можно доставить bundle'ом, минуя GitHub:
  ```bash
  git bundle create /tmp/adrush.bundle main
  scp /tmp/adrush.bundle adrush:/tmp/
  ssh adrush 'cd /opt/adrush && git fetch /tmp/adrush.bundle main && git reset --hard FETCH_HEAD'
  ```
  (для деплоя jar это не требуется — jar самодостаточен).
- **Если завис билд на сервере** (legacy-путь) — не повторяй `docker compose up --build` на сервере; пользуйся методом из этой инструкции (сборка локально + jar).

---

## Доступы и факты о сервере

- Сайт: **https://adrush.website** (+ `www`), сервер `176.123.160.115`, Ubuntu 22.04.
- Провайдер: Cloud.ru (OpenStack). Security group `SSH-access_ru.AZ-1`: открыты 22/80/443.
- На сервере: nginx (reverse-proxy на `127.0.0.1:8080`) + Let's Encrypt (автопродление), Docker Compose (postgres + minio + app), каталог `/opt/adrush`.
- Логи приложения: `ssh adrush 'cd /opt/adrush && docker compose logs -f app'`.
