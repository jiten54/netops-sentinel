#!/usr/bin/env bash
# ==============================================================================
# NetOps Sentinel — Low-Level Network Probe (DNS + TCP + HTTP)
# ==============================================================================
set -euo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-3000}"
TIMEOUT="${3:-3}"

echo "Starting probe for ${HOST}:${PORT} (timeout ${TIMEOUT}s)..."

# 1. DNS Resolution Check
DNS_START=$(date +%s%3N)
RESOLVED_IPS=$(getent ahosts "$HOST" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || echo "$HOST")
DNS_END=$(date +%s%3N)
DNS_LATENCY=$((DNS_END - DNS_START))

# 2. TCP Handshake Check
TCP_START=$(date +%s%3N)
TCP_STATUS="UNKNOWN"
if timeout "$TIMEOUT" bash -c "</dev/tcp/${HOST}/${PORT}" 2>/dev/null; then
    TCP_STATUS="CONNECTED"
else
    TCP_STATUS="FAILED"
fi
TCP_END=$(date +%s%3N)
TCP_LATENCY=$((TCP_END - TCP_START))

cat <<EOF
{
  "target_host": "${HOST}",
  "target_port": ${PORT},
  "dns": {
    "status": "$([ -n "$RESOLVED_IPS" ] && echo "RESOLVED" || echo "FAILED")",
    "resolved_ips": "${RESOLVED_IPS}",
    "latency_ms": ${DNS_LATENCY}
  },
  "tcp": {
    "status": "${TCP_STATUS}",
    "latency_ms": ${TCP_LATENCY}
  }
}
EOF
