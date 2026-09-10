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

# ─────────────────────────────────────────────────────────────────────────────
# Stage SEED (T7) — readiness poll (products > 0) rồi mới make seed.
# catalog SeedDataRunner populate products ASYNC sau health UP — seed.sh
# hard-fail "không tìm thấy product" nếu chạy sớm (seed.sh:114).
# Fail → die 4 (seed fail — KHÔNG phải 7/UP).
# ─────────────────────────────────────────────────────────────────────────────
products_seeded() {
  local n
  n="$("${COMPOSE[@]}" exec -T postgres psql -U postgres -d db_catalog \
    -tAc "SELECT count(*) FROM products;" 2>/dev/null || true)"
  [[ "${n}" =~ ^[0-9]+$ ]] && (( n > 0 ))
}

stage_seed() {
  log "[seed] readiness poll — đợi SeedDataRunner populate products (async sau health UP · poll 5s · timeout 2')"
  if ! wait_healthy 5 120 products_seeded; then
    die 4 "[seed] products không xuất hiện sau 2' — SeedDataRunner chưa chạy?"
  fi
  log "[seed] products > 0 — seed-readiness OK"

  log "[seed] make seed — assert exit 0 AND output khớp XONG (seed.sh:229)"
  local seed_out rc
  seed_out="$(make seed 2>&1)"
  rc=$?
  printf '%s\n' "${seed_out}"  # full output vào LOG (tee ở main bắt mọi stdout)

  if (( rc != 0 )) || ! printf '%s\n' "${seed_out}" | grep -q 'XONG'; then
    log "[seed] FAIL — exit=${rc}, khớp XONG: NO — seed output tail:"
    printf '%s\n' "${seed_out}" | tail -n 30
    die 4 "[seed] make seed FAIL (exit=${rc} hoặc thiếu XONG)"
  fi
  log "[seed] make seed OK — exit 0 + XONG khớp"
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage PROBES (T8) — 7 sub-probe (a→f; rbac đếm 2), COLLECT-ALL findings (không fail-fast),
# verdict bảng cuối. Có FAIL → die 6 (stack vẫn seeded — findings minh bạch).
# ─────────────────────────────────────────────────────────────────────────────
FINDINGS=()
PROBE_RESULTS=()
PROBE_TOTAL=0
PROBE_FAILS=0
ADMIN_TOKEN=""
PROBE_TMP=()  # mktemp files của probe — đăng ký TẠI CHỖ (in-shell, không qua
              # command substitution — subshell làm mất phép +=) — dọn ở cuối stage

probe_tmps_rm() {
  local t
  for t in ${PROBE_TMP[@]+"${PROBE_TMP[@]}"}; do
    rm -f "${t}"
  done
}

probe_result() {  # probe_result <tên> <PASS|FAIL> <ghi chú>
  PROBE_TOTAL=$(( PROBE_TOTAL + 1 ))
  if [[ "$2" == "FAIL" ]]; then
    PROBE_FAILS=$(( PROBE_FAILS + 1 ))
  fi
  PROBE_RESULTS+=("${2}  ${1} — ${3}")
  log "[probe] ${2} — ${1}: ${3}"
}

add_finding() {
  FINDINGS+=("$1")
  log "[probe] FINDING — $1"
}

env_value() {  # env_value <KEY> — đọc repo .env (strip quotes), rỗng nếu thiếu
  local v
  v="$(grep -E "^${1}=" "${REPO_ROOT}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r')"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "${v}"
}

psql_catalog() {  # psql_catalog <sql> — query db_catalog qua exec (lỗi → rỗng)
  "${COMPOSE[@]}" exec -T postgres psql -U postgres -d db_catalog -tAc "$1" 2>/dev/null || true
}

json_get() {  # json_get <file> <key> — python3 host (rỗng nếu thiếu/null/parse-fail)
  python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
v = data.get(sys.argv[2])
if v is None:
    sys.exit(0)  # thiếu HOẶC null → rỗng (null token không được nuốt thành "null")
sys.stdout.write(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
' "$1" "$2" 2>/dev/null || true
}

# (a) MinIO — product_images.url phải có + load 200 qua gateway (url đã /media/)
probe_minio_image() {
  local url code
  url="$(psql_catalog "SELECT url FROM product_images WHERE url <> '' LIMIT 1;")"
  if [[ -z "${url}" ]]; then
    add_finding "MinIO-reseed: 0 product_images có url — ảnh không có sẵn sau seed"
    probe_result "minio-image" FAIL "0 product_images có url (MinIO-reseed)"
    return
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://localhost:8080${url}")"
  if [[ "${code}" == "200" ]]; then
    probe_result "minio-image" PASS "GET :8080${url} → 200"
  else
    add_finding "MinIO-reseed: image url tồn tại nhưng GET → ${code:-?} — ${url}"
    probe_result "minio-image" FAIL "GET :8080${url} → ${code:-?} (expect 200)"
  fi
}

# (b) Login admin — creds .env ADMIN_EMAIL/ADMIN_PASSWORD, fallback demo
probe_login() {
  local email password payload code tok tmp
  email="$(env_value ADMIN_EMAIL)"
  [[ -n "${email}" ]] || email="admin@demo.vn"
  password="$(env_value ADMIN_PASSWORD)"
  [[ -n "${password}" ]] || password="admin123"
  payload="$(printf '{"email":"%s","password":"%s"}' "${email}" "${password}")"
  tmp="$(mktemp)"; PROBE_TMP+=("${tmp}")
  code="$(curl -s -o "${tmp}" -w '%{http_code}' --max-time 15 -X POST \
    http://localhost:8080/api/identity/auth/login \
    -H 'Content-Type: application/json' -d "${payload}")"
  tok="$(json_get "${tmp}" accessToken)"
  if [[ "${code}" == "200" && -n "${tok}" ]]; then
    ADMIN_TOKEN="${tok}"
    probe_result "login-admin" PASS "POST /api/identity/auth/login → 200 + accessToken (${#tok} chars)"
  else
    add_finding "login admin FAIL — code=${code:-?} (creds .env/fallback), body: $(head -c 200 "${tmp}" 2>/dev/null)"
    probe_result "login-admin" FAIL "POST login → ${code:-?}, accessToken rỗng"
  fi
}

# (c) Guest cart — POST /api/cart/items không auth, productId từ db_catalog
probe_guest_cart() {
  local pid payload code tmp
  pid="$(psql_catalog "SELECT id FROM products LIMIT 1;")"
  if [[ -z "${pid}" ]]; then
    add_finding "guest-cart: 0 products trong db_catalog (seed chưa populate?)"
    probe_result "guest-cart" FAIL "không lấy được productId từ db_catalog"
    return
  fi
  payload="$(printf '{"productId":"%s","qty":1}' "${pid}")"
  tmp="$(mktemp)"; PROBE_TMP+=("${tmp}")
  code="$(curl -s -o "${tmp}" -w '%{http_code}' --max-time 15 -X POST \
    http://localhost:8080/api/cart/items \
    -H 'Content-Type: application/json' -d "${payload}")"
  if [[ "${code}" == "200" ]]; then
    probe_result "guest-cart" PASS "POST /api/cart/items (guest, product ${pid:0:8}…) → 200"
  else
    add_finding "guest-cart FAIL — POST /api/cart/items → ${code:-?}, body: $(head -c 200 "${tmp}" 2>/dev/null)"
    probe_result "guest-cart" FAIL "POST /api/cart/items → ${code:-?} (expect 200)"
  fi
}

# (d) Events API — GET /api/log/admin/events với JWT từ (b)
probe_events() {
  local code tmp
  tmp="$(mktemp)"; PROBE_TMP+=("${tmp}")
  code="$(curl -s -o "${tmp}" -w '%{http_code}' --max-time 15 \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://localhost:8080/api/log/admin/events?page=0&size=1")"
  if [[ "${code}" == "200" ]]; then
    probe_result "events-api" PASS "GET /api/log/admin/events (JWT) → 200"
  else
    add_finding "events-api FAIL — GET /api/log/admin/events → ${code:-?} (token ${#ADMIN_TOKEN} chars), body: $(head -c 200 "${tmp}" 2>/dev/null)"
    probe_result "events-api" FAIL "GET /api/log/admin/events → ${code:-?} (expect 200)"
  fi
}

# (e) RBAC HARDCODED — pin product 'Tai nghe%' (seed.sh:166); guest PUT phải
# 401/403; admin PUT round-trip GET→PUT cùng body → 2xx + re-GET so
# nameI18n/price unchanged (idempotent — không mutate demo).
# PUT 400 + images[].url = bug data lộ (FINDING ghi rõ — KHÔNG bẻ cong probe).
probe_rbac() {
  local pid base guest_code get_code put_code reget_code tmp_get tmp_put tmp_reget
  pid="$(psql_catalog "SELECT id FROM products WHERE name->>'vi' ILIKE 'Tai nghe%' LIMIT 1;")"
  [[ -n "${pid}" ]] || pid="$(psql_catalog "SELECT id FROM products LIMIT 1;")"
  if [[ -z "${pid}" ]]; then
    add_finding "rbac: không lấy được product pin (db_catalog rỗng?)"
    probe_result "rbac-guest-put" FAIL "không có product để probe"
    probe_result "rbac-roundtrip" FAIL "không có product để probe"
    return
  fi
  base="http://localhost:8080/api/catalog/admin/products/${pid}"

  guest_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X PUT \
    -H 'Content-Type: application/json' -d '{}' "${base}")"
  if [[ "${guest_code}" == "401" || "${guest_code}" == "403" ]]; then
    probe_result "rbac-guest-put" PASS "PUT admin product KHÔNG token → ${guest_code} (blocked đúng)"
  else
    add_finding "rbac: guest PUT /api/catalog/admin/products → ${guest_code:-?} (expect 401/403) — lỗ hổng"
    probe_result "rbac-guest-put" FAIL "guest PUT → ${guest_code:-?} (expect 401/403)"
  fi

  tmp_get="$(mktemp)"; PROBE_TMP+=("${tmp_get}")
  tmp_put="$(mktemp)"; PROBE_TMP+=("${tmp_put}")
  tmp_reget="$(mktemp)"; PROBE_TMP+=("${tmp_reget}")
  get_code="$(curl -s -o "${tmp_get}" -w '%{http_code}' --max-time 15 \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" "${base}")"
  if [[ "${get_code}" != "200" ]]; then
    add_finding "rbac: admin GET product → ${get_code:-?} (token rỗng nếu login fail)"
    probe_result "rbac-roundtrip" FAIL "admin GET → ${get_code:-?} (expect 200)"
    return
  fi

  put_code="$(curl -s -o "${tmp_put}" -w '%{http_code}' --max-time 15 -X PUT \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" -H 'Content-Type: application/json' \
    -d @"${tmp_get}" "${base}")"
  if [[ "${put_code}" == "400" ]] \
     && grep -q 'images' "${tmp_put}" 2>/dev/null && grep -q 'url' "${tmp_put}" 2>/dev/null; then
    add_finding "bug data: images url rỗng — admin PUT round-trip 400 (images[].url bắt buộc)"
    probe_result "rbac-roundtrip" FAIL "PUT 400 — bug data images url rỗng"
    return
  fi
  case "${put_code}" in
    200|201|204) ;;
    *)
      add_finding "rbac: admin PUT round-trip → ${put_code:-?} (expect 2xx), body: $(head -c 200 "${tmp_put}" 2>/dev/null)"
      probe_result "rbac-roundtrip" FAIL "admin PUT → ${put_code:-?} (expect 2xx)"
      return
      ;;
  esac

  reget_code="$(curl -s -o "${tmp_reget}" -w '%{http_code}' --max-time 15 \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" "${base}")"
  if [[ "${reget_code}" != "200" ]]; then
    add_finding "rbac: re-GET sau PUT → ${reget_code:-?}"
    probe_result "rbac-roundtrip" FAIL "re-GET sau PUT → ${reget_code:-?}"
    return
  fi

  if python3 -c '
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
ok = a.get("nameI18n") == b.get("nameI18n") and a.get("price") == b.get("price")
sys.exit(0 if ok else 1)
' "${tmp_get}" "${tmp_reget}" 2>/dev/null; then
    probe_result "rbac-roundtrip" PASS "admin PUT → ${put_code}, re-GET nameI18n+price unchanged (idempotent)"
  else
    add_finding "rbac: round-trip MUTATE — re-GET nameI18n/price khác GET gốc"
    probe_result "rbac-roundtrip" FAIL "re-GET nameI18n/price lệch GET gốc"
  fi
}

# (f) Port-owner — process lạ (không phải docker) giữ port gate = FINDING stale-env
probe_port_owner() {
  local port pids pid cmd strays=0
  for port in "${GATE_PORTS[@]}"; do
    pids="$(lsof -nP -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "${pids}" ]] || continue
    for pid in ${pids}; do
      cmd="$(ps -p "${pid}" -o comm= 2>/dev/null || true)"
      # macOS comm= trả FULL PATH (vd /Applications/Docker.app/Contents/MacOS/
      # com.docker.backend) — KHÔNG phải truncation 9-char của cột COMMAND lsof
      case "${cmd}" in
        *com.docker*|docker|*/docker*|*vpnkit*) : ;;  # docker-published — expected
        *)
          strays=$(( strays + 1 ))
          add_finding "stale-env: port ${port} giữ bởi PID ${pid} ${cmd:-?}"
          ;;
      esac
    done
  done
  if (( strays == 0 )); then
    probe_result "port-owner" PASS "${#GATE_PORTS[@]} port sạch (chỉ docker/rỗng)"
  else
    probe_result "port-owner" FAIL "${strays} process lạ giữ port (stale-env)"
  fi
}

stage_probes() {
  log "[probes] collect-ALL — 7 sub-probe (a→f; rbac = guest-put + roundtrip), không fail-fast, verdict bảng cuối"
  probe_minio_image
  probe_login
  probe_guest_cart
  probe_events
  probe_rbac
  probe_port_owner

  log "[probes] ── VERDICT TABLE (${PROBE_FAILS}/${PROBE_TOTAL} FAIL) ──"
  local r
  for r in ${PROBE_RESULTS[@]+"${PROBE_RESULTS[@]}"}; do
    log "[probes]   ${r}"
  done

  probe_tmps_rm  # dọn tmp probe trước mọi lối ra
  if (( PROBE_FAILS > 0 )); then
    log "[probes] FINDINGS (${#FINDINGS[@]}):"
    for r in ${FINDINGS[@]+"${FINDINGS[@]}"}; do
      log "[probes]   - ${r}"
    done
    die 6 "[probes] ${PROBE_FAILS}/${PROBE_TOTAL} probe FAIL — findings minh bạch (stack vẫn seeded)"
  fi
  log "[probes] ${PROBE_TOTAL}/${PROBE_TOTAL} PASS"
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
