# NetOps Sentinel — Network Operations Automation & Observability Platform

[![CI/CD Pipeline](https://github.com/akamai-reliability/netops-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/akamai-reliability/netops-sentinel)
[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Target Role](https://img.shields.io/badge/Akamai%20Job%20ID-4073%20(Software%20Engineer)-orange.svg)](https://www.akamai.com/careers)

**NetOps Sentinel** is a production-grade, distributed network operations automation, probe observability, Linux systems diagnostic, and safe remediation platform specifically tailored to the **Akamai Software Engineer (Job ID 4073)** requirements.

It continuously inspects critical distributed edge services, records sub-millisecond network timings (DNS resolution, TCP 3-way handshake, TLS certificate expiry, and TTFB), aggregates consecutive health check failures into evidence-correlated Incidents, provides an allowlisted automated remediation runner with RBAC and cooldown safeguards, exports Prometheus metrics, and delivers a dark-mode Network Operations Center (NOC) cockpit.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Edge Layer & Probing Targets
        GW[Edge Gateway US-East: 3000/443]
        DNS_RESOLV[Anycast DNS Resolver: 53/853]
        AUTH[Edge Token Validator: 443]
        PURGE[Fast Purge API: 443]
        CANARY[Controlled Test Canary: 8080]
    end

    subgraph NetOps Sentinel Core Platform
        WORKER[Asynchronous Probe Worker Daemon<br/>(SIGINT/SIGTERM Graceful Shutdown)]
        API[FastAPI Application Server<br/>(Correlation ID Middleware, REST API v1)]
        INCIDENT[Incident Detection & Root Cause Engine<br/>(Consecutive Failure Gating, Evidence Correlation)]
        RECOVERY[Safe Remediation Engine<br/>(Allowlist Registry, RBAC, Cooldown, Post-Probe Verifier)]
        DIAG[Linux System Diagnostics<br/>(Procfs, Load Average, Container Isolation)]
    end

    subgraph Persistence & Observability
        DB[(PostgreSQL 16 / SQLite<br/>Alembic Migrations)]
        PROM[Prometheus Scraper<br/>(/metrics Endpoint)]
    end

    subgraph Operator Console
        UI[React 19 + TypeScript + Tailwind CSS<br/>NOC Operations Dashboard]
    end

    WORKER -->|HTTP / TCP / DNS / TLS Probes| GW
    WORKER -->|DNS Queries & TCP Check| DNS_RESOLV
    WORKER -->|TLS Handshake Inspection| AUTH
    WORKER -->|HTTP Latency TTFB| PURGE
    WORKER -->|Controlled Canary Probing| CANARY

    WORKER -->|Feed Raw Results| INCIDENT
    INCIDENT -->|Create / Deduplicate Incidents| DB
    WORKER -->|Persist Probe Metrics| DB
    DIAG -->|Kernel /proc Telemetry| WORKER

    API -->|Read Telemetry & Incidents| DB
    API -->|Expose Metrics| PROM
    UI -->|REST v1 /api/v1/*| API
    UI -->|Trigger Remediations| RECOVERY
    RECOVERY -->|Post-Recovery Health Verification| WORKER
```

---

## 🎯 Akamai Job ID 4073 Competency Alignment

| Akamai Requirement | NetOps Sentinel Implementation | Verification / Code Path |
| :--- | :--- | :--- |
| **Python Programming & Systems** | Python 3.12+, FastAPI, Pydantic v2 schemas, SQLAlchemy 2.0 ORM, async monitoring worker. | `backend/main.py`, `backend/prober.py`, `worker/monitoring_worker.py` |
| **Networking Protocols (HTTP, DNS, TCP, TLS)** | Multi-stage low-level network checks: DNS resolution timing, TCP connect handshake latency, TLS X.509 certificate expiry & cipher inspection, HTTP TTFB. | `backend/prober.py`, `scripts/network_probe.sh` |
| **Linux/Unix Systems & Shell Scripting** | Production Bash diagnostic scripts parsing `/proc/stat`, `/proc/loadavg`, `/proc/meminfo`, memory, disk utilization, and distinguishing container sandbox from host. | `scripts/diagnostics.sh`, `backend/diagnostics.py` |
| **Distributed Systems & Autonomous Workers** | Standalone worker daemon operating independently of frontend availability with graceful signal handling (`SIGINT`, `SIGTERM`). | `worker/monitoring_worker.py` |
| **Incident Engineering & Root Cause Analysis** | Consecutive failure gating, evidence correlation (error code, latency breakdown, IP resolution), automated severity calculation, and timeline audit. | `backend/incident_engine.py` |
| **Safe Automation & Site Reliability** | Strict allowlisted remediation registry (no arbitrary shell execution), `netops-admin` RBAC check, flapping cooldowns, dry-run simulation, and automated post-recovery probe verification. | `backend/recovery_engine.py` |
| **Observability & Metrics** | Prometheus-compatible `/metrics` exposition, structured JSON logging, and correlation ID (`X-Correlation-ID`) tracking. | `/metrics`, `backend/main.py` middleware, `prometheus.yml` |
| **Deployment & Containers** | Multi-container Docker Compose with PostgreSQL 16, backend, worker, testservice, Prometheus, and frontend. | `docker-compose.yml`, `Dockerfile` |

---

## ⚡ Quickstart & Deployment

### Option 1: Multi-Container Deployment via Docker Compose

Run the complete multi-container stack (Database, FastAPI Server, Worker, Prometheus, Controlled Test Service, and React Frontend):

```bash
# Clone the repository
git clone https://github.com/akamai-reliability/netops-sentinel.git
cd netops-sentinel

# Launch all services
docker compose up --build
```

**Port Mappings:**
- **Operations Dashboard (React/Vite)**: `http://localhost:3000`
- **FastAPI Backend Server**: `http://localhost:8000` (Docs at `/docs`)
- **Prometheus Metrics**: `http://localhost:8000/metrics`
- **Prometheus UI**: `http://localhost:9090`
- **Controlled Test Canary**: `http://localhost:8080`
- **PostgreSQL Database**: `localhost:5432`

---

### Option 2: Local Development Setup (Node + Python)

```bash
# 1. Install Node.js dependencies
npm install

# 2. Run the automated Python unit test suite
python3 -m unittest discover -s tests -p 'test_*.py' -v

# 3. Start the full-stack server
npm run dev
# Dashboard launches at http://localhost:3000
```

---

## 🧪 Automated Testing & Failure Simulation

### Running Backend Unit Tests

The test suite validates network probe failure modes, incident grouping, consecutive failure thresholds, security allowlist enforcement, and cooldowns:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

**Sample Output:**
```
test_chaos_simulation_modes (tests.test_network_probes.TestNetworkProber) ... ok
test_dns_resolution_failure (tests.test_network_probes.TestNetworkProber) ... ok
test_tcp_connection_refused (tests.test_network_probes.TestNetworkProber) ... ok
test_automated_recovery_resolution_after_consecutive_successes (tests.test_incident_engine.TestIncidentEngine) ... ok
test_consecutive_failures_triggers_incident (tests.test_incident_engine.TestIncidentEngine) ... ok
test_incident_grouping_aggregates_repeated_failures (tests.test_incident_engine.TestIncidentEngine) ... ok
test_single_failure_does_not_prematurely_create_incident (tests.test_incident_engine.TestIncidentEngine) ... ok
test_arbitrary_unallowlisted_action_rejected (tests.test_recovery_actions.TestRecoveryEngine) ... ok
test_authorized_recovery_with_post_verification (tests.test_recovery_actions.TestRecoveryEngine) ... ok
test_cooldown_enforcement (tests.test_recovery_actions.TestRecoveryEngine) ... ok
test_dry_run_simulation (tests.test_recovery_actions.TestRecoveryEngine) ... ok
test_unauthorized_role_rejected (tests.test_recovery_actions.TestRecoveryEngine) ... ok
----------------------------------------------------------------------
Ran 12 tests in 0.308s
OK
```

---

## 🔬 Repeatable Reviewer Walkthrough: Failure, Investigation & Recovery

Reviewers can verify the complete end-to-end reliability loop in under 2 minutes:

1. **Open the Operations Dashboard** at `http://localhost:3000`.
2. Navigate to the **Chaos Simulator** tab.
3. Select **Controlled Test Service (Canary Target)** and choose **TCP SYN Drop (Connection Refused)**.
4. Click **Arm & Trigger Failure Now**:
   - The probe immediately fails with `TCP_CONNECTION_REFUSED`.
   - The service turns **DOWN**.
5. Switch to the **Incidents** tab:
   - Notice an Incident is generated: `Degradation on Controlled Test Service [TCP_CONNECTION_REFUSED]`.
   - Review the evidence-backed probable cause (e.g. 98% confidence).
   - Click **Acknowledge** to assign the incident to active investigation.
6. Click **Remediate** (or switch to the **Remediation Engine** tab):
   - Notice the allowlisted action: `restart_controlled_service`.
   - Click **Execute Authorized Remediation**.
7. Observe the **Remediation Execution Terminal**:
   - Process drains TCP buffer, restarts worker container replica.
   - An automated post-recovery probe runs immediately to verify reachability.
   - The post-state returns `HEALTHY`.
   - The incident automatically transitions to **RESOLVED** with an immutable timeline audit record!

---

## 🔒 Security Architecture & Guardrails

- **Zero Arbitrary Execution**: The remediation runner disallows execution of arbitrary commands, unvetted scripts, or destructive host operations. Only allowlisted actions (`restart_controlled_service`, `flush_dns_cache`, `rotate_tls_cert`, `reset_circuit_breaker`, `scale_test_replica`, `isolate_flapping_route`) can be invoked.
- **Role-Based Access Control (RBAC)**: All remediation operations require the `netops-admin` operator role passed via `X-Operator-Role`. Non-admin requests are rejected with HTTP 403.
- **Flapping Cooldown Protection**: Rapid remediation loops on the same service are blocked for 30 seconds to prevent cascading routing loops or edge service flapping.
- **SSRF Protection**: Target hosts are strictly checked against allowed monitoring network scopes.
- **Audit Logging**: Every remediation invocation records pre-state, post-state, operator, duration, and stdout to the database.

---

## 📊 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health/liveness` | Service liveness probe |
| `GET` | `/health/readiness` | Database connectivity readiness probe |
| `GET` | `/metrics` | Prometheus text exposition metrics |
| `GET` | `/api/v1/kpi` | Aggregated NOC operational KPIs |
| `GET` | `/api/v1/services` | List all monitored edge services |
| `POST` | `/api/v1/services` | Register a new monitored endpoint |
| `POST` | `/api/v1/services/{id}/probe` | Trigger an on-demand probe sweep |
| `GET` | `/api/v1/services/{id}/history` | Historical latency and TLS inspection records |
| `GET` | `/api/v1/incidents` | List detected incidents with filter |
| `POST` | `/api/v1/incidents/{id}/acknowledge` | Acknowledge active incident |
| `POST` | `/api/v1/incidents/{id}/resolve` | Resolve incident with notes |
| `GET` | `/api/v1/recovery/actions` | List approved allowlisted actions |
| `POST` | `/api/v1/recovery/execute` | Execute safe automated remediation |
| `GET` | `/api/v1/recovery/audit` | Query immutable remediation audit log |
| `GET` | `/api/v1/diagnostics/system` | Linux OS, `/proc`, and process diagnostics |
| `POST` | `/api/v1/chaos/inject` | Inject controlled network failure mode |
| `POST` | `/api/v1/chaos/reset` | Clear active chaos failure injections |

---

## 📁 Repository Structure

```
.
├── backend/                  # FastAPI Application & Reliability Modules
│   ├── config.py             # Pydantic configuration & security allowlists
│   ├── database.py           # SQLAlchemy database session & baseline seed
│   ├── diagnostics.py        # Linux procfs and system telemetry collector
│   ├── incident_engine.py    # Consecutive failure gating & root cause engine
│   ├── main.py               # FastAPI endpoints, Prometheus, correlation IDs
│   ├── models.py             # SQLAlchemy ORM models (Services, Probes, Incidents)
│   ├── prober.py             # Low-level network prober (DNS, TCP, TLS, HTTP)
│   ├── recovery_engine.py    # Safe allowlisted remediation runner & verifier
│   └── schemas.py            # Pydantic request/response validation schemas
├── worker/                   # Independent Autonomous Background Daemon
│   └── monitoring_worker.py  # Daemon worker with graceful SIGINT/SIGTERM
├── scripts/                  # Production Linux Shell Scripts
│   ├── diagnostics.sh        # Linux /proc, CPU, memory, disk, container isolation
│   ├── health_check.sh       # Endpoint availability & HTTP latency verification
│   ├── network_probe.sh      # DNS resolution & TCP socket handshake probe
│   └── chaos_inject.sh       # Chaos fault injection CLI utility
├── src/                      # React 19 NOC Operations Dashboard
│   ├── components/           # Modular NOC UI components
│   │   ├── ChaosSimulator.tsx      # Failure injection & recovery walkthrough
│   │   ├── DiagnosticsView.tsx     # Linux system & kernel metrics viewer
│   │   ├── IncidentView.tsx        # Incident investigation & timeline audit
│   │   ├── KpiStrip.tsx            # Operational health KPI cards
│   │   ├── PrometheusViewer.tsx    # Live /metrics scrape inspector
│   │   ├── RecoveryConsole.tsx     # Allowlisted remediation & audit console
│   │   ├── ServiceInspectorModal.tsx # Deep timing breakdown & TLS inspector
│   │   ├── ServiceList.tsx         # High-density service health table
│   │   └── TopNav.tsx              # Top bar contract navigation & RBAC selector
│   ├── App.tsx               # Main application orchestration & polling
│   ├── index.css             # Tailwind CSS & tabular typography styling
│   ├── main.tsx              # React DOM entrypoint
│   └── types.ts              # Domain TypeScript interfaces
├── tests/                    # Automated Unit & Failure-Injection Tests
│   ├── test_network_probes.py      # DNS, TCP handshake, & timeout tests
│   ├── test_incident_engine.py     # Consecutive failure & grouping tests
│   └── test_recovery_actions.py    # Allowlist, RBAC, cooldown, & verifier tests
├── .github/workflows/        # CI/CD Workflows
│   └── ci.yml                # Python tests, bash validation, & build checks
├── docker-compose.yml        # Full-stack multi-container orchestrator
├── Dockerfile                # Backend FastAPI image with networking tools
├── Dockerfile.frontend       # Frontend Vite preview image
├── Dockerfile.testservice    # Controlled Canary test service image
├── Dockerfile.worker         # Autonomous background worker image
├── prometheus.yml            # Prometheus scrape configuration
├── requirements.txt          # Python runtime dependencies
├── server.ts                 # Full-stack Express server mounting Vite SPA
└── README.md                 # Complete system documentation
```

---

## 📄 License

Licensed under the Apache License, Version 2.0. Tailored for Akamai Network Infrastructure & Reliability Engineering evaluation.
