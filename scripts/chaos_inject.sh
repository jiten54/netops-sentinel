#!/usr/bin/env bash
# ==============================================================================
# NetOps Sentinel — Chaos Failure Injection Utility
# Controlled failure injection for testing probers, incidents, and automated remediation
# ==============================================================================
set -euo pipefail

TARGET_SERVICE="${1:-edge-gateway-east}"
CHAOS_MODE="${2:-http_500}" # http_500, latency_spike, tcp_drop, dns_failure, cert_expired, clear
API_BASE="${3:-http://localhost:3000/api/v1}"

echo ">> NetOps Chaos Injection: Target=[${TARGET_SERVICE}], Mode=[${CHAOS_MODE}]"

RESPONSE=$(curl -s -X POST "${API_BASE}/chaos/inject" \
  -H "Content-Type: application/json" \
  -H "X-Operator-Role: netops-admin" \
  -d "{\"service_id\": \"${TARGET_SERVICE}\", \"mode\": \"${CHAOS_MODE}\"}" 2>/dev/null || echo '{"error": "Failed to reach API"}')

echo "Result:"
echo "$RESPONSE"
