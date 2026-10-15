"""
NetOps Sentinel — Asynchronous Background Monitoring Worker
Tailored for Akamai Distributed Edge Probing & Autonomous Monitoring (Job ID 4073)

Features:
- Independent daemon lifecycle with graceful SIGINT / SIGTERM shutdown
- Configurable polling intervals and timeout controls
- Concurrency bounded threadpool execution
- Continuous system telemetry persistence
"""
import time
import signal
import sys
import os
import logging
from datetime import datetime

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.config import settings
from backend.database import SessionLocal, init_db
from backend.models import Service, ProbeResult, Incident, IncidentTimeline, SystemMetric
from backend.prober import prober
from backend.incident_engine import incident_engine
from backend.diagnostics import diagnostics_collector

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","component":"worker","level":"%(levelname)s","message":"%(message)s"}'
)
logger = logging.getLogger("sentinel_worker")

class MonitoringWorker:
    def __init__(self):
        self.running = True
        self.interval = settings.PROBE_WORKER_INTERVAL_SEC
        signal.signal(signal.SIGINT, self._handle_exit)
        signal.signal(signal.SIGTERM, self._handle_exit)

    def _handle_exit(self, signum, frame):
        logger.info(f"Received termination signal ({signum}). Initiating graceful shutdown of Sentinel Worker...")
        self.running = False

    def run(self):
        logger.info("Initializing Sentinel background prober worker...")
        init_db()
        logger.info(f"Worker active. Polling interval: {self.interval}s. Press Ctrl+C to stop.")
        
        cycle = 0
        while self.running:
            cycle_start = time.time()
            try:
                self._execute_probe_cycle()
                # Every 3 cycles (~30s), capture system metrics
                if cycle % 3 == 0:
                    self._record_system_telemetry()
            except Exception as e:
                logger.error(f"Error during probe cycle: {str(e)}", exc_info=True)

            cycle += 1
            # Sleep remaining interval with interrupt checks
            elapsed = time.time() - cycle_start
            sleep_time = max(0.5, self.interval - elapsed)
            
            steps = int(sleep_time / 0.5)
            for _ in range(steps):
                if not self.running:
                    break
                time.sleep(0.5)

        logger.info("Sentinel Monitoring Worker successfully stopped. Clean exit.")

    def _execute_probe_cycle(self):
        db = SessionLocal()
        try:
            services = db.query(Service).filter(Service.is_active == True).all()
            if not services:
                return

            logger.info(f"Starting probe sweep for {len(services)} active edge services...")
            for srv in services:
                if not self.running:
                    break
                
                # Check probe
                res = prober.probe(
                    target_url=srv.target_url,
                    target_host=srv.target_host,
                    target_port=srv.target_port,
                    protocol=srv.protocol,
                    timeout_sec=srv.timeout_sec,
                    correlation_id=f"worker-{int(time.time())}-{srv.id}"
                )

                # Record Probe
                probe_rec = ProbeResult(
                    service_id=srv.id,
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
                    correlation_id=res.get("correlation_id")
                )
                db.add(probe_rec)

                # Check incidents
                active_incidents = [
                    {"id": inc.id, "service_id": inc.service_id, "status": inc.status, "severity": inc.severity, "evidence_json": inc.evidence_json}
                    for inc in db.query(Incident).filter(Incident.service_id == srv.id).all()
                ]
                srv_dict = {
                    "id": srv.id,
                    "name": srv.name,
                    "consecutive_failures": srv.consecutive_failures,
                    "consecutive_successes": srv.consecutive_successes
                }
                new_inc, upd_inc, timeline_ev = incident_engine.evaluate_probe_result(srv_dict, res, active_incidents)

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

                if timeline_ev:
                    db.add(IncidentTimeline(
                        incident_id=timeline_ev["incident_id"],
                        event_type=timeline_ev["event_type"],
                        description=timeline_ev["description"],
                        actor=timeline_ev["actor"]
                    ))

            db.commit()
        finally:
            db.close()

    def _record_system_telemetry(self):
        diag = diagnostics_collector.get_diagnostics()
        db = SessionLocal()
        try:
            metric = SystemMetric(
                timestamp=datetime.utcnow(),
                cpu_load_1m=diag.get("cpu", {}).get("load_1m", 0.0),
                cpu_cores=diag.get("cpu", {}).get("cores", 1),
                memory_used_mb=diag.get("memory", {}).get("used_mb", 0.0),
                memory_total_mb=diag.get("memory", {}).get("total_mb", 0.0),
                memory_pct=diag.get("memory", {}).get("usage_percent", 0.0),
                disk_used_pct=float(diag.get("disk", {}).get("usage_percent", 0.0)),
                process_count=diag.get("processes", {}).get("total", 0),
                is_container=diag.get("environment", {}).get("is_container", True),
                runtime_isolation=diag.get("environment", {}).get("runtime_isolation", "docker")
            )
            db.add(metric)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to record system telemetry: {str(e)}")
        finally:
            db.close()

if __name__ == "__main__":
    worker = MonitoringWorker()
    worker.run()
