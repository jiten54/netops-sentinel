#!/usr/bin/env bash
# ==============================================================================
# NetOps Sentinel — Endpoint Health Check Utility
# ==============================================================================
set -euo pipefail

TARGET="${1:-http://localhost:3000/api/v1/health/liveness}"
TIMEOUT="${2:-5}"

START_TIME=$(date +%s%3N)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$TARGET" 2>/dev/null || echo "000")
END_TIME=$(date +%s%3N)
DURATION_MS=$((END_TIME - START_TIME))

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    echo "{\"status\": \"HEALTHY\", \"target\": \"${TARGET}\", \"http_code\": ${HTTP_CODE}, \"latency_ms\": ${DURATION_MS}}"
    exit 0
elif [ "$HTTP_CODE" -eq "000" ]; then
    echo "{\"status\": \"DOWN\", \"target\": \"${TARGET}\", \"http_code\": 0, \"latency_ms\": ${DURATION_MS}, \"error\": \"Connection refused or timed out\"}"
    exit 2
else
    echo "{\"status\": \"DEGRADED\", \"target\": \"${TARGET}\", \"http_code\": ${HTTP_CODE}, \"latency_ms\": ${DURATION_MS}}"
    exit 1
fi
