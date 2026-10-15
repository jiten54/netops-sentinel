"""
Database engine and session management for NetOps Sentinel
Supports PostgreSQL and SQLite
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models import Base, Service, ServiceStatus

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./netops_sentinel.db")
# If async URL is passed to sync create_engine, adapt:
SYNC_DB_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

engine = create_engine(
    SYNC_DB_URL,
    connect_args={"check_same_thread": False} if "sqlite" in SYNC_DB_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Creates tables and seeds default baseline edge services
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Service).count() == 0:
            seed_services = [
                Service(
                    id="edge-gateway-east",
                    name="Edge Gateway (US-East)",
                    description="Akamai Tier-1 Anycast ingress proxy and edge routing cluster",
                    target_url="http://localhost:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="HTTP",
                    check_interval_sec=10,
                    timeout_sec=3,
                    latency_threshold_ms=250.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=99.98,
                    tags="edge,anycast,routing"
                ),
                Service(
                    id="dns-resolver-anycast",
                    name="Global Anycast DNS Resolver",
                    description="Authoritative DNS resolver and Geo-IP traffic director",
                    target_url="http://127.0.0.1:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="DNS",
                    check_interval_sec=15,
                    timeout_sec=2,
                    latency_threshold_ms=120.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=99.99,
                    tags="dns,core-infra,latency-critical"
                ),
                Service(
                    id="auth-token-service",
                    name="Edge Auth & Token Validator",
                    description="Distributed HMAC / JWT edge verification service",
                    target_url="http://localhost:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="HTTP",
                    check_interval_sec=15,
                    timeout_sec=4,
                    latency_threshold_ms=300.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=99.95,
                    tags="auth,security,iam"
                ),
                Service(
                    id="cache-purge-api",
                    name="Fast Purge & Cache Sync API",
                    description="Sub-5ms global CDN cache invalidation messaging bus",
                    target_url="http://localhost:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="HTTP",
                    check_interval_sec=10,
                    timeout_sec=5,
                    latency_threshold_ms=350.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=99.92,
                    tags="cdn,cache,invalidation"
                ),
                Service(
                    id="origin-shield-emea",
                    name="Origin Shield & DDoS Scrubber (EMEA)",
                    description="Upstream backend traffic filtering and rate limiting cluster",
                    target_url="http://localhost:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="HTTP",
                    check_interval_sec=20,
                    timeout_sec=5,
                    latency_threshold_ms=400.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=99.96,
                    tags="ddos,security,origin-shield"
                ),
                Service(
                    id="testservice-controlled",
                    name="Controlled Test Service (Canary Target)",
                    description="Isolated target sandbox service for chaos injection & automated recovery testing",
                    target_url="http://localhost:3000/api/v1/health/liveness",
                    target_host="127.0.0.1",
                    target_port=3000,
                    protocol="HTTP",
                    check_interval_sec=5,
                    timeout_sec=3,
                    latency_threshold_ms=200.0,
                    status=ServiceStatus.HEALTHY.value,
                    uptime_percentage=100.0,
                    tags="test,canary,controlled,remediation"
                )
            ]
            db.add_all(seed_services)
            db.commit()
    finally:
        db.close()
