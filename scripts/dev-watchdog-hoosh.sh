#!/bin/bash
# dev-watchdog-hoosh.sh — نگه‌دارندهٔ سرور dev «هوش‌حساب v36» در سندباکس ۴GB
# هر ۲۰ ثانیه سلامت را چک می‌کند؛ اگر پروسه واقعاً مرده باشد (نه در حال
# کامپایل)، بلافاصله با setsid (orphan double-setsid) ری‌استارت می‌کند.
ROOT="/home/z/my-project/hooshhesab-work/extracted/hooshhesab"
LOG="$ROOT/watchdog.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

start_server() {
  log "starting dev server (orphan double-setsid)"
  cd "$ROOT" || return 1
  setsid bash -c "setsid nohup env NODE_OPTIONS='--max-old-space-size=1024' TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H 0.0.0.0 > dev.log 2>&1 < /dev/null &" > /dev/null 2>&1 < /dev/null &
}

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" != "200" ]; then
    if ! pgrep -f "next-server" > /dev/null 2>&1; then
      log "server dead (code=$code) — restarting"
      start_server
      for i in $(seq 1 24); do
        sleep 5
        c=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:3000/api/health 2>/dev/null)
        if [ "$c" = "200" ]; then log "server back up"; break; fi
      done
    fi
  fi
  sleep 20
done
