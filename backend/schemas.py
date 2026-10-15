"""
Pydantic Schemas for API Serialization, Request Validation, and Responses
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# Base & Health
class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    version: str = "1.0.0"
    checks: Dict[str, str] = Field(default_factory=dict)

# Service Schemas
class ServiceBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: Optional[str] = None
    target_url: str = Field(..., description="Target HTTP/HTTPS endpoint or host")
    target_host: str
    target_port: int = 80
    protocol: str = "HTTP"
    check_interval_sec: int = Field(15, ge=5, le=300)
    timeout_sec: int = Field(5, ge=1, le=30)
    latency_threshold_ms: float = Field(350.0, ge=10.0, le=10000.0)
    tags: str = ""

class ServiceCreate(ServiceBase):
    id: str = Field(..., min_length=3, max_length=64)

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    target_host: Optional[str] = None
    target_port: Optional[int] = None
    check_interval_sec: Optional[int] = None
    timeout_sec: Optional[int] = None
    latency_threshold_ms: Optional[float] = None
    is_active: Optional[bool] = None
    tags: Optional[str] = None

class ServiceOut(ServiceBase):
    id: str
    status: str
    consecutive_failures: int
    consecutive_successes: int
    last_latency_ms: float
    uptime_percentage: float
    last_checked_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Probe Result Schemas
class ProbeResultOut(BaseModel):
    id: int
    service_id: str
    timestamp: datetime
    status: str
    http_status_code: Optional[int] = None
    dns_resolution_ms: float
    tcp_handshake_ms: float
    tls_handshake_ms: float
    ttfb_ms: float
    total_latency_ms: float
    tls_valid: bool
    tls_expires_days: Optional[int] = None
    tls_issuer: Optional[str] = None
    tls_cipher: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    resolved_ip: Optional[str] = None
    correlation_id: Optional[str] = None

    class Config:
        from_attributes = True

# Incident Schemas
class IncidentTimelineOut(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    description: str
    actor: str

    class Config:
        from_attributes = True

class IncidentOut(BaseModel):
    id: str
    service_id: str
    title: str
    status: str
    severity: str
    probable_cause: str
    confidence_score: float
    evidence_json: str
    started_at: datetime
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    timeline_events: List[IncidentTimelineOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

class IncidentAcknowledgeRequest(BaseModel):
    operator_name: str = Field("operator:noc-lead", max_length=64)

class IncidentResolveRequest(BaseModel):
    operator_name: str = Field("operator:noc-lead", max_length=64)
    resolution_notes: str = Field(..., min_length=5, max_length=1000)

# Recovery Schemas
class RecoveryActionRequest(BaseModel):
    service_id: str
    action_name: str = Field(..., description="Allowlisted action name")
    incident_id: Optional[str] = None
    dry_run: bool = False

class RecoveryAuditOut(BaseModel):
    id: str
    service_id: str
    incident_id: Optional[str] = None
    action_name: str
    initiated_by: str
    dry_run: bool
    status: str
    pre_health_state: str
    post_health_state: Optional[str] = None
    execution_time_ms: float
    stdout_log: Optional[str] = None
    initiated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Chaos Simulation Schema
class ChaosInjectRequest(BaseModel):
    service_id: str
    mode: str = Field(..., description="http_500, latency_spike, tcp_drop, dns_failure, cert_expired, clear")
    latency_ms: Optional[float] = 1200.0

# System Diagnostics Schemas
class LinuxDiagnosticsOut(BaseModel):
    timestamp: str
    hostname: str
    uptime_seconds: int
    environment: Dict[str, Any]
    cpu: Dict[str, Any]
    memory: Dict[str, Any]
    disk: Dict[str, Any]
    processes: Dict[str, Any]
    network: Dict[str, Any]
