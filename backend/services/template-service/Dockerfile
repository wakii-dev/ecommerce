# Multi-stage — dùng ở profile `full` (SF-10): build context = repo root
#   docker build -f backend/services/template-service/Dockerfile .
# Ở dev service chạy host (`make dev svc=template-service`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
COPY backend/shared/ backend/shared/
COPY backend/services/template-service/pom.xml backend/services/template-service/pom.xml
COPY backend/services/template-service/src backend/services/template-service/src
RUN mvn -q install -pl shared/common-lib -N \
 && mvn -q package -pl services/template-service -am -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/services/template-service/target/*.jar app.jar
EXPOSE 8099
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
