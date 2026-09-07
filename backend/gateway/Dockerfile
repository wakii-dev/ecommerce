# gateway (SF-10 — compose profile full): build context = repo root.
#   docker build -f backend/gateway/Dockerfile .
# Dev gateway chạy host (`make dev svc=gateway`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace/backend
# BUG-07 (FI-366 SF-1): parent pom khai báo TẤT CẢ modules — image 1 service
# cần mọi module dir tồn tại (chỉ COPY pom của mình vỡ reactor mỗi khi 1 SF
# mới append module — make full chết từ sau SF-10). COPY cả backend/ (context
# đã slim qua .dockerignore) + cache .m2 cho build 10 image nhanh gấp bội.
COPY backend/ .
RUN --mount=type=cache,target=/root/.m2 mvn -q package -pl gateway -am -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/gateway/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
