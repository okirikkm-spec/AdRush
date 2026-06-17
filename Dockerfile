# Шаг 1: сборка React-фронтенда
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
# CI=false — не превращать ESLint-предупреждения в ошибки сборки
ENV CI=false
ENV GENERATE_SOURCEMAP=false
# Устойчивость к нестабильной сети сервера: таймаут зависшего сокета 120с (вместо 300с)
# и до 8 автоповторов с backoff — иначе npm install намертво виснет при флапе npm-реестра.
ENV NPM_CONFIG_FETCH_TIMEOUT=120000 \
    NPM_CONFIG_FETCH_RETRIES=8 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
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
# Те же причины, что у npm: ретраи и read-timeout, чтобы maven не висел на флапе репозитория.
ENV MAVEN_OPTS="-Dmaven.wagon.http.retryHandler.count=5 -Dmaven.wagon.rto=60000 -Dmaven.wagon.httpconnectionManager.ttlSeconds=120"
COPY pom.xml ./
RUN mvn dependency:go-offline -q
COPY src/main ./src/main
COPY --from=frontend-build /app/frontend/build ./src/main/resources/static
RUN mvn package -DskipTests -q

# Шаг 3: финальный образ
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend-build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
