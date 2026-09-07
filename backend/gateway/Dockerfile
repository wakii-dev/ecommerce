# gateway (SF-10 — compose profile full): build context = repo root.
#   docker build -f backend/gateway/Dockerfile .
# Dev gateway chạy host (`make dev svc=gateway`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace/backend
COPY backend/pom.xml pom.xml
COPY backend/shared/ shared/
COPY backend/gateway/pom.xml gateway/pom.xml
COPY backend/gateway/src gateway/src
RUN mvn -q package -pl gateway -am -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/gateway/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
