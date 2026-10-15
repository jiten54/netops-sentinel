"""
Unit Tests: Incident Detection, Grouping, and Severity Engine
Tailored for Akamai Automated Incident Handling (Job ID 4073)
"""
import unittest
import json
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.incident_engine import IncidentEngine

class TestIncidentEngine(unittest.TestCase):
    def setUp(self):
        self.engine = IncidentEngine(failure_threshold=2, latency_threshold_ms=300.0)
        self.service = {
            "id": "edge-gateway-east",
            "name": "Edge Gateway (US-East)",
            "consecutive_failures": 0,
            "consecutive_successes": 5
        }

    def test_single_failure_does_not_prematurely_create_incident(self):
        """A single transient failure should not trigger an incident when threshold is 2"""
        probe_result = {
            "status": "DEGRADED",
            "error_type": "HTTP_504",
            "error_message": "Gateway Timeout",
            "total_latency_ms": 120.0
        }
        new_inc, upd_inc, _ = self.engine.evaluate_probe_result(self.service, probe_result, [])
        self.assertIsNone(new_inc)
        self.assertIsNone(upd_inc)

    def test_consecutive_failures_triggers_incident(self):
        """Two consecutive failures must trigger a new Incident with probable cause and evidence"""
        self.service["consecutive_failures"] = 1
        probe_result = {
            "status": "DOWN",
            "http_status_code": 500,
            "error_type": "HTTP_500",
            "error_message": "Internal Server Error",
            "total_latency_ms": 250.0
        }
        new_inc, upd_inc, _ = self.engine.evaluate_probe_result(self.service, probe_result, [])
        
        self.assertIsNotNone(new_inc)
        self.assertEqual(new_inc["service_id"], "edge-gateway-east")
        self.assertEqual(new_inc["status"], "OPEN")
        self.assertEqual(new_inc["severity"], "MAJOR")
        self.assertIn("HTTP 500", new_inc["probable_cause"])
        self.assertGreaterEqual(new_inc["confidence_score"], 0.90)

    def test_incident_grouping_aggregates_repeated_failures(self):
        """Repeated failures on the same service must append evidence without creating duplicate incidents"""
        active_inc = [{
            "id": "INC-TEST1234",
            "service_id": "edge-gateway-east",
            "status": "OPEN",
            "severity": "MAJOR",
            "evidence_json": json.dumps([{"msg": "first failure"}])
        }]
        self.service["consecutive_failures"] = 2
        probe_result = {
            "status": "DOWN",
            "error_type": "TCP_CONNECTION_REFUSED",
            "error_message": "Port 80 closed",
            "total_latency_ms": 10.0
        }
        new_inc, upd_inc, timeline_ev = self.engine.evaluate_probe_result(self.service, probe_result, active_inc)

        self.assertIsNone(new_inc) # No duplicate created!
        self.assertIsNotNone(upd_inc) # Existing incident updated!
        self.assertEqual(upd_inc["id"], "INC-TEST1234")
        self.assertEqual(upd_inc["severity"], "CRITICAL") # Escalated due to TCP refusal
        self.assertIsNotNone(timeline_ev)
        self.assertEqual(timeline_ev["event_type"], "FAILURE_RECURRENCE")

    def test_automated_recovery_resolution_after_consecutive_successes(self):
        """Consecutive healthy probes should auto-resolve an active incident"""
        active_inc = [{
            "id": "INC-TEST1234",
            "service_id": "edge-gateway-east",
            "status": "OPEN",
            "severity": "MAJOR",
            "evidence_json": "[]"
        }]
        self.service["consecutive_successes"] = 1
        probe_healthy = {
            "status": "HEALTHY",
            "http_status_code": 200,
            "total_latency_ms": 35.0
        }
        new_inc, upd_inc, timeline_ev = self.engine.evaluate_probe_result(self.service, probe_healthy, active_inc)
        
        self.assertIsNone(new_inc)
        self.assertIsNotNone(upd_inc)
        self.assertEqual(upd_inc["status"], "RESOLVED")
        self.assertEqual(timeline_ev["event_type"], "RESOLVED")

if __name__ == "__main__":
    unittest.main()
