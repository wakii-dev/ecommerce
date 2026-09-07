# Multi-stage — dùng ở profile `full` (SF-10): build context = repo root
#   docker build -f backend/services/payment-service/Dockerfile .
# Ở dev service chạy host (`make dev svc=payment`) — KHÔNG build image này.

FROM maven:3.9-eclipse-temurin-21 AS build
# WORKDIR = backend/ (nơi có parent pom — mvn -pl chạy từ đây)
WORKDIR /workspace/backend
# BUG-07 (FI-366 SF-1): parent pom khai báo TẤT CẢ modules — image 1 service
# cần mọi module dir tồn tại (chỉ COPY pom của mình vỡ reactor mỗi khi 1 SF
# mới append module — make full chết từ sau SF-10). COPY cả backend/ (context
# đã slim qua .dockerignore) + cache .m2 cho build 10 image nhanh gấp bội.
COPY backend/ .
RUN --mount=type=cache,target=/root/.m2 mvn -q package -pl services/payment-service -am -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/services/payment-service/target/*.jar app.jar
EXPOSE 8086
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
