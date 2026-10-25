#!/bin/bash
# Warm API routes sequentially (paced) so dashboard + tour modules compile while Chrome is closed
T=$(cat /tmp/qa-token.txt)
BASE="http://127.0.0.1:3000"
APIS=(
  "/api/auth/me"
  "/api/dashboard"
  "/api/dashboard/value-summary"
  "/api/trial/progress"
  "/api/value-meter"
  "/api/budget/check-alerts"
  "/api/marketing/loyalty"
  "/api/marketing/in-app-messages"
  "/api/parties"
  "/api/module-config"
  "/api/integrations/modian/status"
  "/api/user/profile"
  "/api/platform/settings/session"
  "/api/platform/user-content"
  "/api/notifications"
  "/api/accounting/invoices"
  "/api/invoices"
  "/api/pos/config"
  "/api/products"
  "/api/products/categories"
  "/api/inventory/movements"
  "/api/accounting/form-data"
  "/api/accounting/journal-entries"
  "/api/checks"
  "/api/employees"
  "/api/ai/rag"
  "/api/ai/agent-chat"
  "/api/currency/fetch-tgju"
  "/api/reports/sales-summary"
  "/api/analytics/overview"
)
for api in "${APIS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$BASE$api" -H "Authorization: Bearer $T" 2>/dev/null)
  echo "$CODE $api"
  # if server died, wait for recovery
  if [ "$CODE" = "000" ]; then
    echo "-- server down, waiting recovery..."
    for i in $(seq 1 20); do
      sleep 8
      H=$(curl -s --max-time 5 "$BASE/api/health" 2>/dev/null | head -c 20)
      [ -n "$H" ] && break
    done
    # retry once
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$BASE$api" -H "Authorization: Bearer $T" 2>/dev/null)
    echo "retry: $CODE $api"
  fi
  sleep 1
done
echo "DONE"
