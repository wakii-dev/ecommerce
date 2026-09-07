#!/usr/bin/env bash
# run-java.sh (FI-366 SF-1 T1) — full Java suite, 1 lệnh chuẩn hóa.
#
# Cách chạy ĐÚNG (bài học improvements-log):
#   - REACTOR từ backend/ — KHÔNG `mvn -pl <module>` đơn: SagaTest (ordering)
#     resolve payment/inventory từ ~/.m2 thay vì reactor → jar stale = hành vi
#     giả (COD capture 404). Full reactor dùng artifact vừa build trong session.
#   - KHÔNG `mvn install` module spring-boot riêng: jar REPACKAGED (BOOT-INF)
#     rơi vào ~/.m2 → module khác compile vỡ "package does not exist".
#     Cần install thật → `mvn clean install -Dspring-boot.repackage.skip=true`.
#   - Test đặt tên *Test (KHÔNG *IT) — surefire nuốt *IT im lặng.
set -euo pipefail
cd "$(dirname "$0")/../.."

LOG_DIR=".run/test-logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/java-$(date +%Y%m%d-%H%M%S).log"

echo "[run-java] mvn test reactor từ backend/ — log: $LOG"
set +e
mvn -q -f backend/pom.xml test "$@" 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e

# Surefire aggregate: đếm fail/error từ report (mvn -q nuốt summary khi grep sai)
FAILS=$(find backend -name "*.txt" -path "*surefire-reports*" -exec grep -h "Tests run" {} \; \
        | awk -F'[:,]' '{t+=$2; f+=$4; e+=$6; s+=$8} END {printf "%d/%d/%d/%d", f, e, s, t}')
echo "[run-java] exit=$RC · surefire fail/error/skip/total = $FAILS"
echo "[run-java] log đầy đủ: $LOG"
exit "$RC"
