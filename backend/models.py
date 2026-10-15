"""
SQLAlchemy ORM Data Models for NetOps Sentinel
Supports PostgreSQL in production & SQLite for standalone evaluation
"""
from datetime import datetime
import json
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
)
from sqlalchemy.orm import declarative_base, relationship
import enum

Base = declarative_base()

class ServiceStatus(str, enum.Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    UNKNOWN = "UNKNOWN"

class IncidentStatus(str, enum.Enum):
    OPEN = "OPEN"
    INVESTIGATING = "INVESTIGATING"
    MITIGATING = "MITIGATING"
    RESOLVED = "RESOLVED"

class IncidentSeverity(str, enum.Enum):
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    MINOR = "MINOR"
    WARNING = "WARNING"

class RecoveryStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    UNVERIFIED = "UNVERIFIED"

class Service(Base):
    __tablename__ = "services"

    id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(String(256), nullable=True)
    target_url = Column(String(512), nullable=False)
    target_host = Column(String(256), nullable=False)
    target_port = Column(Integer, default=80)
    protocol = Column(String(16), default="HTTP")  # HTTP, HTTPS, TCP, DNS
    check_interval_sec = Column(Integer, default=15)
    timeout_sec = Column(Integer, default=5)
    latency_threshold_ms = Column(Float, default=350.0)
    
    # State tracking
    status = Column(String(16), default=ServiceStatus.UNKNOWN.value)
    consecutive_failures = Column(Integer, default=0)
    consecutive_successes = Column(Integer, default=0)
    last_latency_ms = Column(Float, default=0.0)
    uptime_percentage = Column(Float, default=100.0)
    last_checked_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    tags = Column(String(256), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    probes = relationship("ProbeResult", back_populates="service", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="service", cascade="all, delete-orphan")
    recoveries = relationship("RecoveryAudit", back_populates="service", cascade="all, delete-orphan")

class ProbeResult(Base):
    __tablename__ = "probe_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    service_id = Column(String(64), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    status = Column(String(16), nullable=False)
    http_status_code = Column(Integer, nullable=True)
    
    # Granular timing breakdowns (Akamai networking telemetry)
    dns_resolution_ms = Column(Float, default=0.0)
    tcp_handshake_ms = Column(Float, default=0.0)
    tls_handshake_ms = Column(Float, default=0.0)
    ttfb_ms = Column(Float, default=0.0)
    total_latency_ms = Column(Float, default=0.0)
    
    # TLS inspection
    tls_valid = Column(Boolean, default=True)
    tls_expires_days = Column(Integer, nullable=True)
    tls_issuer = Column(String(256), nullable=True)
    tls_cipher = Column(String(128), nullable=True)
    
    # Diagnostic error tracking
    error_type = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    resolved_ip = Column(String(64), nullable=True)
    correlation_id = Column(String(64), nullable=True, index=True)

    service = relationship("Service", back_populates="probes")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(64), primary_key=True)
    service_id = Column(String(64), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(256), nullable=False)
    status = Column(String(16), default=IncidentStatus.OPEN.value, index=True)
    severity = Column(String(16), default=IncidentSeverity.MAJOR.value)
    
    # Evidence-based probable cause
    probable_cause = Column(String(256), nullable=False)
    confidence_score = Column(Float, default=0.85)  # 0.0 to 1.0
    evidence_json = Column(Text, default="{}")       # JSON array of evidence points
    
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(64), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(String(64), nullable=True)
    resolution_notes = Column(Text, nullable=True)

    service = relationship("Service", back_populates="incidents")
    timeline_events = relationship("IncidentTimeline", back_populates="incident", cascade="all, delete-orphan")
    recoveries = relationship("RecoveryAudit", back_populates="incident")

class IncidentTimeline(Base):
    __tablename__ = "incident_timeline"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(String(64), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String(32), nullable=False)  # DETECTED, SEVERITY_CHANGED, ACTION_ATTEMPTED, ACTION_VERIFIED, RESOLVED
    description = Column(Text, nullable=False)
    actor = Column(String(64), default="system:sentinel_prober")

    incident = relationship("Incident", back_populates="timeline_events")

class RecoveryAudit(Base):
    __tablename__ = "recovery_audits"

    id = Column(String(64), primary_key=True)
    service_id = Column(String(64), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    incident_id = Column(String(64), ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True)
    action_name = Column(String(64), nullable=False)
    initiated_by = Column(String(64), nullable=False)
    dry_run = Column(Boolean, default=False)
    status = Column(String(16), default=RecoveryStatus.INITIATED.value)
    pre_health_state = Column(String(16), nullable=False)
    post_health_state = Column(String(16), nullable=True)
    execution_time_ms = Column(Float, default=0.0)
    stdout_log = Column(Text, nullable=True)
    initiated_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    service = relationship("Service", back_populates="recoveries")
    incident = relationship("Incident", back_populates="recoveries")

class SystemMetric(Base):
    __tablename__ = "system_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    cpu_load_1m = Column(Float, default=0.0)
    cpu_load_5m = Column(Float, default=0.0)
    cpu_cores = Column(Integer, default=1)
    memory_used_mb = Column(Float, default=0.0)
    memory_total_mb = Column(Float, default=0.0)
    memory_pct = Column(Float, default=0.0)
    disk_used_pct = Column(Float, default=0.0)
    process_count = Column(Integer, default=0)
    is_container = Column(Boolean, default=True)
    runtime_isolation = Column(String(64), default="docker")
