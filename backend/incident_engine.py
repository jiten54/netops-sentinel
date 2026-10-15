"""
NetOps Sentinel — Incident Detection and Correlation Engine
Tailored for Akamai Automated Operations & NOC Reliability (Job ID 4073)

Features:
- Consecutive failure threshold gating
- Incident deduplication (aggregates repeated failures into single active incident)
- Evidence-based probable cause deduction with confidence scoring
- Dynamic severity assignment (CRITICAL, MAJOR, MINOR, WARNING)
- Incident timeline event tracing
"""
import uuid
import json
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple

class IncidentEngine:
    def __init__(self, failure_threshold: int = 2, latency_threshold_ms: float = 350.0):
        self.failure_threshold = failure_threshold
        self.latency_threshold_ms = latency_threshold_ms

    def evaluate_probe_result(
        self,
        service: Dict[str, Any],
        probe_result: Dict[str, Any],
        active_incidents: List[Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[str]]:
        """
        Evaluates a new probe result against service health rules.
        Returns:
            (new_incident_to_create, updated_incident, timeline_event)
        """
        status = probe_result.get("status", "UNKNOWN")
        total_latency = probe_result.get("total_latency_ms", 0.0)
        error_type = probe_result.get("error_type")
        error_msg = probe_result.get("error_message") or ""
        service_id = service["id"]

        # Check existing active incident for this service
        existing_incident = next(
            (inc for inc in active_incidents if inc["service_id"] == service_id and inc["status"] in ["OPEN", "INVESTIGATING", "MITIGATING"]),
            None
        )

        # Scenario 1: Probe Failed or Degraded
        if status in ["DOWN", "DEGRADED"] or (total_latency > self.latency_threshold_ms and status == "HEALTHY"):
            consecutive = service.get("consecutive_failures", 0) + 1
            
            # Did we breach the incident creation threshold?
            if consecutive >= self.failure_threshold or status == "DOWN":
                severity, probable_cause, confidence, evidence = self._deduce_cause_and_severity(probe_result, consecutive)
                
                if existing_incident:
                    # Update existing incident evidence
                    existing_evidence = json.loads(existing_incident.get("evidence_json", "[]"))
                    existing_evidence.append({
                        "timestamp": datetime.utcnow().isoformat(),
                        "error_type": error_type,
                        "latency_ms": total_latency,
                        "message": error_msg
                    })
                    # Keep latest 10 evidence points
                    existing_evidence = existing_evidence[-10:]
                    
                    # Update severity if escalated
                    if severity == "CRITICAL" and existing_incident["severity"] != "CRITICAL":
                        existing_incident["severity"] = "CRITICAL"
                    
                    existing_incident["evidence_json"] = json.dumps(existing_evidence)
                    
                    timeline_event = {
                        "incident_id": existing_incident["id"],
                        "timestamp": datetime.utcnow().isoformat(),
                        "event_type": "FAILURE_RECURRENCE",
                        "description": f"Consecutive failure #{consecutive}: {error_type or 'Probe Failure'} ({error_msg})",
                        "actor": "system:sentinel_engine"
                    }
                    return None, existing_incident, timeline_event
                else:
                    # Create new Incident
                    inc_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
                    new_incident = {
                        "id": inc_id,
                        "service_id": service_id,
                        "title": f"Service Degradation: {service.get('name', service_id)} [{error_type or status}]",
                        "status": "OPEN",
                        "severity": severity,
                        "probable_cause": probable_cause,
                        "confidence_score": confidence,
                        "evidence_json": json.dumps(evidence),
                        "started_at": datetime.utcnow().isoformat(),
                        "timeline_events": [
                            {
                                "id": 1,
                                "incident_id": inc_id,
                                "timestamp": datetime.utcnow().isoformat(),
                                "event_type": "DETECTED",
                                "description": f"Incident triggered after {consecutive} consecutive failure(s): {probable_cause}",
                                "actor": "system:sentinel_engine"
                            }
                        ]
                    }
                    return new_incident, None, None

        # Scenario 2: Probe is HEALTHY
        elif status == "HEALTHY":
            if existing_incident:
                # If service had an incident, verify consecutive successes for auto-resolution or notification
                consecutive_succ = service.get("consecutive_successes", 0) + 1
                if consecutive_succ >= 2: # 2 consecutive successes to mark resolved
                    existing_incident["status"] = "RESOLVED"
                    existing_incident["resolved_at"] = datetime.utcnow().isoformat()
                    existing_incident["resolved_by"] = "system:automated_health_recovery"
                    existing_incident["resolution_notes"] = f"Service returned to HEALTHY state for {consecutive_succ} consecutive check cycles."
                    
                    timeline_event = {
                        "incident_id": existing_incident["id"],
                        "timestamp": datetime.utcnow().isoformat(),
                        "event_type": "RESOLVED",
                        "description": f"Service health verified nominal ({round(total_latency, 1)}ms). Incident closed.",
                        "actor": "system:automated_health_recovery"
                    }
                    return None, existing_incident, timeline_event

        return None, None, None

    def _deduce_cause_and_severity(
        self, 
        probe_result: Dict[str, Any], 
        consecutive_failures: int
    ) -> Tuple[str, str, float, List[Dict[str, Any]]]:
        """
        Deduces severity, evidence-backed probable cause, and confidence level
        """
        err_type = probe_result.get("error_type") or "UNKNOWN"
        http_code = probe_result.get("http_status_code")
        latency = probe_result.get("total_latency_ms", 0.0)
        tls_valid = probe_result.get("tls_valid", True)
        tls_days = probe_result.get("tls_expires_days")
        msg = probe_result.get("error_message") or ""

        evidence = [{
            "timestamp": datetime.utcnow().isoformat(),
            "error_type": err_type,
            "http_status": http_code,
            "latency_ms": latency,
            "dns_ms": probe_result.get("dns_resolution_ms", 0.0),
            "tcp_ms": probe_result.get("tcp_handshake_ms", 0.0),
            "message": msg
        }]

        if err_type in ["DNS_RESOLUTION_FAILURE", "DNS_NXDOMAIN"]:
            return "CRITICAL", f"DNS resolution failure: authoritative nameserver returned NXDOMAIN or timed out ({msg})", 0.95, evidence
        
        if err_type in ["TCP_CONNECTION_REFUSED", "TCP_SOCKET_ERROR"]:
            return "CRITICAL", f"TCP connection refused: destination port is closed or listening process crashed ({msg})", 0.98, evidence

        if err_type == "TCP_CONNECTION_TIMEOUT":
            return "CRITICAL", f"TCP connection timed out: packet loss, route blackholing, or firewall drop ({msg})", 0.90, evidence

        if not tls_valid or (tls_days is not None and tls_days < 0):
            return "MAJOR", f"TLS Certificate expired or invalid: handshake verification failed ({msg})", 0.99, evidence

        if http_code == 500:
            return "MAJOR", "HTTP 500 Internal Server Error: application unhandled exception in backend origin", 0.92, evidence

        if http_code in [502, 503, 504]:
            return "CRITICAL", f"HTTP {http_code} Gateway/Proxy error: edge reverse proxy cannot communicate with upstream backend origin", 0.94, evidence

        if latency > self.latency_threshold_ms:
            severity = "MAJOR" if latency > self.latency_threshold_ms * 2.5 else "MINOR"
            return severity, f"Latency degradation: probe response time ({round(latency, 1)}ms) exceeded SLA threshold ({self.latency_threshold_ms}ms)", 0.85, evidence

        # Default fallback
        severity = "CRITICAL" if consecutive_failures >= 3 else "MAJOR"
        return severity, f"Consecutive health check failures observed: {msg or 'Unknown probe anomaly'}", 0.75, evidence

incident_engine = IncidentEngine()
