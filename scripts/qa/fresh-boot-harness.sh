#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FI-406 — SF-2 fresh-boot harness (DESTRUCTIVE)
#
# backup → wipe (down -v) → build → up → seed → probes — safety gates TRƯỚC mọi
# hành động phá hoại. Consent story-level (bracket fi404-qa-sweep); coordinator
# set QA_FRESH_BOOT_CONFIRM=1 per-run. KHÔNG có --force.
#
# Exit codes: 0 OK · 3 gate refuse · 4 backup/seed fail · 5 build fail
#             (daemon wedge có hướng dẫn resume) · 6 probe fail (collect-all)
#             · 7 UP health-gate fail
#
# RESUME=BUILD: skip BACKUP+DOWN — BẮT BUỘC marker .run/qa-fresh-boot-wiped từ
# run trước (GATE vẫn chạy đầy đủ). Không marker → die 3 (chặn false-fresh).
# ─────────────────────────────────────────────────────────────────────────────
set -u -o pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}" || exit 1

TS="$(date +%Y%m%d-%H%M%S)"
LOG="/tmp/qa-fresh-boot-${TS}.log"
RUN_DIR="${REPO_ROOT}/.run"
LOCK_DIR="${RUN_DIR}/qa-fresh-boot.lock"
MARKER="${RUN_DIR}/qa-fresh-boot-wiped"
BACKUP_DIR="${REPO_ROOT}/backups/qa-${TS}"
START_EPOCH="$(date +%s)"
COMPOSE=(docker compose --profile full --profile stripe)

# 9 postgres DBs — ground truth 2026-09-10 (1 container postgres, 9 DB)
DBS=(db_affiliate db_catalog db_identity db_inventory db_notification db_ordering db_partner db_payment db_template)
RESTORE_TEST_PREFIX="qa_restore_test"

# Port list của GATE (stale-env / demo-stack detector) — spec §4 GATE.3
GATE_PORTS=(8080 3000 5173 5174 5175 5176 5177 5178 9099)

RESUME_MODE="${QA_FRESH_BOOT_RESUME:-}"
LOCK_HELD=0
BUILD_PID=""
TEE_PID=""

log() { printf '%s\n' "$*"; }

stage() {
  log "[stage] ${1} — $(date +%H:%M:%S) (elapsed $(( $(date +%s) - START_EPOCH ))s)"
}

die() {
  local code="$1"; shift
  log "[die] exit ${code} — $* (total elapsed $(( $(date +%s) - START_EPOCH ))s)"
  exit "${code}"
}

cleanup() {
  local rc=$?
  if [[ -n "${BUILD_PID}" ]] && kill -0 "${BUILD_PID}" 2>/dev/null; then
    log "[cleanup] kill background build PID ${BUILD_PID}"
    kill "${BUILD_PID}" 2>/dev/null
  fi
  if [[ "${LOCK_HELD}" -eq 1 && -d "${LOCK_DIR}" ]]; then
    # rm -rf (không rmdir) — lock dir chứa file owner
    rm -rf "${LOCK_DIR}"
  fi
  log "[done] exit=${rc} · total elapsed $(( $(date +%s) - START_EPOCH ))s · log=${LOG}"
  # Flush tee trước khi exit: đóng fd → tee thấy EOF → flush + exit → wait về 0.
  # (wait TRỰC TIẾP khi chưa đóng fd = deadlock — write-end của pipe do script giữ)
  exec >&- 2>&-
  if [[ -n "${TEE_PID}" ]] && kill -0 "${TEE_PID}" 2>/dev/null; then
    wait "${TEE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Mọi output (stdout + stderr) tee vào LOG
exec > >(tee -a "${LOG}") 2>&1
TEE_PID=$!

# ─────────────────────────────────────────────────────────────────────────────
# Stage GATE — refuse TRƯỚC MỌI hành động phá hoại (P0 — phần cứng nhất)
# Thứ tự: confirm → resume → preflight → lock → demo-idle → port-owner →
#         blast-radius → disk → RAM. Refuse ở bất kỳ bước nào = không đụng gì.
# ─────────────────────────────────────────────────────────────────────────────
gate() {
  # 1. Confirm flag bắt buộc (kiểm TRƯỚC TIÊN TIÊNG — run thiếu flag không đụng gì)
  [[ "${QA_FRESH_BOOT_CONFIRM:-}" == "1" ]] \
    || die 3 "[gate] thiếu QA_FRESH_BOOT_CONFIRM=1 — refuse (harness DESTRUCTIVE: down -v xóa volumes)"

  # 2. RESUME value validate + marker bắt buộc cho RESUME=BUILD
  if [[ -n "${RESUME_MODE}" && "${RESUME_MODE}" != "BUILD" ]]; then
    die 3 "[gate] QA_FRESH_BOOT_RESUME='${RESUME_MODE}' không hợp lệ (chỉ chấp nhận BUILD)"
  fi
  if [[ "${RESUME_MODE}" == "BUILD" ]]; then
    [[ -f "${MARKER}" ]] \
      || die 3 "[gate] RESUME=BUILD nhưng marker ${MARKER} không tồn tại — refuse (chặn false-fresh trên data demo còn nguyên)"
    log "[gate] RESUME=BUILD — marker wipe lúc $(cat "${MARKER}") → sẽ skip BACKUP+DOWN"
  fi

  # 3. Preflight — compose file + docker daemon
  [[ -f "${REPO_ROOT}/docker-compose.yml" ]] \
    || die 3 "[gate] docker-compose.yml không tồn tại tại ${REPO_ROOT}"
  docker info >/dev/null 2>&1 \
    || die 3 "[gate] docker daemon không trả lời (docker info fail)"

  # 4. Pidfile lock — run song song refuse
  mkdir -p "${RUN_DIR}"
  if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
    die 3 "[gate] lock đang giữ (${LOCK_DIR}) — có run harness khác, refuse"
  fi
  LOCK_HELD=1
  printf '%s %s\n' "$$" "${TS}" > "${LOCK_DIR}/owner"

  # 5. Demo-idle check — DERIVED compose ps (phủ MỌI service compose định nghĩa)
  local ps_ids
  ps_ids="$("${COMPOSE[@]}" ps -q 2>/dev/null || true)"
  if [[ -n "${ps_ids}" ]]; then
    log "[gate] REFUSE: demo stack ĐANG CHẠY — compose ps trả về $(printf '%s\n' "${ps_ids}" | wc -l | tr -d ' ') container:"
    printf '%s\n' "${ps_ids}" | while read -r id; do
      log "[gate]   ${id} — $(docker inspect -f '{{.Name}} {{.State.Status}}' "${id}" 2>/dev/null || echo '?')"
    done
    die 3 "[gate] demo-idle check FAIL (compose-ps non-empty) — phải down toàn bộ stack trước khi fresh-boot"
  fi

  # 6. Port-owner check — có listener trên port gate = refuse (in PID + process)
  local port pids pid
  for port in "${GATE_PORTS[@]}"; do
    pids="$(lsof -nP -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      for pid in ${pids}; do
        log "[gate] REFUSE: port ${port} có listener — PID ${pid}: $(ps -p "${pid}" -o command= 2>/dev/null || echo '?')"
      done
      die 3 "[gate] port-owner check FAIL — port ${port} đang bị giữ, refuse"
    fi
  done

  # 7. Blast radius minh bạch — chỉ in khi sắp wipe thật (idle pass, không RESUME)
  if [[ "${RESUME_MODE}" != "BUILD" ]]; then
    log "[gate] BLAST RADIUS — down -v sẽ xóa 7 volumes:"
    log "[gate]   pgdata       = BACKED-UP (stage BACKUP dump 9 DB trước wipe)"
    log "[gate]   redisdata    = regenerable"
    log "[gate]   rabbitmqdata = regenerable"
    log "[gate]   mailpitdata  = regenerable"
    log "[gate]   esdata       = regenerable"
    log "[gate]   mongodata    = MẤT VĨNH VIỄN (event_log — KHÔNG có backup)"
    log "[gate]   miniodata    = MẤT VĨNH VIỄN (uploaded images — bucket re-init only, ảnh KHÔNG re-upload)"
  fi

  # 8. Disk ≥ 20GB (host — Docker VM cùng pool) + docker system df vào log
  local avail_kb disk_min_kb=20971520
  avail_kb="$(df -k "${REPO_ROOT}" | awk 'NR==2 {print $4}')"
  [[ "${avail_kb}" =~ ^[0-9]+$ ]] || die 3 "[gate] không đọc được disk free (df -k ${REPO_ROOT})"
  if (( avail_kb < disk_min_kb )); then
    die 3 "[gate] disk free $(( avail_kb / 1024 / 1024 ))GB < 20GB — refuse"
  fi
  log "[gate] disk free: $(( avail_kb / 1024 / 1024 ))GB (≥20GB OK)"
  docker system df || true

  # 9. RAM Docker VM ≥ 6GB
  local mem_bytes mem_min=6442450944
  mem_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null || true)"
  [[ "${mem_bytes}" =~ ^[0-9]+$ ]] || die 3 "[gate] không đọc được RAM (docker info MemTotal)"
  if (( mem_bytes < mem_min )); then
    die 3 "[gate] Docker VM RAM $(( mem_bytes / 1024 / 1024 / 1024 ))GB < 6GB — refuse"
  fi
  log "[gate] Docker VM RAM: $(( mem_bytes / 1024 / 1024 / 1024 ))GB (≥6GB OK)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage BACKUP — dump 9 DB + restore-test throwaway (fail → die 4 TRƯỚC wipe)
# ─────────────────────────────────────────────────────────────────────────────
pg_sanity_sql() {
  # Map hardcoded spec §4 BACKUP — db_template 0 bảng public (verified 2026-09-10) → schema-only
  case "$1" in
    db_identity)     echo "SELECT count(*) FROM users;" ;;
    db_catalog)      echo "SELECT count(*) FROM products;" ;;
    db_inventory)    echo "SELECT count(*) FROM stocks;" ;;
    db_ordering)     echo "SELECT count(*) FROM orders;" ;;
    db_payment)      echo "SELECT count(*) FROM payment_intents;" ;;  # V10__payment_domain.sql — payments không tồn tại
    db_notification) echo "SELECT count(*) FROM send_log;" ;;  # V10__send_log.sql — notifications không tồn tại
    db_partner)      echo "SELECT count(*) FROM partners;" ;;
    db_affiliate)    echo "SELECT count(*) FROM affiliates;" ;;
    db_template)     echo "SELECT 1;" ;;
    *)               echo "SELECT 1;" ;;
  esac
}

restore_test_db() { echo "${RESTORE_TEST_PREFIX}_${1#db_}"; }

cleanup_restore_dbs() {
  local db
  for db in "${DBS[@]}"; do
    "${COMPOSE[@]}" exec -T postgres psql -U postgres \
      -c "DROP DATABASE IF EXISTS $(restore_test_db "${db}");" >/dev/null 2>&1 || true
  done
}

wait_postgres_healthy() {
  local id status deadline
  deadline=$(( $(date +%s) + 120 ))
  id="$("${COMPOSE[@]}" ps -q postgres 2>/dev/null || true)"
  if [[ -z "${id}" ]]; then
    log "[backup] postgres chưa chạy → docker compose up -d postgres"
    "${COMPOSE[@]}" up -d postgres || return 1
  fi
  while :; do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q postgres 2>/dev/null)" 2>/dev/null || true)"
    if [[ "${status}" == "healthy" ]]; then
      log "[backup] postgres healthy"
      return 0
    fi
    if (( $(date +%s) > deadline )); then
      log "[backup] postgres chưa healthy sau 2' (status=${status:-?})"
      return 1
    fi
    sleep 5
  done
}

backup() {
  log "[backup] đảm bảo postgres sống + healthy trước dump (không dump-trên-starting)"
  wait_postgres_healthy || die 4 "[backup] postgres không healthy — refuse dump (TRƯỚC wipe)"

  mkdir -p "${BACKUP_DIR}"
  local db dump_file restore_db sanity_out dump_bytes
  for db in "${DBS[@]}"; do
    dump_file="${BACKUP_DIR}/${db}.sql.gz"
    log "[backup] pg_dump ${db} → ${dump_file}"
    if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres -d "${db}" | gzip > "${dump_file}"; then
      cleanup_restore_dbs
      die 4 "[backup] pg_dump/gzip FAIL cho ${db} — refuse wipe (TRƯỚC wipe)"
    fi
    dump_bytes="$(wc -c < "${dump_file}" | tr -d ' ')"
    if (( dump_bytes < 200 )); then
      cleanup_restore_dbs
      die 4 "[backup] dump ${db} = ${dump_bytes} bytes < 200 (rỗng?) — refuse wipe"
    fi
  done

  log "[backup] RESTORE-TEST per-DB (throwaway ${RESTORE_TEST_PREFIX}_* — gunzip không đủ)"
  for db in "${DBS[@]}"; do
    restore_db="$(restore_test_db "${db}")"
    dump_file="${BACKUP_DIR}/${db}.sql.gz"
    if ! "${COMPOSE[@]}" exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS ${restore_db};" >/dev/null \
       || ! "${COMPOSE[@]}" exec -T postgres psql -U postgres -c "CREATE DATABASE ${restore_db};" >/dev/null; then
      cleanup_restore_dbs
      die 4 "[backup] tạo DB test ${restore_db} FAIL — refuse wipe"
    fi
    if ! gunzip -c "${dump_file}" | "${COMPOSE[@]}" exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -d "${restore_db}" >/dev/null; then
      cleanup_restore_dbs
      die 4 "[backup] restore FAIL vào ${restore_db} (${db}) — refuse wipe"
    fi
    if ! sanity_out="$("${COMPOSE[@]}" exec -T postgres psql -U postgres -d "${restore_db}" -tAc "$(pg_sanity_sql "${db}")")"; then
      cleanup_restore_dbs
      die 4 "[backup] sanity query FAIL trên ${restore_db} (${db}) — refuse wipe"
    fi
    if ! "${COMPOSE[@]}" exec -T postgres psql -U postgres -c "DROP DATABASE ${restore_db};" >/dev/null; then
      cleanup_restore_dbs
      die 4 "[backup] drop DB test ${restore_db} FAIL — refuse wipe"
    fi
    log "[backup] RESTORE-TEST ${db} → ${restore_db} OK (sanity: ${sanity_out})"
  done

  log "[backup] backup 9 DB + restore-test PASS — bằng chứng:"
  ls -lh "${BACKUP_DIR}"

  # Trả stack về all-down trước DOWN: backup là nơi DUY NHẤT start postgres
  # giữa GATE và DOWN (up -d postgres; exec -T không giữ container nào khác —
  # compose postgres không có depends_on) — nếu để chạy, down() TOCTOU-refuse
  # chính postgres do harness tự start (happy path chết trên mọi fresh run).
  log "[backup] compose stop postgres — trả stack về all-down cho down() TOCTOU check"
  if ! "${COMPOSE[@]}" stop postgres; then
    die 4 "[backup] compose stop postgres FAIL — stack chưa all-down, down() sẽ TOCTOU-refuse"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage DOWN — down -v (WIPE 7 volumes) + marker
# ─────────────────────────────────────────────────────────────────────────────
down() {
  # TOCTOU hardening — có container start lại giữa GATE và down -v → refuse wipe
  local toctou_ids
  toctou_ids="$("${COMPOSE[@]}" ps -q 2>/dev/null || true)"
  if [[ -n "${toctou_ids}" ]]; then
    die 3 "[down] TOCTOU: containers xuất hiện lại giữa GATE và down -v (compose-ps non-empty) — refuse wipe"
  fi

  log "[down] docker compose down -v --remove-orphans — WIPE volumes (mongodata/miniodata MẤT VĨNH VIỄN — đã disclose ở GATE)"
  local t0 leftover ps_out
  t0=$(date +%s)
  if ! "${COMPOSE[@]}" down -v --remove-orphans; then
    die 4 "[down] compose down -v FAIL sau $(( $(date +%s) - t0 ))s"
  fi
  log "[down] down -v hoàn tất trong $(( $(date +%s) - t0 ))s"

  mkdir -p "${RUN_DIR}"
  printf '%s\n' "$(date +%Y%m%d-%H%M%S)" > "${MARKER}"
  log "[down] marker ghi: ${MARKER} = $(cat "${MARKER}") (bằng chứng wipe cho RESUME=BUILD)"

  # docker ps fail (daemon chết?) ≠ "0 leftover" — refuse, không âm thầm pass
  if ! ps_out="$(docker ps -a --format '{{.Names}}' 2>/dev/null)"; then
    die 4 "[down] docker ps fail sau wipe — không verify được (daemon chết?)"
  fi
  leftover="$(printf '%s\n' "${ps_out}" | grep -c '^ecommerce-' || true)"
  if [[ "${leftover}" != "0" ]]; then
    printf '%s\n' "${ps_out}" | grep '^ecommerce-' || true
    die 4 "[down] còn ${leftover} container ecommerce-* sau down -v"
  fi
  log "[down] verify: 0 container ecommerce-* còn lại"
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage BUILD — compose build (nền + poll), daemon-wedge detect + resume
# ─────────────────────────────────────────────────────────────────────────────
build() {
  log "[build] docker compose build — chạy nền, poll 30s (10-15')"
  local t0 rc
  t0=$(date +%s)
  "${COMPOSE[@]}" build >>"${LOG}" 2>&1 &
  BUILD_PID=$!
  while kill -0 "${BUILD_PID}" 2>/dev/null; do
    sleep 30
    kill -0 "${BUILD_PID}" 2>/dev/null \
      && log "[build] ... đang build (elapsed $(( $(date +%s) - t0 ))s)"
  done
  wait "${BUILD_PID}"; rc=$?
  BUILD_PID=""
  if (( rc == 0 )); then
    log "[build] build OK trong $(( $(date +%s) - t0 ))s"
    return 0
  fi

  if tail -n 40 "${LOG}" | grep -Eq 'Cannot connect to the Docker daemon|error during connect'; then
    log "[build] DAEMON WEDGE — Docker daemon chết giữa build (log tail khớp pattern):"
    tail -n 10 "${LOG}"
    log "[build] FIX daemon: pkill -f com.docker.backend; open -a Docker"
    log "[build] RESUME sau khi daemon sống lại (wipe ĐÃ xảy ra — marker tồn tại):"
    log "[build]   QA_FRESH_BOOT_RESUME=BUILD QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot"
    die 5 "[build] daemon wedge — exit 5"
  fi
  log "[build] build FAIL (không phải daemon) — log tail:"
  tail -n 30 "${LOG}"
  die 5 "[build] compose build exit ${rc}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage UP (T6) — up -d + health gates theo tầng: infra → JVM → FE/gateway.
# Fail BẤT KỲ tầng → die 7 + container logs tail — abort TRƯỚC SEED.
# ─────────────────────────────────────────────────────────────────────────────
UP_TOTAL_BUDGET=480  # 8' — guard tổng: pathological boot không được treo vô hạn

# TIER 1 — infra (compose healthcheck → .State.Health.Status == healthy)
INFRA_SERVICES=(postgres redis rabbitmq mongo elasticsearch minio mailpit)

# TIER 2 — 10 JVM actuator, dạng <name>:<port>:<container>
# (container_name ground truth compose, live-verified 2026-09-10)
JVM_SERVICES=(
  identity:8081:ecommerce-identity-service
  catalog:8082:ecommerce-catalog-service
  cart:8083:ecommerce-cart-service
  inventory:8084:ecommerce-inventory-service
  ordering:8085:ecommerce-ordering-service
  payment:8086:ecommerce-payment-service
  notification:8087:ecommerce-notification-service
  log:8088:ecommerce-log-service
  partner-api:8091:ecommerce-partner-api
  affiliate:8092:ecommerce-affiliate-service
)

# Đợi <cmd...> exit 0 — poll mỗi <interval>s, hết <timeout>s → return 1
wait_healthy() {
  local interval="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while :; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    if (( $(date +%s) > deadline )); then
      return 1
    fi
    sleep "${interval}"
  done
}

infra_healthy() {  # infra_healthy <compose-service> — resolve qua ps -q (không đoán container_name)
  local id status
  id="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null || true)"
  [[ -n "${id}" ]] || return 1
  status="$(docker inspect -f '{{.State.Health.Status}}' "${id}" 2>/dev/null || true)"
  [[ "${status}" == "healthy" ]]
}

jvm_healthy() {  # jvm_healthy <container> <port> — actuator trong container (images có curl)
  docker exec "$1" curl -sf "localhost:$2/actuator/health" 2>/dev/null | grep -q '"status":"UP"'
}

gateway_healthy() {  # gateway QUA HOST ONLY — không docker-exec (image chưa verify có curl)
  curl -sf --max-time 10 http://localhost:8080/actuator/health 2>/dev/null | grep -q '"status":"UP"'
}

invoice_healthy() {  # invoice = FastAPI — KHÔNG actuator, dùng compose healthcheck
  [[ "$(docker inspect -f '{{.State.Health.Status}}' ecommerce-invoice-service 2>/dev/null || true)" == "healthy" ]]
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || true)" == "running" ]]
}

http_ok() {  # http_ok <url> — status code qua host, timeout ngắn
  [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null)" == "200" ]]
}

up_budget_left() {  # giây còn lại của tổng budget UP
  local left=$(( UP_DEADLINE - $(date +%s) ))
  if (( left > 0 )); then printf '%s' "${left}"; else printf '%s' "0"; fi
}

# die 7 + container logs tail — mọi tier fail đi qua đây (logs best-effort)
up_die_logs() {
  local what="$1" container="$2"
  log "[up] ${what} — container logs tail:"
  if [[ -n "${container}" ]]; then
    docker logs --tail 30 "${container}" 2>&1 || true
  fi
  die 7 "[up] ${what}"
}

stage_up() {
  local t0 left svc entry name port container
  t0=$(date +%s)
  UP_DEADLINE=$(( t0 + UP_TOTAL_BUDGET ))

  log "[up] docker compose --profile full --profile stripe up -d"
  if ! "${COMPOSE[@]}" up -d; then
    die 7 "[up] compose up -d FAIL sau $(( $(date +%s) - t0 ))s"
  fi

  # ── TIER 1/3 — infra healthy (poll 5s · 2'/svc · budget tổng ${UP_TOTAL_BUDGET}s) ──
  log "[up] TIER 1/3 — infra: ${INFRA_SERVICES[*]} (poll 5s · timeout 2'/svc)"
  for svc in "${INFRA_SERVICES[@]}"; do
    left="$(up_budget_left)"
    if (( left == 0 )); then
      up_die_logs "TIER 1: tổng budget ${UP_TOTAL_BUDGET}s cạn khi đợi ${svc}" ""
    fi
    if wait_healthy 5 "${left}" infra_healthy "${svc}"; then
      log "[up]   ${svc} healthy (elapsed $(( $(date +%s) - t0 ))s)"
    else
      up_die_logs "TIER 1 infra: ${svc} chưa healthy sau ${left}s (budget cạn?)" \
        "$("${COMPOSE[@]}" ps -q "${svc}" 2>/dev/null || true)"
    fi
  done

  # ── TIER 2/3 — 10 JVM actuator + gateway (host) + invoice (FastAPI healthcheck) ──
  log "[up] TIER 2/3 — 10 JVM actuator + gateway(host :8080) + invoice(FastAPI healthcheck) (poll 10s · timeout 4'/svc)"
  for entry in "${JVM_SERVICES[@]}"; do
    name="${entry%%:*}"
    port="${entry#*:}"; port="${port%%:*}"
    container="${entry#*:*:}"
    left="$(up_budget_left)"
    if (( left == 0 )); then
      up_die_logs "TIER 2: tổng budget ${UP_TOTAL_BUDGET}s cạn khi đợi ${name}" "${container}"
    fi
    if wait_healthy 10 "${left}" jvm_healthy "${container}" "${port}"; then
      log "[up]   ${name} UP (elapsed $(( $(date +%s) - t0 ))s)"
    else
      up_die_logs "TIER 2 JVM: ${name} (:${port}) chưa UP sau ${left}s" "${container}"
    fi
  done

  left="$(up_budget_left)"
  if (( left == 0 )); then
    up_die_logs "TIER 2: tổng budget ${UP_TOTAL_BUDGET}s cạn khi đợi gateway" ""
  fi
  if wait_healthy 10 "${left}" gateway_healthy; then
    log "[up]   gateway UP — host :8080/actuator/health (elapsed $(( $(date +%s) - t0 ))s)"
  else
    up_die_logs "TIER 2 gateway: :8080/actuator/health chưa UP sau ${left}s" \
      "$("${COMPOSE[@]}" ps -q gateway 2>/dev/null || true)"
  fi

  left="$(up_budget_left)"
  if (( left == 0 )); then
    up_die_logs "TIER 2: tổng budget ${UP_TOTAL_BUDGET}s cạn khi đợi invoice" "ecommerce-invoice-service"
  fi
  if wait_healthy 10 "${left}" invoice_healthy; then
    log "[up]   invoice-service healthy — compose healthcheck (elapsed $(( $(date +%s) - t0 ))s)"
  else
    up_die_logs "TIER 2 invoice: compose healthcheck chưa healthy sau ${left}s" "ecommerce-invoice-service"
  fi

  # ── TIER 3/3 — FE containers running + gateway public routes 200 ──
  log "[up] TIER 3/3 — FE containers + gateway public routes (poll 5s · timeout 2')"
  for container in ecommerce-frontend-web ecommerce-storefront-web; do
    left="$(up_budget_left)"
    if (( left == 0 )); then
      up_die_logs "TIER 3: tổng budget ${UP_TOTAL_BUDGET}s cạn khi đợi ${container}" "${container}"
    fi
    if wait_healthy 5 "${left}" container_running "${container}"; then
      log "[up]   ${container} running (elapsed $(( $(date +%s) - t0 ))s)"
    else
      up_die_logs "TIER 3: ${container} không running sau ${left}s" "${container}"
    fi
  done

  left="$(up_budget_left)"
  if (( left == 0 )); then left=10; fi
  if wait_healthy 5 "${left}" http_ok "http://localhost:8080/"; then
    log "[up]   GET :8080/ → 200 (storefront route, elapsed $(( $(date +%s) - t0 ))s)"
  else
    up_die_logs "TIER 3: GET :8080/ != 200 (storefront route) sau ${left}s" "ecommerce-storefront-web"
  fi

  left="$(up_budget_left)"
  if (( left == 0 )); then left=10; fi
  if wait_healthy 5 "${left}" http_ok "http://localhost:8080/cart"; then
    log "[up]   GET :8080/cart → 200 (shell route, elapsed $(( $(date +%s) - t0 ))s)"
  else
    up_die_logs "TIER 3: GET :8080/cart != 200 (shell route) sau ${left}s" "ecommerce-frontend-web"
  fi

  log "[up] UP PASS — 3/3 tier (tổng $(( $(date +%s) - t0 ))s)"
}

# ── Stage SEED (T7) — appended by executor 2 ──
stage_seed() {
  log "[stub] stage SEED — NOT IMPLEMENTED (executor 2 / T7: readiness poll + make seed assert XONG)"
  return 0
}

# ── Stage PROBES (T8) — appended by executor 2 ──
stage_probes() {
  log "[stub] stage PROBES — NOT IMPLEMENTED (executor 2 / T8: image/login/cart/events/rbac/port-owner)"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main — 7 stages tuần tự
# ─────────────────────────────────────────────────────────────────────────────
main() {
  if (( $# > 0 )); then
    die 3 "[main] script không nhận argument (nhận được: $*)"
  fi
  log "════ FI-406 fresh-boot harness — ${TS} ════"
  log "repo=${REPO_ROOT} · log=${LOG}"

  stage GATE
  gate   # die 3 bên trong nếu refuse — KHÔNG gì phá hoại xảy ra trước điểm này

  if [[ "${RESUME_MODE}" == "BUILD" ]]; then
    log "[main] RESUME=BUILD — skip BACKUP + DOWN (marker ${MARKER} đã verify ở GATE)"
  else
    stage BACKUP
    backup  # die 4 trước wipe nếu fail
    stage DOWN
    down    # wipe 7 volumes + ghi marker
  fi

  stage BUILD
  build   # die 5 nếu fail (daemon wedge có hướng dẫn resume)

  # ── Stage UP (T6) — appended by executor 2 ──
  stage UP
  stage_up

  # ── Stage SEED (T7) — appended by executor 2 ──
  stage SEED
  stage_seed

  # ── Stage PROBES (T8) — appended by executor 2 ──
  stage PROBES
  stage_probes

  log "[main] 7/7 stages hoàn tất"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
