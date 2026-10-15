"""
NetOps Sentinel — Configuration Management
Tailored for Akamai Network Operations & Infrastructure Reliability (Job ID 4073)
"""
import os
from typing import List

class Settings:
    PROJECT_NAME: str = "NetOps Sentinel — Network Operations Automation & Observability Platform"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://netops:netops_secure_pass@localhost:5432/netops_db"
    )
    SQLITE_FALLBACK_URL: str = "sqlite:///./netops_sentinel.db"
    
    # Worker & Probing
    PROBE_WORKER_INTERVAL_SEC: int = int(os.getenv("PROBE_WORKER_INTERVAL_SEC", "10"))
    DEFAULT_PROBE_TIMEOUT_SEC: int = int(os.getenv("DEFAULT_PROBE_TIMEOUT_SEC", "5"))
    MAX_CONCURRENT_PROBES: int = int(os.getenv("MAX_CONCURRENT_PROBES", "20"))
    
    # Incident Engine Thresholds
    CONSECUTIVE_FAILURES_FOR_INCIDENT: int = int(os.getenv("CONSECUTIVE_FAILURES_FOR_INCIDENT", "2"))
    LATENCY_DEGRADED_THRESHOLD_MS: float = float(os.getenv("LATENCY_DEGRADED_THRESHOLD_MS", "350.0"))
    TLS_EXPIRY_WARNING_DAYS: int = int(os.getenv("TLS_EXPIRY_WARNING_DAYS", "14"))
    
    # Safe Automation & Recovery Allowlist
    ALLOWLISTED_ACTIONS: List[str] = [
        "restart_controlled_service",
        "flush_dns_cache",
        "rotate_tls_cert",
        "reset_circuit_breaker",
        "scale_test_replica",
        "isolate_flapping_route",
    ]
    RECOVERY_COOLDOWN_SEC: int = int(os.getenv("RECOVERY_COOLDOWN_SEC", "30"))
    RECOVERY_EXECUTION_TIMEOUT_SEC: int = int(os.getenv("RECOVERY_EXECUTION_TIMEOUT_SEC", "15"))
    
    # Security
    ADMIN_ROLE_HEADER: str = "X-Operator-Role"
    ADMIN_ROLE_NAME: str = "netops-admin"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "netops_sentinel_development_key_change_in_prod")
    ALLOWED_MONITORING_HOSTS: List[str] = [
        "localhost",
        "127.0.0.1",
        "testservice",
        "api.akamai.com",
        "edgekey.net",
        "cloudflare.com",
        "google.com",
        "dns.google",
        "1.1.1.1",
        "8.8.8.8"
    ]

settings = Settings()
