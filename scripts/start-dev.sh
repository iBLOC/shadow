#!/usr/bin/env bash
#
# Shadow 一键开发编排 (Single-Node Mode)
# --------------------------------------------------
# Starts the full Shadow stack on a single machine:
#   1. Prefrontal (Rust Agent + Engine) on :8082
#   2. Shadow Desktop (Tauri + React) on :1420
#   3. Optional: Shadow Mobile on an attached Android device
#
# Usage:
#   ./start-dev.sh                # just Prefrontal + Desktop
#   ./start-dev.sh --mobile       # also connect to first adb device
#   ./start-dev.sh --prefrontal-only
#   ./start-dev.sh --desktop-only
#   ./start-dev.sh --web          # desktop web build, no Tauri shell
#   ./start-dev.sh --status       # just print which processes are up
#   ./start-dev.sh --stop         # stop all
#   ./start-dev.sh --clean        # stop + remove runtime artifacts
#
# Logs go to /tmp/shadow-dev/{prefrontal,desktop,mobile}.log.
# Each child is given a process group so ./start-dev.sh --stop can
# take the whole tree down without leaking.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PREFRONTAL_DIR="${SHADOW_PREFRONTAL_DIR:-$ROOT/prefrontal}"
DESKTOP_DIR="${SHADOW_DESKTOP_DIR:-$ROOT/shadow/shadow-desktop}"
MOBILE_DIR="${SHADOW_MOBILE_DIR:-$ROOT/shadow/shadow-mobile}"
LOG_DIR="${SHADOW_LOG_DIR:-/tmp/shadow-dev}"
PID_DIR="${SHADOW_PID_DIR:-/tmp/shadow-dev/pids}"
mkdir -p "$LOG_DIR" "$PID_DIR"

PREFRONTAL_PORT="${PREFRONTAL_PORT:-8082}"
DESKTOP_PORT="${DESKTOP_PORT:-1420}"
ENGINE_PORT="${ENGINE_PORT:-8085}"

c_red='\033[0;31m'
c_grn='\033[0;32m'
c_yel='\033[0;33m'
c_blu='\033[0;34m'
c_dim='\033[2m'
c_rst='\033[0m'

log()   { echo -e "${c_blu}[start-dev]${c_rst} $*"; }
ok()    { echo -e "${c_grn}[start-dev]${c_rst} $*"; }
warn()  { echo -e "${c_yel}[start-dev]${c_rst} $*" >&2; }
err()   { echo -e "${c_red}[start-dev]${c_rst} $*" >&2; }

# ---------- helpers ----------

have() { command -v "$1" >/dev/null 2>&1; }

check_port() {
  local port="$1"
  if ss -tln 2>/dev/null | awk '{print $4}' | grep -E "[:.]${port}$" >/dev/null; then
    return 1
  fi
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

wait_port() {
  local port="$1" name="$2" t="${3:-30}"
  for _ in $(seq 1 "$t"); do
    if ! check_port "$port"; then
      ok "$name listening on :$port"
      return 0
    fi
    sleep 1
  done
  warn "$name did not start listening on :$port within ${t}s"
  return 1
}

start_bg() {
  local name="$1" pidfile="$2"
  shift 2
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    warn "$name already running (PID $(cat "$pidfile"))"
    return 0
  fi
  nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
  local pid=$!
  echo "$pid" >"$pidfile"
  disown "$pid" 2>/dev/null || true
  log "started $name (PID $pid) → $LOG_DIR/$name.log"
}

stop_pidfile() {
  local name="$1" pidfile="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      log "stopping $name (PID $pid)"
      kill -TERM "$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

# ---------- actions ----------

action_status() {
  log "Process status:"
  for name in prefrontal desktop mobile; do
    if [[ -f "$PID_DIR/$name.pid" ]]; then
      pid="$(cat "$PID_DIR/$name.pid")"
      if kill -0 "$pid" 2>/dev/null; then
        echo -e "  ${c_grn}●${c_rst} $name (PID $pid) — up"
      else
        echo -e "  ${c_dim}○${c_rst} $name — stale PID file"
      fi
    else
      echo -e "  ${c_dim}○${c_rst} $name — not running"
    fi
  done
  echo
  log "Listening ports:"
  for port in "$PREFRONTAL_PORT" "$DESKTOP_PORT" "$ENGINE_PORT"; do
    if ! check_port "$port"; then
      echo -e "  ${c_grn}●${c_rst} :$port (in use)"
    else
      echo -e "  ${c_dim}○${c_rst} :$port (free)"
    fi
  done
}

action_stop() {
  log "Stopping all Shadow dev processes..."
  for name in mobile desktop prefrontal; do
    stop_pidfile "$name" "$PID_DIR/$name.pid"
  done
  # also reap anything else bound to our ports
  for port in "$PREFRONTAL_PORT" "$DESKTOP_PORT" "$ENGINE_PORT"; do
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      warn "killing leftover listener(s) on :$port ($pids)"
      kill -TERM $pids 2>/dev/null || true
    fi
  done
  ok "stopped"
}

action_clean() {
  action_stop
  rm -rf "$LOG_DIR"
  ok "cleaned $LOG_DIR"
}

action_start_prefrontal() {
  if ! have cargo; then
    err "cargo not on PATH; install Rust first"
    return 1
  fi
  if ! check_port "$PREFRONTAL_PORT"; then
    warn "Port $PREFRONTAL_PORT already in use; assuming Prefrontal is up"
    return 0
  fi
  log "Starting Prefrontal (cargo run) on :$PREFRONTAL_PORT ..."
  (cd "$PREFRONTAL_DIR" && start_bg prefrontal "$PID_DIR/prefrontal.pid" \
    env PREFRONTAL_PORT="$PREFRONTAL_PORT" cargo run)
  wait_port "$PREFRONTAL_PORT" Prefrontal 60
}

action_start_desktop() {
  local mode="${1:-tauri}"
  if [[ "$mode" == "tauri" ]]; then
    if ! have pnpm; then
      err "pnpm not on PATH"
      return 1
    fi
    log "Starting Shadow Desktop (pnpm tauri dev) on :$DESKTOP_PORT ..."
    (cd "$DESKTOP_DIR" && start_bg desktop "$PID_DIR/desktop.pid" \
      env SHADOW_PREFRONTAL_URL="http://localhost:$PREFRONTAL_PORT" \
        pnpm tauri dev)
    wait_port "$DESKTOP_PORT" "Tauri desktop" 90
  else
    log "Starting Shadow Desktop (pnpm dev:web) on :5173 ..."
    (cd "$DESKTOP_DIR" && start_bg desktop "$PID_DIR/desktop.pid" \
      env VITE_PREFRONTAL_URL="http://localhost:$PREFRONTAL_PORT" \
        pnpm dev:web)
    wait_port 5173 "Vite web" 30
  fi
}

action_start_mobile() {
  if ! have flutter; then
    err "flutter not on PATH"
    return 1
  fi
  if ! have adb; then
    err "adb not on PATH; install Android platform tools first"
    return 1
  fi
  local device
  device="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
  if [[ -z "$device" ]]; then
    err "no adb device connected; plug in an Android phone or run an emulator"
    return 1
  fi
  log "Starting Shadow Mobile (flutter run) on $device ..."
  (cd "$MOBILE_DIR" && start_bg mobile "$PID_DIR/mobile.pid" \
    flutter run -d "$device")
  ok "mobile pid=$(cat "$PID_DIR/mobile.pid"); tail $LOG_DIR/mobile.log"
}

# ---------- main ----------

if [[ $# -eq 0 ]]; then
  action_start_prefrontal
  action_start_desktop tauri
  cat <<EOF

${c_grn}Shadow dev stack is up:${c_rst}
  - Prefrontal Agent:  http://localhost:$PREFRONTAL_PORT
  - Tauri Desktop:      http://localhost:$DESKTOP_PORT
  - Logs:               $LOG_DIR/{prefrontal,desktop}.log

Next steps:
  - Run with --mobile to also attach an Android device
  - Run with --web    to use the web build instead of Tauri
  - Run with --status to see live process / port state
  - Run with --stop   to bring everything down cleanly
EOF
  exit 0
fi

case "$1" in
  --status)  action_status ;;
  --stop)    action_stop ;;
  --clean)   action_clean ;;
  --prefrontal-only) action_start_prefrontal ;;
  --desktop-only)    action_start_desktop tauri ;;
  --web)
    action_start_prefrontal
    action_start_desktop web
    ;;
  --mobile)
    action_start_prefrontal
    action_start_desktop tauri
    action_start_mobile
    ;;
  -h|--help)
    cat <<EOF
Shadow dev orchestrator. Run without args to start Prefrontal + Desktop.

  --status           Show which processes / ports are up
  --stop             Stop everything
  --clean            Stop + delete log dir
  --prefrontal-only  Start only the Rust agent
  --desktop-only     Start only the Tauri shell
  --web              Use pnpm dev:web (Vite SPA on :5173) instead of Tauri
  --mobile           Also attach the first connected adb device
  -h, --help         This message

Environment overrides:
  SHADOW_PREFRONTAL_DIR  path to /prefrontal      (default: ../prefrontal)
  SHADOW_DESKTOP_DIR     path to /shadow-desktop  (default: ../shadow/shadow-desktop)
  SHADOW_MOBILE_DIR      path to /shadow-mobile   (default: ../shadow/shadow-mobile)
  SHADOW_LOG_DIR         where to write logs     (default: /tmp/shadow-dev)
  PREFRONTAL_PORT        Agent + Engine port     (default: 8082)
  DESKTOP_PORT           Tauri dev server port   (default: 1420)
  ENGINE_PORT            Reserved for phone Engine (default: 8085)
EOF
    ;;
  *)
    err "unknown arg: $1 (try --help)"
    exit 2
    ;;
esac
