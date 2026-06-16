# Шаг 1: сборка React-фронтенда
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
# CI=false — не превращать ESLint-предупреждения в ошибки сборки
ENV CI=false
ENV GENERATE_SOURCEMAP=false
COPY src/frontend/package*.json ./
RUN npm install --legacy-peer-deps
# Подстраховка: гарантируем ajv@8 на верхнем уровне (react-scripts 5 + npm
# иногда оставляет ajv-keywords без совместимого ajv → ошибка сборки)
RUN npm install ajv@8.17.1 --legacy-peer-deps --no-save
COPY src/frontend/ ./
RUN npm run build

# Шаг 2: сборка Spring Boot (фронтенд кладётся в static)
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app
COPY pom.xml ./
RUN mvn dependency:go-offline -q
COPY src/main ./src/main
COPY --from=frontend-build /app/frontend/build ./src/main/resources/static
RUN mvn package -DskipTests -q

# Шаг 3: финальный образ
FROM eclipse-temurin:21-jre
# curl нужен парсеру Monster: Cloudflare режет Java-клиент, HTML тянется системным curl
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
