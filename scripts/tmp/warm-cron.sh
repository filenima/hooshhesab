#!/bin/bash
# Post-restart warm: cron kicker routes + landing page + key chunks
BASE="http://127.0.0.1:3000"
SECRET=$(rg -o "CRON_SECRET=.*" /home/z/my-project/.env | head -1 | cut -d= -f2)
echo "warming cron routes..."
for r in currency trial-reminders 2fa-reminders error-check publish-scheduled push-schedules seo-content newsletter-weekly; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 -X POST "$BASE/api/cron/$r" -H "x-cron-secret: $SECRET" -H "Content-Type: application/json" -d '{}' 2>/dev/null)
  echo "$CODE /api/cron/$r"
  if [ "$CODE" = "000" ]; then
    echo "-- waiting recovery"
    for i in $(seq 1 20); do sleep 8; H=$(curl -s --max-time 5 "$BASE/api/health" 2>/dev/null | head -c 10); [ -n "$H" ] && break; done
  fi
done
echo "warming landing..."
curl -s -o /dev/null -w "GET / -> %{http_code}\n" --max-time 90 "$BASE/" 2>/dev/null
echo "DONE"
