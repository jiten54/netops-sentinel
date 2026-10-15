#!/usr/bin/env bash
# ==============================================================================
# NetOps Sentinel — Linux System Diagnostics Script
# Tailored for Akamai Network Operations & Infrastructure Reliability (Job ID 4073)
# ==============================================================================
set -euo pipefail

FORMAT="${1:-json}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)

# Check virtualization/containerization context
IS_CONTAINER="false"
CONTAINER_TYPE="host"
if [ -f /.dockerenv ]; then
    IS_CONTAINER="true"
    CONTAINER_TYPE="docker"
elif grep -sq 'docker\|lxc\|kubepods\|gvisor' /proc/1/cgroup 2>/dev/null; then
    IS_CONTAINER="true"
    CONTAINER_TYPE="cgroup_isolated"
elif uname -r | grep -qi 'gvisor'; then
    IS_CONTAINER="true"
    CONTAINER_TYPE="gvisor_sandbox"
fi

# CPU Metrics
LOAD_AVG=$(awk '{print $1", "$2", "$3}' /proc/loadavg 2>/dev/null || echo "0.00, 0.00, 0.00")
LOAD_1M=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0.00")
CPU_COUNT=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)

# Memory Metrics (kB to MB)
MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
MEM_FREE_KB=$(grep MemFree /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
MEM_AVAIL_KB=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
MEM_BUFFERS_KB=$(grep Buffers /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
MEM_CACHED_KB=$(grep "^Cached:" /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)

MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
MEM_AVAIL_MB=$((MEM_AVAIL_KB / 1024))
if [ "$MEM_TOTAL_KB" -gt 0 ]; then
    MEM_USED_KB=$((MEM_TOTAL_KB - MEM_AVAIL_KB))
    MEM_USED_MB=$((MEM_USED_KB / 1024))
    MEM_USAGE_PCT=$(awk -v u="$MEM_USED_KB" -v t="$MEM_TOTAL_KB" 'BEGIN {printf "%.1f", (u/t)*100}')
else
    MEM_USED_MB=0
    MEM_USAGE_PCT=0.0
fi

# Disk Usage on Root
DISK_ROOT_TOTAL=$(df -h / 2>/dev/null | awk 'NR==2 {print $2}' || echo "N/A")
DISK_ROOT_USED=$(df -h / 2>/dev/null | awk 'NR==2 {print $3}' || echo "N/A")
DISK_ROOT_AVAIL=$(df -h / 2>/dev/null | awk 'NR==2 {print $4}' || echo "N/A")
DISK_ROOT_PCT=$(df -P / 2>/dev/null | awk 'NR==2 {gsub(/%/, ""); print $5}' || echo "0")

# Process Count
TOTAL_PROCESSES=$(ps -e --no-headers 2>/dev/null | wc -l || echo 0)
RUNNING_PROCESSES=$(ps -eo stat --no-headers 2>/dev/null | grep -c '^R' || echo 0)

# Top 5 Memory Consuming Processes
TOP_MEM_PROCESSES=$(ps -eo pid,ppid,user,%cpu,%mem,comm --sort=-%mem --no-headers 2>/dev/null | head -n 5 | awk '{printf "{\"pid\":%d,\"ppid\":%d,\"user\":\"%s\",\"cpu_pct\":%.1f,\"mem_pct\":%.1f,\"command\":\"%s\"},", $1, $2, $3, $4, $5, $6}' | sed 's/,$//' || echo "")

# Network Interfaces
NET_INTERFACES=$(ip -o -4 addr show 2>/dev/null | awk '{printf "{\"interface\":\"%s\",\"ip\":\"%s\"},", $2, $4}' | sed 's/,$//' || echo "")

if [ "$FORMAT" = "json" ]; then
    cat <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "hostname": "${HOSTNAME}",
  "uptime_seconds": ${UPTIME_SEC},
  "environment": {
    "is_container": ${IS_CONTAINER},
    "runtime_isolation": "${CONTAINER_TYPE}",
    "kernel_version": "$(uname -r 2>/dev/null || echo 'unknown')"
  },
  "cpu": {
    "cores": ${CPU_COUNT},
    "load_average": "${LOAD_AVG}",
    "load_1m": ${LOAD_1M}
  },
  "memory": {
    "total_mb": ${MEM_TOTAL_MB},
    "used_mb": ${MEM_USED_MB},
    "available_mb": ${MEM_AVAIL_MB},
    "usage_percent": ${MEM_USAGE_PCT}
  },
  "disk": {
    "mount": "/",
    "total": "${DISK_ROOT_TOTAL}",
    "used": "${DISK_ROOT_USED}",
    "available": "${DISK_ROOT_AVAIL}",
    "usage_percent": ${DISK_ROOT_PCT}
  },
  "processes": {
    "total": ${TOTAL_PROCESSES},
    "running": ${RUNNING_PROCESSES},
    "top_memory": [${TOP_MEM_PROCESSES}]
  },
  "network": {
    "interfaces": [${NET_INTERFACES}]
  }
}
EOF
else
    echo "============================================================"
    echo " NetOps Sentinel - System Diagnostics: ${HOSTNAME}"
    echo " Timestamp: ${TIMESTAMP} | Uptime: ${UPTIME_SEC}s"
    echo " Environment: ${CONTAINER_TYPE} (Container: ${IS_CONTAINER})"
    echo "============================================================"
    echo "CPU Load (1m, 5m, 15m): ${LOAD_AVG} (${CPU_COUNT} cores)"
    echo "Memory Usage: ${MEM_USED_MB}MB / ${MEM_TOTAL_MB}MB (${MEM_USAGE_PCT}%)"
    echo "Root Disk Usage: ${DISK_ROOT_USED} / ${DISK_ROOT_TOTAL} (${DISK_ROOT_PCT}%)"
    echo "Total Processes: ${TOTAL_PROCESSES} (Running: ${RUNNING_PROCESSES})"
    echo "============================================================"
fi
