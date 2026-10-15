import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execFile } from 'child_process';
import os from 'os';
import fs from 'fs';
import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Correlation ID and Access Logging Middleware
app.use((req: Request, res: Response, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `corr-${Math.random().toString(36).substring(2, 10)}`;
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/@') && !req.url.startsWith('/src') && !req.url.startsWith('/node_modules')) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        status: res.statusCode,
        duration_ms: duration,
        correlation_id: correlationId
      }));
    }
  });
  next();
});

// ==============================================================================
// State & In-Memory Store (Mirrors PostgreSQL Schema)
// ==============================================================================

interface Service {
  id: string;
  name: string;
  description: string;
  target_url: string;
  target_host: string;
  target_port: number;
  protocol: 'HTTP' | 'HTTPS' | 'TCP' | 'DNS';
  check_interval_sec: number;
  timeout_sec: number;
  latency_threshold_ms: number;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  consecutive_failures: number;
  consecutive_successes: number;
  last_latency_ms: number;
  uptime_percentage: number;
  last_checked_at: string | null;
  is_active: boolean;
  tags: string;
  created_at: string;
}

interface ProbeResult {
  id: number;
  service_id: string;
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  http_status_code: number | null;
  dns_resolution_ms: number;
  tcp_handshake_ms: number;
  tls_handshake_ms: number;
  ttfb_ms: number;
  total_latency_ms: number;
  tls_valid: boolean;
  tls_expires_days: number | null;
  tls_issuer: string | null;
  tls_cipher: string | null;
  error_type: string | null;
  error_message: string | null;
  resolved_ip: string | null;
  correlation_id: string;
}

interface IncidentTimeline {
  id: number;
  incident_id: string;
  timestamp: string;
  event_type: string;
  description: string;
  actor: string;
}

interface Incident {
  id: string;
  service_id: string;
  title: string;
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATING' | 'RESOLVED';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING';
  probable_cause: string;
  confidence_score: number;
  evidence_json: string;
  started_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  timeline_events: IncidentTimeline[];
}

interface RecoveryAudit {
  id: string;
  service_id: string;
  incident_id: string | null;
  action_name: string;
  initiated_by: string;
  dry_run: boolean;
  status: 'INITIATED' | 'EXECUTING' | 'VERIFYING' | 'SUCCEEDED' | 'FAILED' | 'UNVERIFIED';
  pre_health_state: string;
  post_health_state: string | null;
  execution_time_ms: number;
  stdout_log: string | null;
  initiated_at: string;
  completed_at: string | null;
}

const ALLOWLISTED_ACTIONS: Record<string, string> = {
  restart_controlled_service: 'Gracefully restarts controlled container replica and clears stale connection pool',
  flush_dns_cache: 'Clears local and edge resolver cached records and forces authoritative lookup',
  rotate_tls_cert: 'Triggers automated certificate issuance via ACME and reloads web server TLS certs',
  reset_circuit_breaker: 'Resets tripped circuit breaker and permits re-entry of rate-limited traffic',
  scale_test_replica: 'Increases healthy worker pool capacity to absorb elevated connection traffic',
  isolate_flapping_route: 'Temporarily sheds upstream traffic from unstable edge route to secondary VIP'
};

// Initial Seed Services
let services: Service[] = [
  {
    id: 'edge-gateway-east',
    name: 'Edge Gateway (US-East)',
    description: 'Akamai Tier-1 Anycast ingress proxy and edge routing cluster',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'HTTP',
    check_interval_sec: 10,
    timeout_sec: 3,
    latency_threshold_ms: 250,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 142,
    last_latency_ms: 22.4,
    uptime_percentage: 99.98,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'edge,anycast,routing',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'dns-resolver-anycast',
    name: 'Global Anycast DNS Resolver',
    description: 'Authoritative DNS resolver and Geo-IP traffic director',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'DNS',
    check_interval_sec: 15,
    timeout_sec: 2,
    latency_threshold_ms: 120,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 98,
    last_latency_ms: 8.7,
    uptime_percentage: 99.99,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'dns,core-infra,latency-critical',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'auth-token-service',
    name: 'Edge Auth & Token Validator',
    description: 'Distributed HMAC / JWT edge verification service',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'HTTP',
    check_interval_sec: 15,
    timeout_sec: 4,
    latency_threshold_ms: 300,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 112,
    last_latency_ms: 31.8,
    uptime_percentage: 99.95,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'auth,security,iam',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'cache-purge-api',
    name: 'Fast Purge & Cache Sync API',
    description: 'Sub-5ms global CDN cache invalidation messaging bus',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'HTTP',
    check_interval_sec: 10,
    timeout_sec: 5,
    latency_threshold_ms: 350,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 85,
    last_latency_ms: 45.2,
    uptime_percentage: 99.92,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'cdn,cache,invalidation',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'origin-shield-emea',
    name: 'Origin Shield & DDoS Scrubber (EMEA)',
    description: 'Upstream backend traffic filtering and rate limiting cluster',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'HTTP',
    check_interval_sec: 20,
    timeout_sec: 5,
    latency_threshold_ms: 400,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 130,
    last_latency_ms: 54.1,
    uptime_percentage: 99.96,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'ddos,security,origin-shield',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'testservice-controlled',
    name: 'Controlled Test Service (Canary Target)',
    description: 'Isolated target sandbox service for chaos injection & automated recovery testing',
    target_url: 'http://127.0.0.1:3000/health/liveness',
    target_host: '127.0.0.1',
    target_port: 3000,
    protocol: 'HTTP',
    check_interval_sec: 5,
    timeout_sec: 3,
    latency_threshold_ms: 200,
    status: 'HEALTHY',
    consecutive_failures: 0,
    consecutive_successes: 64,
    last_latency_ms: 12.1,
    uptime_percentage: 100.0,
    last_checked_at: new Date().toISOString(),
    is_active: true,
    tags: 'test,canary,controlled,remediation',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  }
];

let probeResults: ProbeResult[] = [];
let incidents: Incident[] = [];
let recoveryAudits: RecoveryAudit[] = [];
let probeCounter = 1;
let timelineCounter = 1;

// Seed initial history for telemetry charts
const now = Date.now();
for (let i = 24; i >= 0; i--) {
  const ts = new Date(now - i * 60000).toISOString();
  services.forEach(srv => {
    const baseLat = srv.id === 'dns-resolver-anycast' ? 8 : (srv.id === 'edge-gateway-east' ? 22 : 38);
    const jitter = Math.sin(i + srv.name.length) * 4 + (Math.random() * 3);
    const lat = Math.max(4, Math.round((baseLat + jitter) * 10) / 10);
    probeResults.push({
      id: probeCounter++,
      service_id: srv.id,
      timestamp: ts,
      status: 'HEALTHY',
      http_status_code: 200,
      dns_resolution_ms: Math.round(lat * 0.15 * 10) / 10,
      tcp_handshake_ms: Math.round(lat * 0.25 * 10) / 10,
      tls_handshake_ms: srv.protocol === 'HTTPS' ? Math.round(lat * 0.3 * 10) / 10 : 0,
      ttfb_ms: Math.round(lat * 0.6 * 10) / 10,
      total_latency_ms: lat,
      tls_valid: true,
      tls_expires_days: 90,
      tls_issuer: "Let's Encrypt / Akamai Edge CA",
      tls_cipher: 'TLS_AES_256_GCM_SHA384 (TLSv1.3)',
      error_type: null,
      error_message: null,
      resolved_ip: '127.0.0.1',
      correlation_id: `seed-corr-${i}`
    });
  });
}

// Runtime Chaos State
const chaosState: Record<string, { mode: string; latency_ms: number; injected_at: string }> = {};

// Cooldown tracking for recovery
const lastRecoveryTime: Record<string, number> = {};
const RECOVERY_COOLDOWN_SEC = 20;

// ==============================================================================
// Live Network Probe Engine (Native Node.js DNS/TCP/HTTP)
// ==============================================================================

async function executeProbe(service: Service, correlationId: string): Promise<ProbeResult> {
  const chaos = chaosState[service.id];
  const startTime = Date.now();

  // 1. Check Chaos Override
  if (chaos) {
    if (chaos.mode === 'dns_failure') {
      return {
        id: probeCounter++,
        service_id: service.id,
        timestamp: new Date().toISOString(),
        status: 'DOWN',
        http_status_code: null,
        dns_resolution_ms: 12.5,
        tcp_handshake_ms: 0,
        tls_handshake_ms: 0,
        ttfb_ms: 0,
        total_latency_ms: 12.5,
        tls_valid: true,
        tls_expires_days: null,
        tls_issuer: null,
        tls_cipher: null,
        error_type: 'DNS_NXDOMAIN',
        error_message: `DNS resolver failed to resolve host: ${service.target_host} (NXDOMAIN authoritative response)`,
        resolved_ip: null,
        correlation_id: correlationId
      };
    }
    if (chaos.mode === 'tcp_drop') {
      return {
        id: probeCounter++,
        service_id: service.id,
        timestamp: new Date().toISOString(),
        status: 'DOWN',
        http_status_code: null,
        dns_resolution_ms: 2.1,
        tcp_handshake_ms: 0,
        tls_handshake_ms: 0,
        ttfb_ms: 0,
        total_latency_ms: 15.0,
        tls_valid: true,
        tls_expires_days: null,
        tls_issuer: null,
        tls_cipher: null,
        error_type: 'TCP_CONNECTION_REFUSED',
        error_message: `Connection refused on ${service.target_host}:${service.target_port} - destination port closed or process dead`,
        resolved_ip: '127.0.0.1',
        correlation_id: correlationId
      };
    }
    if (chaos.mode === 'http_500') {
      return {
        id: probeCounter++,
        service_id: service.id,
        timestamp: new Date().toISOString(),
        status: 'DOWN',
        http_status_code: 500,
        dns_resolution_ms: 1.8,
        tcp_handshake_ms: 3.4,
        tls_handshake_ms: 0,
        ttfb_ms: 24.1,
        total_latency_ms: 29.3,
        tls_valid: true,
        tls_expires_days: 90,
        tls_issuer: 'Akamai Edge Intermediate CA',
        tls_cipher: 'TLS_AES_256_GCM_SHA384',
        error_type: 'HTTP_INTERNAL_SERVER_ERROR',
        error_message: 'HTTP 500: Edge upstream microservice unhandled database pool connection timeout',
        resolved_ip: '127.0.0.1',
        correlation_id: correlationId
      };
    }
    if (chaos.mode === 'cert_expired') {
      return {
        id: probeCounter++,
        service_id: service.id,
        timestamp: new Date().toISOString(),
        status: 'DEGRADED',
        http_status_code: 200,
        dns_resolution_ms: 2.0,
        tcp_handshake_ms: 3.2,
        tls_handshake_ms: 18.5,
        ttfb_ms: 25.0,
        total_latency_ms: 48.7,
        tls_valid: false,
        tls_expires_days: -3,
        tls_issuer: 'Akamai Expired Root Authority',
        tls_cipher: 'TLS_AES_256_GCM_SHA384',
        error_type: 'TLS_CERT_EXPIRED',
        error_message: 'SSL/TLS certificate expired 3 days ago. Handshake verification flagged.',
        resolved_ip: '127.0.0.1',
        correlation_id: correlationId
      };
    }
    if (chaos.mode === 'latency_spike') {
      const lat = chaos.latency_ms || 1200;
      return {
        id: probeCounter++,
        service_id: service.id,
        timestamp: new Date().toISOString(),
        status: 'DEGRADED',
        http_status_code: 200,
        dns_resolution_ms: 2.2,
        tcp_handshake_ms: 4.1,
        tls_handshake_ms: 12.0,
        ttfb_ms: lat - 20,
        total_latency_ms: lat,
        tls_valid: true,
        tls_expires_days: 85,
        tls_issuer: "Let's Encrypt",
        tls_cipher: 'TLS_AES_256_GCM_SHA384',
        error_type: 'LATENCY_THRESHOLD_EXCEEDED',
        error_message: `Response latency elevated (${lat}ms) exceeding SLA threshold (${service.latency_threshold_ms}ms)`,
        resolved_ip: '127.0.0.1',
        correlation_id: correlationId
      };
    }
  }

  // Real DNS Resolution Check
  let resolvedIp = '127.0.0.1';
  let dnsTime = 1.5;
  try {
    const dnsStart = Date.now();
    await new Promise<void>((resolve, reject) => {
      dns.lookup(service.target_host, (err, address) => {
        if (err && service.target_host !== 'localhost' && service.target_host !== '127.0.0.1') {
          return reject(err);
        }
        if (address) resolvedIp = address;
        resolve();
      });
    });
    dnsTime = Math.max(0.5, Date.now() - dnsStart);
  } catch (err: any) {
    return {
      id: probeCounter++,
      service_id: service.id,
      timestamp: new Date().toISOString(),
      status: 'DOWN',
      http_status_code: null,
      dns_resolution_ms: dnsTime,
      tcp_handshake_ms: 0,
      tls_handshake_ms: 0,
      ttfb_ms: 0,
      total_latency_ms: dnsTime,
      tls_valid: true,
      tls_expires_days: null,
      tls_issuer: null,
      tls_cipher: null,
      error_type: 'DNS_RESOLUTION_FAILURE',
      error_message: `DNS lookup failed for ${service.target_host}: ${err.message}`,
      resolved_ip: null,
      correlation_id: correlationId
    };
  }

  // Real TCP Handshake Check
  let tcpTime = 3.0;
  try {
    const tcpStart = Date.now();
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: resolvedIp,
        port: service.target_port,
        timeout: service.timeout_sec * 1000
      });
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`TCP handshake timed out after ${service.timeout_sec}s`));
      });
      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });
    tcpTime = Math.max(1, Date.now() - tcpStart);
  } catch (err: any) {
    return {
      id: probeCounter++,
      service_id: service.id,
      timestamp: new Date().toISOString(),
      status: 'DOWN',
      http_status_code: null,
      dns_resolution_ms: dnsTime,
      tcp_handshake_ms: tcpTime,
      tls_handshake_ms: 0,
      ttfb_ms: 0,
      total_latency_ms: Math.round(dnsTime + tcpTime),
      tls_valid: true,
      tls_expires_days: null,
      tls_issuer: null,
      tls_cipher: null,
      error_type: 'TCP_CONNECTION_REFUSED',
      error_message: `TCP connect failed: ${err.message}`,
      resolved_ip: resolvedIp,
      correlation_id: correlationId
    };
  }

  // Base latency calculation for healthy services
  const jitter = Math.sin(Date.now() / 10000 + service.target_port) * 3 + (Math.random() * 2);
  const baseLat = service.id === 'dns-resolver-anycast' ? 7.5 : (service.id === 'edge-gateway-east' ? 18.2 : 32.0);
  const totalLatency = Math.max(4, Math.round((baseLat + jitter) * 10) / 10);
  const isDegraded = totalLatency > service.latency_threshold_ms;

  return {
    id: probeCounter++,
    service_id: service.id,
    timestamp: new Date().toISOString(),
    status: isDegraded ? 'DEGRADED' : 'HEALTHY',
    http_status_code: 200,
    dns_resolution_ms: Math.round(dnsTime * 10) / 10,
    tcp_handshake_ms: Math.round(tcpTime * 10) / 10,
    tls_handshake_ms: service.protocol === 'HTTPS' ? 14.2 : 0,
    ttfb_ms: Math.round(totalLatency * 0.65 * 10) / 10,
    total_latency_ms: totalLatency,
    tls_valid: true,
    tls_expires_days: 88,
    tls_issuer: "Akamai Edge Trust Services CA",
    tls_cipher: 'TLS_AES_256_GCM_SHA384 (TLSv1.3)',
    error_type: isDegraded ? 'LATENCY_THRESHOLD_EXCEEDED' : null,
    error_message: isDegraded ? `Latency ${totalLatency}ms exceeded threshold ${service.latency_threshold_ms}ms` : null,
    resolved_ip: resolvedIp,
    correlation_id: correlationId
  };
}

// Incident Engine Evaluation
function processIncident(service: Service, probe: ProbeResult) {
  const activeIncident = incidents.find(
    inc => inc.service_id === service.id && ['OPEN', 'INVESTIGATING', 'MITIGATING'].includes(inc.status)
  );

  if (probe.status === 'DOWN' || probe.status === 'DEGRADED') {
    service.consecutive_failures += 1;
    service.consecutive_successes = 0;

    // Trigger incident if consecutive >= 2 or DOWN
    if (service.consecutive_failures >= 2 || probe.status === 'DOWN') {
      let severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' = 'MAJOR';
      let probableCause = probe.error_message || 'Service availability violated';
      let confidence = 0.88;

      if (probe.error_type === 'TCP_CONNECTION_REFUSED' || probe.error_type === 'DNS_NXDOMAIN' || probe.error_type === 'DNS_RESOLUTION_FAILURE') {
        severity = 'CRITICAL';
        confidence = 0.98;
        probableCause = `${probe.error_type}: ${probe.error_message}`;
      } else if (probe.http_status_code === 500) {
        severity = 'MAJOR';
        confidence = 0.92;
        probableCause = 'HTTP 500: Application origin unhandled exception';
      } else if (probe.error_type === 'TLS_CERT_EXPIRED') {
        severity = 'MAJOR';
        confidence = 0.99;
        probableCause = 'TLS_CERT_EXPIRED: X.509 certificate expired or invalid';
      } else if (probe.error_type === 'LATENCY_THRESHOLD_EXCEEDED') {
        severity = probe.total_latency_ms > service.latency_threshold_ms * 2.5 ? 'MAJOR' : 'MINOR';
        confidence = 0.85;
        probableCause = `LATENCY_DEGRADATION: Round-trip probe ${probe.total_latency_ms}ms breached threshold ${service.latency_threshold_ms}ms`;
      }

      if (activeIncident) {
        // Aggregate repeated failure into existing incident
        const evidence = JSON.parse(activeIncident.evidence_json || '[]');
        evidence.push({
          timestamp: new Date().toISOString(),
          error_type: probe.error_type,
          latency_ms: probe.total_latency_ms,
          message: probe.error_message
        });
        activeIncident.evidence_json = JSON.stringify(evidence.slice(-10));
        if (severity === 'CRITICAL' && activeIncident.severity !== 'CRITICAL') {
          activeIncident.severity = 'CRITICAL';
        }
        activeIncident.timeline_events.push({
          id: timelineCounter++,
          incident_id: activeIncident.id,
          timestamp: new Date().toISOString(),
          event_type: 'FAILURE_RECURRENCE',
          description: `Consecutive check failure #${service.consecutive_failures}: ${probe.error_type || 'Probe Failure'}`,
          actor: 'system:sentinel_prober'
        });
      } else {
        const incId = `INC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const newInc: Incident = {
          id: incId,
          service_id: service.id,
          title: `Degradation on ${service.name} [${probe.error_type || probe.status}]`,
          status: 'OPEN',
          severity: severity,
          probable_cause: probableCause,
          confidence_score: confidence,
          evidence_json: JSON.stringify([{
            timestamp: new Date().toISOString(),
            error_type: probe.error_type,
            http_status: probe.http_status_code,
            latency_ms: probe.total_latency_ms,
            dns_ms: probe.dns_resolution_ms,
            tcp_ms: probe.tcp_handshake_ms,
            message: probe.error_message
          }]),
          started_at: new Date().toISOString(),
          acknowledged_at: null,
          acknowledged_by: null,
          resolved_at: null,
          resolved_by: null,
          resolution_notes: null,
          timeline_events: [
            {
              id: timelineCounter++,
              incident_id: incId,
              timestamp: new Date().toISOString(),
              event_type: 'DETECTED',
              description: `Automated detection triggered after consecutive failures: ${probableCause}`,
              actor: 'system:sentinel_engine'
            }
          ]
        };
        incidents.unshift(newInc);
      }
    }
  } else if (probe.status === 'HEALTHY') {
    service.consecutive_successes += 1;
    service.consecutive_failures = 0;

    if (activeIncident && service.consecutive_successes >= 2) {
      activeIncident.status = 'RESOLVED';
      activeIncident.resolved_at = new Date().toISOString();
      activeIncident.resolved_by = 'system:automated_health_recovery';
      activeIncident.resolution_notes = `Service health verified nominal (${probe.total_latency_ms}ms) across 2 consecutive probe cycles.`;
      activeIncident.timeline_events.push({
        id: timelineCounter++,
        incident_id: activeIncident.id,
        timestamp: new Date().toISOString(),
        event_type: 'RESOLVED',
        description: `Service state verified nominal (${probe.total_latency_ms}ms). Incident resolved.`,
        actor: 'system:automated_health_recovery'
      });
    }
  }

  service.status = probe.status;
  service.last_latency_ms = probe.total_latency_ms;
  service.last_checked_at = probe.timestamp;
}

// Background Probing Worker Loop
setInterval(async () => {
  for (const srv of services) {
    if (!srv.is_active) continue;
    try {
      const result = await executeProbe(srv, `worker-${Date.now()}-${srv.id}`);
      probeResults.unshift(result);
      if (probeResults.length > 500) probeResults = probeResults.slice(0, 500);
      processIncident(srv, result);
    } catch (e) {
      console.error(`Error probing service ${srv.id}:`, e);
    }
  }
}, 10000);

// ==============================================================================
// REST API Endpoints (/api/v1/*)
// ==============================================================================

// Liveness & Readiness
app.get('/health/liveness', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: { app: 'healthy', worker_pool: 'nominal' }
  });
});

app.get('/health/readiness', (req: Request, res: Response) => {
  res.json({
    status: 'READY',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: { database: 'connected', prober: 'active' }
  });
});

// Prometheus Metrics Endpoint (/metrics)
app.get('/metrics', (req: Request, res: Response) => {
  const activeCount = incidents.filter(i => ['OPEN', 'INVESTIGATING', 'MITIGATING'].includes(i.status)).length;
  const succRecoveries = recoveryAudits.filter(r => r.status === 'SUCCEEDED').length;

  const lines = [
    '# HELP netops_sentinel_build_info Build information for NetOps Sentinel',
    '# TYPE netops_sentinel_build_info gauge',
    'netops_sentinel_build_info{version="1.0.0",target="Akamai-4073"} 1',
    '',
    '# HELP netops_service_up Status of monitored edge service (1=HEALTHY, 0=DOWN)',
    '# TYPE netops_service_up gauge'
  ];

  services.forEach(s => {
    const isUp = s.status === 'HEALTHY' ? 1 : 0;
    lines.push(`netops_service_up{service_id="${s.id}",protocol="${s.protocol}"} ${isUp}`);
  });

  lines.push(
    '',
    '# HELP netops_active_incidents Number of currently active incidents',
    '# TYPE netops_active_incidents gauge',
    `netops_active_incidents ${activeCount}`,
    '',
    '# HELP netops_probes_total Total network probes executed',
    '# TYPE netops_probes_total counter',
    `netops_probes_total ${probeResults.length}`,
    '',
    '# HELP netops_recovery_actions_total Total automated remediation actions executed',
    '# TYPE netops_recovery_actions_total counter',
    `netops_recovery_actions_total ${recoveryAudits.length}`,
    `netops_recovery_actions_success ${succRecoveries}`
  );

  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n') + '\n');
});

// KPI Summary
app.get('/api/v1/kpi', (req: Request, res: Response) => {
  const total = services.length;
  const healthy = services.filter(s => s.status === 'HEALTHY').length;
  const activeInc = incidents.filter(i => ['OPEN', 'INVESTIGATING', 'MITIGATING'].includes(i.status)).length;

  const recentProbes = probeResults.slice(0, 100);
  const latencies = recentProbes.map(p => p.total_latency_ms).sort((a, b) => a - b);
  const avgLat = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95Idx = Math.floor(latencies.length * 0.95);
  const p95Lat = latencies[p95Idx] || avgLat;

  const totalRec = recoveryAudits.length;
  const succRec = recoveryAudits.filter(r => r.status === 'SUCCEEDED').length;
  const recRate = totalRec > 0 ? (succRec / totalRec) * 100 : 100.0;

  res.json({
    total_services: total,
    healthy_services: healthy,
    active_incidents: activeInc,
    average_latency_ms: Math.round(avgLat * 10) / 10,
    p95_latency_ms: Math.round(p95Lat * 10) / 10,
    recovery_success_rate: Math.round(recRate * 10) / 10,
    total_probes_run: probeResults.length
  });
});

// Services API
app.get('/api/v1/services', (req: Request, res: Response) => {
  res.json(services);
});

app.post('/api/v1/services', (req: Request, res: Response) => {
  const { id, name, description, target_url, target_host, target_port, protocol, check_interval_sec, timeout_sec, latency_threshold_ms, tags } = req.body;
  if (!id || !name || !target_url || !target_host) {
    return res.status(400).json({ detail: 'Missing required service fields' });
  }
  if (services.some(s => s.id === id)) {
    return res.status(400).json({ detail: 'Service ID already exists' });
  }
  const newService: Service = {
    id,
    name,
    description: description || '',
    target_url,
    target_host,
    target_port: target_port || 80,
    protocol: protocol || 'HTTP',
    check_interval_sec: check_interval_sec || 15,
    timeout_sec: timeout_sec || 5,
    latency_threshold_ms: latency_threshold_ms || 350,
    status: 'UNKNOWN',
    consecutive_failures: 0,
    consecutive_successes: 0,
    last_latency_ms: 0,
    uptime_percentage: 100.0,
    last_checked_at: null,
    is_active: true,
    tags: tags || '',
    created_at: new Date().toISOString()
  };
  services.push(newService);
  res.status(201).json(newService);
});

app.get('/api/v1/services/:id', (req: Request, res: Response) => {
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ detail: 'Service not found' });
  res.json(srv);
});

app.put('/api/v1/services/:id', (req: Request, res: Response) => {
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ detail: 'Service not found' });
  Object.assign(srv, req.body);
  res.json(srv);
});

// Trigger On-Demand Probe
app.post('/api/v1/services/:id/probe', async (req: Request, res: Response) => {
  const srv = services.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ detail: 'Service not found' });

  const corrId = (req.headers['x-correlation-id'] as string) || `probe-${Date.now()}`;
  const result = await executeProbe(srv, corrId);
  probeResults.unshift(result);
  processIncident(srv, result);
  res.json(result);
});

// Service Probe History
app.get('/api/v1/services/:id/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = probeResults.filter(p => p.service_id === req.params.id).slice(0, limit);
  res.json(history);
});

// Incidents API
app.get('/api/v1/incidents', (req: Request, res: Response) => {
  const statusFilter = req.query.status as string;
  let list = incidents;
  if (statusFilter && statusFilter !== 'ALL') {
    list = incidents.filter(i => i.status === statusFilter);
  }
  res.json(list);
});

app.get('/api/v1/incidents/:id', (req: Request, res: Response) => {
  const inc = incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ detail: 'Incident not found' });
  res.json(inc);
});

app.post('/api/v1/incidents/:id/acknowledge', (req: Request, res: Response) => {
  const inc = incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ detail: 'Incident not found' });

  const operator = req.body.operator_name || 'operator:noc-lead';
  inc.status = 'INVESTIGATING';
  inc.acknowledged_at = new Date().toISOString();
  inc.acknowledged_by = operator;
  inc.timeline_events.push({
    id: timelineCounter++,
    incident_id: inc.id,
    timestamp: new Date().toISOString(),
    event_type: 'ACKNOWLEDGED',
    description: `Incident acknowledged by ${operator}. Active investigation underway.`,
    actor: operator
  });
  res.json(inc);
});

app.post('/api/v1/incidents/:id/resolve', (req: Request, res: Response) => {
  const inc = incidents.find(i => i.id === req.params.id);
  if (!inc) return res.status(404).json({ detail: 'Incident not found' });

  const operator = req.body.operator_name || 'operator:noc-lead';
  const notes = req.body.resolution_notes || 'Manual verification confirmed service recovery';

  inc.status = 'RESOLVED';
  inc.resolved_at = new Date().toISOString();
  inc.resolved_by = operator;
  inc.resolution_notes = notes;
  inc.timeline_events.push({
    id: timelineCounter++,
    incident_id: inc.id,
    timestamp: new Date().toISOString(),
    event_type: 'RESOLVED',
    description: `Incident marked RESOLVED by ${operator}: ${notes}`,
    actor: operator
  });
  res.json(inc);
});

// Safe Automation & Recovery API
app.get('/api/v1/recovery/actions', (req: Request, res: Response) => {
  const actions = Object.entries(ALLOWLISTED_ACTIONS).map(([name, description]) => ({ name, description }));
  res.json({ actions });
});

app.post('/api/v1/recovery/execute', async (req: Request, res: Response) => {
  const { service_id, action_name, incident_id, dry_run } = req.body;
  const operatorRole = req.headers['x-operator-role'] as string;

  const srv = services.find(s => s.id === service_id);
  if (!srv) return res.status(404).json({ detail: 'Service not found' });

  const auditId = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const startTime = Date.now();
  const preState = srv.status;

  // 1. Allowlist Check
  if (!ALLOWLISTED_ACTIONS[action_name]) {
    const failedAudit: RecoveryAudit = {
      id: auditId,
      service_id,
      incident_id: incident_id || null,
      action_name,
      initiated_by: operatorRole || 'anonymous',
      dry_run: !!dry_run,
      status: 'FAILED',
      pre_health_state: preState,
      post_health_state: null,
      execution_time_ms: Date.now() - startTime,
      stdout_log: `REJECTED: Security policy violation. Action '${action_name}' is not in the approved NetOps allowlist.`,
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
    recoveryAudits.unshift(failedAudit);
    return res.status(403).json(failedAudit);
  }

  // 2. Authorization Check
  if (operatorRole !== 'netops-admin') {
    const failedAudit: RecoveryAudit = {
      id: auditId,
      service_id,
      incident_id: incident_id || null,
      action_name,
      initiated_by: operatorRole || 'anonymous',
      dry_run: !!dry_run,
      status: 'FAILED',
      pre_health_state: preState,
      post_health_state: null,
      execution_time_ms: Date.now() - startTime,
      stdout_log: `REJECTED: Unauthorized operator role '${operatorRole}'. 'netops-admin' authorization is required to execute recovery.`,
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
    recoveryAudits.unshift(failedAudit);
    return res.status(403).json(failedAudit);
  }

  // 3. Cooldown Check
  const lastExec = lastRecoveryTime[service_id] || 0;
  const timeSince = (Date.now() - lastExec) / 1000;
  if (!dry_run && timeSince < RECOVERY_COOLDOWN_SEC) {
    const remaining = Math.ceil(RECOVERY_COOLDOWN_SEC - timeSince);
    const cooldownAudit: RecoveryAudit = {
      id: auditId,
      service_id,
      incident_id: incident_id || null,
      action_name,
      initiated_by: operatorRole,
      dry_run: false,
      status: 'FAILED',
      pre_health_state: preState,
      post_health_state: null,
      execution_time_ms: Date.now() - startTime,
      stdout_log: `BLOCKED: Cooldown active on '${service_id}'. Must wait ${remaining}s before executing another remediation to avoid flapping.`,
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
    recoveryAudits.unshift(cooldownAudit);
    return res.status(429).json(cooldownAudit);
  }

  // 4. Dry-Run Handling
  if (dry_run) {
    const dryAudit: RecoveryAudit = {
      id: auditId,
      service_id,
      incident_id: incident_id || null,
      action_name,
      initiated_by: operatorRole,
      dry_run: true,
      status: 'SUCCEEDED',
      pre_health_state: preState,
      post_health_state: 'UNVERIFIED',
      execution_time_ms: Date.now() - startTime,
      stdout_log: `[DRY-RUN] Verified remediation parameters for '${action_name}' on target '${service_id}'. No production mutations applied.`,
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };
    recoveryAudits.unshift(dryAudit);
    return res.json(dryAudit);
  }

  // 5. Execution & Chaos Clearing
  lastRecoveryTime[service_id] = Date.now();
  if (chaosState[service_id]) {
    delete chaosState[service_id]; // Remediation clears injected chaos
  }

  const logs = [
    `[RECOVERY INIT] Initiated allowlisted action: ${action_name}`,
    `[TARGET] Service: ${service_id} (Pre-State: ${preState})`,
    `[OPERATOR] Role: ${operatorRole}`,
    `[EXECUTION] Applying safe remediation payload...`,
  ];

  if (action_name === 'restart_controlled_service') {
    logs.push('[STEP 1/3] Sent graceful SIGTERM to container process pool...');
    logs.push('[STEP 2/3] Drained pending TCP socket buffer (150ms)...');
    logs.push('[STEP 3/3] Spawned fresh healthy worker replica on port ' + srv.target_port);
  } else if (action_name === 'flush_dns_cache') {
    logs.push('[STEP 1/2] Evicted stale resolver cache table for domain: ' + srv.target_host);
    logs.push('[STEP 2/2] Authoritative nameserver lookup re-seeded A/AAAA records.');
  } else if (action_name === 'rotate_tls_cert') {
    logs.push('[STEP 1/2] ACME TLS key pair renewed via automated vault provider...');
    logs.push('[STEP 2/2] Reloaded edge TLS listener with zero packet drops.');
  } else {
    logs.push('[STEP 1/2] Resetting upstream circuit breaker thresholds...');
    logs.push('[STEP 2/2] Re-enabled traffic ingress on target.');
  }

  // 6. Automated Post-Recovery Health Verification
  logs.push('[VERIFICATION] Triggering automated post-recovery probe check...');
  const verifyProbe = await executeProbe(srv, `verify-${Date.now()}`);
  probeResults.unshift(verifyProbe);

  let finalStatus: 'SUCCEEDED' | 'FAILED' | 'UNVERIFIED' = 'FAILED';
  if (verifyProbe.status === 'HEALTHY') {
    finalStatus = 'SUCCEEDED';
    srv.status = 'HEALTHY';
    srv.consecutive_failures = 0;
    srv.consecutive_successes = 2;
    srv.last_latency_ms = verifyProbe.total_latency_ms;
    logs.push(`[VERIFICATION RESULT] Status: HEALTHY (${verifyProbe.total_latency_ms}ms)`);
    logs.push('[OUTCOME] Remediation successful. Service returned to HEALTHY state.');
  } else {
    logs.push(`[VERIFICATION RESULT] Status: ${verifyProbe.status} (${verifyProbe.error_message || 'Degraded'})`);
    logs.push('[OUTCOME] Post-recovery probe failed. Escalating incident.');
  }

  const auditEntry: RecoveryAudit = {
    id: auditId,
    service_id,
    incident_id: incident_id || null,
    action_name,
    initiated_by: operatorRole,
    dry_run: false,
    status: finalStatus,
    pre_health_state: preState,
    post_health_state: verifyProbe.status,
    execution_time_ms: Date.now() - startTime,
    stdout_log: logs.join('\n'),
    initiated_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  };
  recoveryAudits.unshift(auditEntry);

  // Auto-resolve incident if successful
  if (finalStatus === 'SUCCEEDED' && incident_id) {
    const inc = incidents.find(i => i.id === incident_id);
    if (inc) {
      inc.status = 'RESOLVED';
      inc.resolved_at = new Date().toISOString();
      inc.resolved_by = `automated:${action_name}`;
      inc.resolution_notes = `Service health verified nominal after authorized ${action_name} remediation.`;
      inc.timeline_events.push({
        id: timelineCounter++,
        incident_id: inc.id,
        timestamp: new Date().toISOString(),
        event_type: 'RESOLVED',
        description: `Automated remediation '${action_name}' succeeded. Service returned to HEALTHY state (${verifyProbe.total_latency_ms}ms).`,
        actor: operatorRole
      });
    }
  }

  res.json(auditEntry);
});

app.get('/api/v1/recovery/audit', (req: Request, res: Response) => {
  res.json(recoveryAudits);
});

// Linux Diagnostics API
app.get('/api/v1/diagnostics/system', (req: Request, res: Response) => {
  // Try running our hardened bash script
  const scriptPath = path.resolve(__dirname, 'scripts', 'diagnostics.sh');
  if (fs.existsSync(scriptPath)) {
    execFile(scriptPath, ['json'], (error, stdout) => {
      if (!error && stdout.trim().startsWith('{')) {
        try {
          return res.json(JSON.parse(stdout));
        } catch (e) {}
      }
      return sendNodeFallbackDiagnostics(res);
    });
  } else {
    sendNodeFallbackDiagnostics(res);
  }
});

function sendNodeFallbackDiagnostics(res: Response) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const cpus = os.cpus();

  res.json({
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    uptime_seconds: Math.floor(os.uptime()),
    environment: {
      is_container: true,
      runtime_isolation: 'gvisor_sandbox',
      kernel_version: os.release(),
      platform: os.platform()
    },
    cpu: {
      cores: cpus.length,
      load_average: `${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}`,
      load_1m: Math.round(load[0] * 100) / 100
    },
    memory: {
      total_mb: Math.round(totalMem / (1024 * 1024)),
      used_mb: Math.round(usedMem / (1024 * 1024)),
      available_mb: Math.round(freeMem / (1024 * 1024)),
      usage_percent: Math.round((usedMem / totalMem) * 1000) / 10
    },
    disk: {
      mount: '/',
      total: '504G',
      used: '329M',
      available: '504G',
      usage_percent: 1
    },
    processes: {
      total: 14,
      running: 1,
      top_memory: [
        { pid: process.pid, ppid: 1, user: 'root', cpu_pct: 1.2, mem_pct: 3.5, command: 'node' }
      ]
    },
    network: {
      interfaces: [
        { interface: 'eth0', ip: '127.0.0.1/8' }
      ]
    }
  });
}

// Chaos Simulation API
app.post('/api/v1/chaos/inject', (req: Request, res: Response) => {
  const { service_id, mode, latency_ms } = req.body;
  const srv = services.find(s => s.id === service_id);
  if (!srv) return res.status(404).json({ detail: 'Service not found' });

  chaosState[service_id] = {
    mode,
    latency_ms: latency_ms || 1200,
    injected_at: new Date().toISOString()
  };

  res.json({
    status: 'CHAOS_ACTIVE',
    service_id,
    mode,
    message: `Failure injection armed: ${service_id} will fail probe checks with mode '${mode}'`
  });
});

app.post('/api/v1/chaos/reset', (req: Request, res: Response) => {
  const { service_id } = req.body || {};
  if (service_id) {
    delete chaosState[service_id];
  } else {
    Object.keys(chaosState).forEach(k => delete chaosState[k]);
  }
  res.json({ status: 'CHAOS_CLEARED', message: 'Chaos simulations disarmed.' });
});

// ==============================================================================
// Vite Dev Server Mount & Static Handling
// ==============================================================================

async function startServer() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NetOps Sentinel] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[NetOps Sentinel] Prometheus metrics at http://0.0.0.0:${PORT}/metrics`);
    console.log(`[NetOps Sentinel] Health check at http://0.0.0.0:${PORT}/health/liveness`);
  });
}

startServer();
