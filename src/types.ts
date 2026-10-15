export interface Service {
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

export interface ProbeResult {
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

export interface IncidentTimelineEvent {
  id: number;
  incident_id: string;
  timestamp: string;
  event_type: string;
  description: string;
  actor: string;
}

export interface Incident {
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
  timeline_events: IncidentTimelineEvent[];
}

export interface RecoveryAudit {
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

export interface KpiSummary {
  total_services: number;
  healthy_services: number;
  active_incidents: number;
  average_latency_ms: number;
  p95_latency_ms: number;
  recovery_success_rate: number;
  total_probes_run: number;
}

export interface LinuxDiagnostics {
  timestamp: string;
  hostname: string;
  uptime_seconds: number;
  environment: {
    is_container: boolean;
    runtime_isolation: string;
    kernel_version: string;
    os?: string;
    platform?: string;
  };
  cpu: {
    cores: number;
    load_average: string;
    load_1m: number;
  };
  memory: {
    total_mb: number;
    used_mb: number;
    available_mb: number;
    usage_percent: number;
  };
  disk: {
    mount: string;
    total: string;
    used?: string;
    available?: string;
    usage_percent: number;
  };
  processes: {
    total: number;
    running: number;
    top_memory: Array<{
      pid: number;
      ppid: number;
      user: string;
      cpu_pct: number;
      mem_pct: number;
      command: string;
    }>;
  };
  network: {
    interfaces: Array<{ interface: string; ip: string }>;
  };
}
