"""
Unit & Integration Tests: Network Probing Engine
Tailored for Akamai Reliability & Network Engineering (Job ID 4073)
"""
import unittest
import sys
import os

# Add root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.prober import NetworkProber

class TestNetworkProber(unittest.TestCase):
    def setUp(self):
        self.prober = NetworkProber(timeout_sec=2)

    def test_dns_resolution_failure(self):
        """Validates that unresolvable domain correctly triggers DNS_RESOLUTION_FAILURE and DOWN state"""
        result = self.prober.probe(
            target_url="http://nonexistent-domain-akamai-test-12345.xyz",
            target_host="nonexistent-domain-akamai-test-12345.xyz",
            target_port=80,
            protocol="HTTP",
            timeout_sec=1
        )
        self.assertEqual(result["status"], "DOWN")
        self.assertIn(result["error_type"], ["DNS_RESOLUTION_FAILURE", "DNS_ERROR"])
        self.assertGreaterEqual(result["dns_resolution_ms"], 0.0)

    def test_tcp_connection_refused(self):
        """Validates that closed port returns TCP_CONNECTION_REFUSED immediately"""
        # Port 59999 is typically closed locally
        result = self.prober.probe(
            target_url="http://127.0.0.1:59999",
            target_host="127.0.0.1",
            target_port=59999,
            protocol="HTTP",
            timeout_sec=1
        )
        self.assertEqual(result["status"], "DOWN")
        self.assertIn(result["error_type"], ["TCP_CONNECTION_REFUSED", "TCP_SOCKET_ERROR", "TCP_CONNECTION_TIMEOUT"])

    def test_chaos_simulation_modes(self):
        """Validates controlled chaos failure injection triggers expected failure taxonomy"""
        # 1. DNS Failure Chaos
        res_dns = self.prober.probe(
            target_url="http://mock-service",
            target_host="mock-service",
            target_port=80,
            chaos_state={"mode": "dns_failure"}
        )
        self.assertEqual(res_dns["status"], "DOWN")
        self.assertEqual(res_dns["error_type"], "DNS_NXDOMAIN")

        # 2. TCP Drop Chaos
        res_tcp = self.prober.probe(
            target_url="http://mock-service",
            target_host="mock-service",
            target_port=80,
            chaos_state={"mode": "tcp_drop"}
        )
        self.assertEqual(res_tcp["status"], "DOWN")
        self.assertEqual(res_tcp["error_type"], "TCP_CONNECTION_REFUSED")

        # 3. HTTP 500 Chaos
        res_http = self.prober.probe(
            target_url="http://mock-service",
            target_host="mock-service",
            target_port=80,
            chaos_state={"mode": "http_500"}
        )
        self.assertEqual(res_http["status"], "DOWN")
        self.assertEqual(res_http["http_status_code"], 500)
        self.assertEqual(res_http["error_type"], "HTTP_INTERNAL_SERVER_ERROR")

        # 4. Latency Spike Chaos
        res_lat = self.prober.probe(
            target_url="http://mock-service",
            target_host="mock-service",
            target_port=80,
            chaos_state={"mode": "latency_spike", "latency_ms": 100.0}
        )
        self.assertEqual(res_lat["status"], "DEGRADED")
        self.assertEqual(res_lat["error_type"], "LATENCY_THRESHOLD_EXCEEDED")

if __name__ == "__main__":
    unittest.main()
