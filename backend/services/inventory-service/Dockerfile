# Multi-stage — dùng ở profile `full` (SF-10): build context = repo root
#   docker build -f backend/services/inventory-service/Dockerfile .
# Ở dev service chạy host (`make dev svc=inventory`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
# WORKDIR = backend/ (nơi có parent pom — mvn -pl chạy từ đây)
WORKDIR /workspace/backend
COPY backend/pom.xml pom.xml
COPY backend/shared/ shared/
COPY backend/services/inventory-service/pom.xml services/inventory-service/pom.xml
COPY backend/services/inventory-service/src services/inventory-service/src
# parent pom (relativePath) + common-lib nằm trong reactor của -am — 1 lệnh đủ
RUN mvn -q package -pl services/inventory-service -am -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/services/inventory-service/target/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
