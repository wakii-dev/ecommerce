# identity-service (SF-10 — compose profile full): build context = repo root.
#   docker build -f backend/services/identity-service/Dockerfile .
# JWT keys mount volume ./infra/keys:/keys:ro (make keys sinh trên host).
# Dev chạy host (`make dev svc=identity`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace/backend
COPY backend/pom.xml pom.xml
COPY backend/shared/ shared/
COPY backend/services/identity-service/pom.xml services/identity-service/pom.xml
COPY backend/services/identity-service/src services/identity-service/src
RUN mvn -q package -pl services/identity-service -am -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/services/identity-service/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
