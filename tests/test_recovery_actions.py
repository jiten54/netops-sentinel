"""
Unit Tests: Safe Automation and Remediation Engine
Tailored for Akamai Reliability Engineering (Job ID 4073)
"""
import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.recovery_engine import RecoveryEngine

class TestRecoveryEngine(unittest.TestCase):
    def setUp(self):
        self.engine = RecoveryEngine(cooldown_sec=5, execution_timeout_sec=5)

    def test_arbitrary_unallowlisted_action_rejected(self):
        """Security: Non-allowlisted arbitrary actions must be strictly rejected"""
        res = self.engine.execute_recovery(
            service_id="edge-gateway-east",
            action_name="rm_rf_root_directory",
            operator_role="netops-admin",
            pre_health_state="DOWN"
        )
        self.assertEqual(res["status"], "FAILED")
        self.assertIn("not in the approved NetOps allowlist", res["error"])

    def test_unauthorized_role_rejected(self):
        """RBAC: Non-admin users cannot trigger automated recovery actions"""
        res = self.engine.execute_recovery(
            service_id="edge-gateway-east",
            action_name="restart_controlled_service",
            operator_role="readonly-viewer",
            pre_health_state="DOWN"
        )
        self.assertEqual(res["status"], "FAILED")
        self.assertIn("Unauthorized", res["error"])

    def test_dry_run_simulation(self):
        """Dry-run mode verifies parameters without executing disruptive changes"""
        res = self.engine.execute_recovery(
            service_id="edge-gateway-east",
            action_name="flush_dns_cache",
            operator_role="netops-admin",
            pre_health_state="DOWN",
            dry_run=True
        )
        self.assertEqual(res["status"], "SUCCEEDED")
        self.assertTrue(res["dry_run"])
        self.assertEqual(res["post_health_state"], "UNVERIFIED")
        self.assertIn("[DRY-RUN]", res["stdout_log"])

    def test_authorized_recovery_with_post_verification(self):
        """Authorized action executes and validates post-health check"""
        def mock_verifier(sid):
            return {"status": "HEALTHY", "total_latency_ms": 28.5}

        res = self.engine.execute_recovery(
            service_id="edge-gateway-east",
            action_name="restart_controlled_service",
            operator_role="netops-admin",
            pre_health_state="DOWN",
            probe_verifier=mock_verifier
        )
        self.assertEqual(res["status"], "SUCCEEDED")
        self.assertEqual(res["post_health_state"], "HEALTHY")
        self.assertIn("Remediation successful", res["stdout_log"])

    def test_cooldown_enforcement(self):
        """Rapid repeated recovery actions on the same service must be rate-limited by cooldown"""
        # First execution
        self.engine.execute_recovery(
            service_id="flapping-service",
            action_name="restart_controlled_service",
            operator_role="netops-admin",
            pre_health_state="DOWN"
        )
        # Immediate second execution must fail with cooldown error
        res_second = self.engine.execute_recovery(
            service_id="flapping-service",
            action_name="restart_controlled_service",
            operator_role="netops-admin",
            pre_health_state="DOWN"
        )
        self.assertEqual(res_second["status"], "FAILED")
        self.assertIn("Cooldown in effect", res_second["error"])

if __name__ == "__main__":
    unittest.main()
