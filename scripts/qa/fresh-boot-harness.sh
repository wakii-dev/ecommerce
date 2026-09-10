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
    rmdir "${LOCK_DIR}" 2>/dev/null
  fi
  log "[done] exit=${rc} · total elapsed $(( $(date +%s) - START_EPOCH ))s · log=${LOG}"
  sleep 0.3  # cho tee kịp flush dòng cuối vào LOG
}
trap cleanup EXIT

# Mọi output (stdout + stderr) tee vào LOG
exec > >(tee -a "${LOG}") 2>&1

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
backup() {
  log "[stub] stage BACKUP — NOT IMPLEMENTED (T3)"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage DOWN — down -v (WIPE 7 volumes) + marker
# ─────────────────────────────────────────────────────────────────────────────
down() {
  log "[stub] stage DOWN — NOT IMPLEMENTED (T4)"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage BUILD — compose build (nền + poll), daemon-wedge detect + resume
# ─────────────────────────────────────────────────────────────────────────────
build() {
  log "[stub] stage BUILD — NOT IMPLEMENTED (T5)"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Stage UP (T6) — appended by executor 2 — stub bên dưới giữ script chạy được
# end-to-end ở dạng skeleton (log NOT-IMPLEMENTED, return 0).
# ─────────────────────────────────────────────────────────────────────────────
stage_up() {
  log "[stub] stage UP — NOT IMPLEMENTED (executor 2 / T6: up -d + tiered health gates)"
  return 0
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
