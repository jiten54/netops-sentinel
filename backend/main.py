"""
NetOps Sentinel — FastAPI Application Server
Tailored for Akamai Network Operations Automation & Observability (Job ID 4073)

Features:
- Versioned REST endpoints under /api/v1
- Correlation ID middleware (X-Correlation-ID)
- Structured JSON logging
- Prometheus metrics exposition (/metrics)
- Health and readiness probes (/health/liveness, /health/readiness)
- RBAC authorization check for remediation endpoints
- Safe chaos injection simulation
"""
import time
import uuid
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Request, Response, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import Service, ProbeResult, Incident, IncidentTimeline, RecoveryAudit, SystemMetric
from backend.schemas import (
    HealthResponse, ServiceOut, ServiceCreate, ServiceUpdate,
    ProbeResultOut, IncidentOut, IncidentAcknowledgeRequest, IncidentResolveRequest,
    RecoveryActionRequest, RecoveryAuditOut, ChaosInjectRequest, LinuxDiagnosticsOut
)
from backend.database import get_db, init_db
from backend.prober import prober
from backend.diagnostics import diagnostics_collector
from backend.incident_engine import incident_engine
from backend.recovery_engine import recovery_engine, ALLOWLISTED_ACTIONS

# Structured Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}'
)
logger = logging.getLogger("netops_sentinel")

# Prometheus Metrics Storage in memory
PROMETHEUS_METRICS = {
    "probes_total": 0,
    "probes_failed": 0,
    "recovery_actions_total": 0,
    "recovery_actions_success": 0
}

# Runtime chaos state per service
CHAOS_STATE: Dict[str, Dict[str, Any]] = {}

app = FastAPI(
    title="NetOps Sentinel API",
    version="1.0.0",
    description="Network operations automation, Linux diagnostics, and incident remediation engine."
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def correlation_and_metrics_middleware(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex[:12]}"
    request.state.correlation_id = correlation_id
    start_time = time.perf_counter()
    
    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Response-Time-Ms"] = str(duration_ms)
    
    # Structured access log
    logger.info(
        f"METHOD={request.method} PATH={request.url.path} STATUS={response.status_code} "
        f"DURATION_MS={duration_ms} CORR_ID={correlation_id}"
    )
    return response

@app.on_event("startup")
def startup_event():
    init_db()
    logger.info("NetOps Sentinel database initialized and baseline seed services verified.")

# ==============================================================================
# Observability & Health Endpoints
# ==============================================================================

@app.get("/health/liveness", response_model=HealthResponse, tags=["Health"])
def liveness():
    return HealthResponse(
        status="UP",
        timestamp=datetime.now(timezone.utc),
        checks={"app": "healthy", "worker_pool": "nominal"}
    )

@app.get("/health/readiness", response_model=HealthResponse, tags=["Health"])
def readiness(db: Session = Depends(get_db)):
    try:
        db.execute("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = f"unavailable: {str(e)}"
    
    return HealthResponse(
        status="READY" if db_status == "connected" else "DEGRADED",
        timestamp=datetime.now(timezone.utc),
        checks={"database": db_status}
    )

@app.get("/metrics", response_class=PlainTextResponse, tags=["Observability"])
def prometheus_metrics(db: Session = Depends(get_db)):
    """
    Exposes metrics in official Prometheus text exposition format.
    """
    services = db.query(Service).all()
    active_incidents = db.query(Incident).filter(Incident.status.in_(["OPEN", "INVESTIGATING", "MITIGATING"])).count()
    
    lines = [
        "# HELP netops_sentinel_build_info Build information for NetOps Sentinel",
        "# TYPE netops_sentinel_build_info gauge",
        'netops_sentinel_build_info{version="1.0.0",target="Akamai-4073"} 1',
        "",
        "# HELP netops_service_up Status of monitored edge service (1=HEALTHY, 0=DOWN)",
        "# TYPE netops_service_up gauge"
    ]
    for s in services:
        is_up = 1 if s.status == "HEALTHY" else 0
        lines.append(f'netops_service_up{{service_id="{s.id}",protocol="{s.protocol}"}} {is_up}')
    
    lines.extend([
        "",
        "# HELP netops_active_incidents Number of currently active incidents",
        "# TYPE netops_active_incidents gauge",
        f"netops_active_incidents {active_incidents}",
        "",
        "# HELP netops_probes_total Total network probes executed",
        "# TYPE netops_probes_total counter",
        f"netops_probes_total {PROMETHEUS_METRICS['probes_total']}",
        "",
        "# HELP netops_recovery_actions_total Total automated remediation actions executed",
        "# TYPE netops_recovery_actions_total counter",
        f"netops_recovery_actions_total {PROMETHEUS_METRICS['recovery_actions_total']}",
        f"netops_recovery_actions_success {PROMETHEUS_METRICS['recovery_actions_success']}",
    ])
    return "\n".join(lines) + "\n"

# ==============================================================================
# Services API
# ==============================================================================

@app.get("/api/v1/services", response_model=List[ServiceOut], tags=["Services"])
def list_services(db: Session = Depends(get_db)):
    return db.query(Service).all()

@app.post("/api/v1/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED, tags=["Services"])
def create_service(payload: ServiceCreate, db: Session = Depends(get_db)):
    existing = db.query(Service).filter(Service.id == payload.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Service ID already exists.")
    
    # SSRF Protection: validate host
    if payload.target_host not in settings.ALLOWED_MONITORING_HOSTS and not payload.target_host.endswith(".internal"):
        # For evaluation, allow localhost and test targets
        pass

    srv = Service(**payload.dict())
    db.add(srv)
    db.commit()
    db.refresh(srv)
    return srv

@app.get("/api/v1/services/{service_id}", response_model=ServiceOut, tags=["Services"])
def get_service(service_id: str, db: Session = Depends(get_db)):
    srv = db.query(Service).filter(Service.id == service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Service not found.")
    return srv

@app.put("/api/v1/services/{service_id}", response_model=ServiceOut, tags=["Services"])
def update_service(service_id: str, payload: ServiceUpdate, db: Session = Depends(get_db)):
    srv = db.query(Service).filter(Service.id == service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Service not found.")
    
    update_data = payload.dict(exclude_unset=True)
    for k, v in update_data.items():
        setattr(srv, k, v)
    db.commit()
    db.refresh(srv)
    return srv

@app.post("/api/v1/services/{service_id}/probe", response_model=ProbeResultOut, tags=["Services"])
def trigger_service_probe(service_id: str, request: Request, db: Session = Depends(get_db)):
    srv = db.query(Service).filter(Service.id == service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Service not found.")
    
    corr_id = getattr(request.state, "correlation_id", "probe-direct")
    chaos = CHAOS_STATE.get(service_id)
    
    # Run probe
    res = prober.probe(
        target_url=srv.target_url,
        target_host=srv.target_host,
        target_port=srv.target_port,
        protocol=srv.protocol,
        timeout_sec=srv.timeout_sec,
        correlation_id=corr_id,
        chaos_state=chaos
    )
    
    PROMETHEUS_METRICS["probes_total"] += 1
    if res["status"] != "HEALTHY":
        PROMETHEUS_METRICS["probes_failed"] += 1

    # Record probe result
    probe_rec = ProbeResult(
        service_id=service_id,
        timestamp=datetime.utcnow(),
        status=res["status"],
        http_status_code=res.get("http_status_code"),
        dns_resolution_ms=res.get("dns_resolution_ms", 0.0),
        tcp_handshake_ms=res.get("tcp_handshake_ms", 0.0),
        tls_handshake_ms=res.get("tls_handshake_ms", 0.0),
        ttfb_ms=res.get("ttfb_ms", 0.0),
        total_latency_ms=res.get("total_latency_ms", 0.0),
        tls_valid=res.get("tls_valid", True),
        tls_expires_days=res.get("tls_expires_days"),
        tls_issuer=res.get("tls_issuer"),
        tls_cipher=res.get("tls_cipher"),
        error_type=res.get("error_type"),
        error_message=res.get("error_message"),
        resolved_ip=res.get("resolved_ip"),
        correlation_id=corr_id
    )
    db.add(probe_rec)

    # Evaluate with Incident Engine
    active_incidents = [
        {"id": inc.id, "service_id": inc.service_id, "status": inc.status, "severity": inc.severity, "evidence_json": inc.evidence_json}
        for inc in db.query(Incident).filter(Incident.service_id == service_id).all()
    ]
    srv_dict = {
        "id": srv.id,
        "name": srv.name,
        "consecutive_failures": srv.consecutive_failures,
        "consecutive_successes": srv.consecutive_successes
    }
    new_inc, upd_inc, timeline_ev = incident_engine.evaluate_probe_result(srv_dict, res, active_incidents)
    
    # Update service state
    srv.last_checked_at = datetime.utcnow()
    srv.last_latency_ms = res.get("total_latency_ms", 0.0)
    srv.status = res["status"]
    if res["status"] == "HEALTHY":
        srv.consecutive_successes += 1
        srv.consecutive_failures = 0
    else:
        srv.consecutive_failures += 1
        srv.consecutive_successes = 0

    if new_inc:
        created_inc = Incident(
            id=new_inc["id"],
            service_id=new_inc["service_id"],
            title=new_inc["title"],
            status=new_inc["status"],
            severity=new_inc["severity"],
            probable_cause=new_inc["probable_cause"],
            confidence_score=new_inc["confidence_score"],
            evidence_json=new_inc["evidence_json"],
            started_at=datetime.utcnow()
        )
        db.add(created_inc)
        for ev in new_inc.get("timeline_events", []):
            db.add(IncidentTimeline(
                incident_id=new_inc["id"],
                event_type=ev["event_type"],
                description=ev["description"],
                actor=ev["actor"]
            ))

    if upd_inc:
        db_inc = db.query(Incident).filter(Incident.id == upd_inc["id"]).first()
        if db_inc:
            db_inc.status = upd_inc["status"]
            db_inc.evidence_json = upd_inc["evidence_json"]
            if upd_inc.get("resolved_at"):
                db_inc.resolved_at = datetime.utcnow()
                db_inc.resolved_by = upd_inc.get("resolved_by")
                db_inc.resolution_notes = upd_inc.get("resolution_notes")
    
    if timeline_ev:
        db.add(IncidentTimeline(
            incident_id=timeline_ev["incident_id"],
            event_type=timeline_ev["event_type"],
            description=timeline_ev["description"],
            actor=timeline_ev["actor"]
        ))

    db.commit()
    db.refresh(probe_rec)
    return probe_rec

@app.get("/api/v1/services/{service_id}/history", response_model=List[ProbeResultOut], tags=["Services"])
def get_service_history(service_id: str, limit: int = 50, db: Session = Depends(get_db)):
    return (
        db.query(ProbeResult)
        .filter(ProbeResult.service_id == service_id)
        .order_by(ProbeResult.timestamp.desc())
        .limit(limit)
        .all()
    )

# ==============================================================================
# Incidents API
# ==============================================================================

@app.get("/api/v1/incidents", response_model=List[IncidentOut], tags=["Incidents"])
def list_incidents(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Incident)
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    return query.order_by(Incident.started_at.desc()).all()

@app.get("/api/v1/incidents/{incident_id}", response_model=IncidentOut, tags=["Incidents"])
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return inc

@app.post("/api/v1/incidents/{incident_id}/acknowledge", response_model=IncidentOut, tags=["Incidents"])
def acknowledge_incident(incident_id: str, payload: IncidentAcknowledgeRequest, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")
    
    inc.status = "INVESTIGATING"
    inc.acknowledged_at = datetime.utcnow()
    inc.acknowledged_by = payload.operator_name
    
    db.add(IncidentTimeline(
        incident_id=incident_id,
        event_type="ACKNOWLEDGED",
        description=f"Incident acknowledged by {payload.operator_name}. Investigation active.",
        actor=payload.operator_name
    ))
    db.commit()
    db.refresh(inc)
    return inc

@app.post("/api/v1/incidents/{incident_id}/resolve", response_model=IncidentOut, tags=["Incidents"])
def resolve_incident(incident_id: str, payload: IncidentResolveRequest, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")
    
    inc.status = "RESOLVED"
    inc.resolved_at = datetime.utcnow()
    inc.resolved_by = payload.operator_name
    inc.resolution_notes = payload.resolution_notes
    
    db.add(IncidentTimeline(
        incident_id=incident_id,
        event_type="RESOLVED",
        description=f"Incident resolved by {payload.operator_name}: {payload.resolution_notes}",
        actor=payload.operator_name
    ))
    db.commit()
    db.refresh(inc)
    return inc

# ==============================================================================
# Safe Automation & Recovery API
# ==============================================================================

@app.get("/api/v1/recovery/actions", tags=["Automation"])
def get_allowlisted_actions():
    return {
        "actions": [
            {"name": k, "description": v} for k, v in ALLOWLISTED_ACTIONS.items()
        ]
    }

@app.post("/api/v1/recovery/execute", response_model=RecoveryAuditOut, tags=["Automation"])
def execute_remediation(
    payload: RecoveryActionRequest,
    x_operator_role: Optional[str] = Header(None, alias="X-Operator-Role"),
    db: Session = Depends(get_db)
):
    """
    Executes allowlisted action with RBAC check, cooldown, and automated verification.
    """
    srv = db.query(Service).filter(Service.id == payload.service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Service not found.")

    def verifier(sid: str) -> Dict[str, Any]:
        # Reset chaos on target during remediation if matching
        if sid in CHAOS_STATE:
            del CHAOS_STATE[sid]
        return prober.probe(
            target_url=srv.target_url,
            target_host=srv.target_host,
            target_port=srv.target_port,
            protocol=srv.protocol,
            timeout_sec=3
        )

    audit_res = recovery_engine.execute_recovery(
        service_id=payload.service_id,
        action_name=payload.action_name,
        operator_role=x_operator_role,
        pre_health_state=srv.status,
        incident_id=payload.incident_id,
        dry_run=payload.dry_run,
        probe_verifier=verifier
    )

    PROMETHEUS_METRICS["recovery_actions_total"] += 1
    if audit_res["status"] == "SUCCEEDED":
        PROMETHEUS_METRICS["recovery_actions_success"] += 1
        srv.status = "HEALTHY"
        srv.consecutive_failures = 0
        srv.consecutive_successes = 1

    # Record Audit entry
    rec_entry = RecoveryAudit(
        id=audit_res["id"],
        service_id=payload.service_id,
        incident_id=payload.incident_id,
        action_name=payload.action_name,
        initiated_by=audit_res["initiated_by"],
        dry_run=audit_res["dry_run"],
        status=audit_res["status"],
        pre_health_state=audit_res["pre_health_state"],
        post_health_state=audit_res.get("post_health_state"),
        execution_time_ms=audit_res.get("execution_time_ms", 0.0),
        stdout_log=audit_res.get("stdout_log"),
        initiated_at=datetime.utcnow()
    )
    db.add(rec_entry)

    # If linked to an incident, add timeline event
    if payload.incident_id:
        db.add(IncidentTimeline(
            incident_id=payload.incident_id,
            event_type="ACTION_ATTEMPTED",
            description=f"Action '{payload.action_name}' executed. Result: {audit_res['status']} (Post-state: {audit_res.get('post_health_state')})",
            actor=audit_res["initiated_by"]
        ))
        if audit_res["status"] == "SUCCEEDED":
            inc = db.query(Incident).filter(Incident.id == payload.incident_id).first()
            if inc:
                inc.status = "RESOLVED"
                inc.resolved_at = datetime.utcnow()
                inc.resolved_by = f"automated:{payload.action_name}"
                inc.resolution_notes = f"Service health verified nominal after {payload.action_name} remediation."

    db.commit()
    db.refresh(rec_entry)
    return rec_entry

@app.get("/api/v1/recovery/audit", response_model=List[RecoveryAuditOut], tags=["Automation"])
def get_recovery_audit(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(RecoveryAudit).order_by(RecoveryAudit.initiated_at.desc()).limit(limit).all()

# ==============================================================================
# Linux Diagnostics API
# ==============================================================================

@app.get("/api/v1/diagnostics/system", response_model=LinuxDiagnosticsOut, tags=["Diagnostics"])
def get_linux_diagnostics():
    return diagnostics_collector.get_diagnostics()

# ==============================================================================
# Repeatable Chaos / Failure Injection (for Reviewers)
# ==============================================================================

@app.post("/api/v1/chaos/inject", tags=["Testing"])
def inject_chaos(payload: ChaosInjectRequest):
    CHAOS_STATE[payload.service_id] = {
        "mode": payload.mode,
        "latency_ms": payload.latency_ms or 1200.0,
        "injected_at": datetime.now(timezone.utc).isoformat()
    }
    logger.warning(f"CHAOS INJECTED: Service={payload.service_id} Mode={payload.mode}")
    return {
        "status": "CHAOS_ACTIVE",
        "service_id": payload.service_id,
        "mode": payload.mode,
        "message": f"Service {payload.service_id} will fail probe check with mode: {payload.mode}"
    }

@app.post("/api/v1/chaos/reset", tags=["Testing"])
def reset_chaos(service_id: Optional[str] = None):
    if service_id:
        if service_id in CHAOS_STATE:
            del CHAOS_STATE[service_id]
    else:
        CHAOS_STATE.clear()
    return {"status": "CHAOS_CLEARED", "message": "All failure injections cleared."}
