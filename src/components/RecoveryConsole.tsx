import React, { useState } from 'react';
import { Wrench, Shield, CheckCircle2, XCircle, AlertTriangle, Play, Terminal, Lock, RefreshCw, FileText } from 'lucide-react';
import { Service, Incident, RecoveryAudit } from '../types';

interface RecoveryConsoleProps {
  services: Service[];
  incidents: Incident[];
  recoveryAudits: RecoveryAudit[];
  onExecuteRecovery: (serviceId: string, actionName: string, dryRun: boolean, incidentId?: string) => Promise<RecoveryAudit>;
  operatorRole: string;
  preselectedServiceId?: string;
  preselectedIncidentId?: string;
}

const ALLOWLISTED_ACTIONS = [
  {
    name: 'restart_controlled_service',
    label: 'Restart Controlled Service Replica',
    desc: 'Gracefully drains TCP socket buffer, sends SIGTERM to mock container, and spawns healthy replacement worker.',
    safeFor: 'Canary / Controlled test nodes',
    recommendedFor: 'TCP connection refused, unhandled backend exception'
  },
  {
    name: 'flush_dns_cache',
    label: 'Flush Edge DNS Resolver Cache',
    desc: 'Purges stale caching tables across local and edge resolvers and re-seeds A/AAAA records from authoritative nameserver.',
    safeFor: 'All edge services',
    recommendedFor: 'DNS NXDOMAIN, hostname resolution timeouts'
  },
  {
    name: 'rotate_tls_cert',
    label: 'Emergency TLS Certificate Rotation',
    desc: 'Triggers zero-downtime ACME keypair reissue, updates certificate chain, and reloads edge listener without packet loss.',
    safeFor: 'HTTPS edge endpoints',
    recommendedFor: 'Expired or invalid SSL/TLS certificate'
  },
  {
    name: 'reset_circuit_breaker',
    label: 'Reset Origin Circuit Breaker',
    desc: 'Resets consecutive failure rate counters and initiates half-open canary probe to restore throttled traffic.',
    safeFor: 'Edge proxy gateways',
    recommendedFor: 'HTTP 502/503 upstream gateway timeouts'
  },
  {
    name: 'scale_test_replica',
    label: 'Scale Worker Replica Pool (+1)',
    desc: 'Spawns additional container replica to absorb elevated concurrent connection traffic and shed latency queue.',
    safeFor: 'Clustered services',
    recommendedFor: 'Latency threshold violations, high concurrency load'
  },
  {
    name: 'isolate_flapping_route',
    label: 'Isolate Flapping Route to Secondary VIP',
    desc: 'Temporarily withdraws unstable BGP Anycast route and re-routes active ingress to secondary high-availability VIP.',
    safeFor: 'Tier-1 Anycast gateways',
    recommendedFor: 'Route flapping, packet loss'
  }
];

export const RecoveryConsole: React.FC<RecoveryConsoleProps> = ({
  services,
  incidents,
  recoveryAudits,
  onExecuteRecovery,
  operatorRole,
  preselectedServiceId,
  preselectedIncidentId
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    preselectedServiceId || (services.find((s) => s.status !== 'HEALTHY')?.id || services[0]?.id || '')
  );
  const [selectedAction, setSelectedAction] = useState<string>('restart_controlled_service');
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionOutput, setExecutionOutput] = useState<RecoveryAudit | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = operatorRole === 'netops-admin';
  const targetService = services.find((s) => s.id === selectedServiceId);
  const linkedIncident = incidents.find((i) => i.service_id === selectedServiceId && i.status !== 'RESOLVED');

  const handleRun = async () => {
    if (!selectedServiceId || !selectedAction) return;
    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const result = await onExecuteRecovery(
        selectedServiceId,
        selectedAction,
        dryRun,
        linkedIncident?.id || preselectedIncidentId
      );
      setExecutionOutput(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Execution error occurred');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-base font-semibold text-slate-100">Safe Automation & Remediation Console</h2>
        <p className="text-xs text-slate-400">
          Strict allowlist-gated operational recovery with RBAC enforcement, cooldown protection, and post-health verification.
        </p>
      </div>

      {/* Safety Policy Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-semibold text-slate-200">Production Safety Guarantees & Non-Arbitrary Execution Policy</div>
          <p className="text-slate-400">
            NetOps Sentinel enforces a strictly vetted action registry. Arbitrary shell command execution and uncontrolled host process termination are disabled at the kernel boundary. Every remediation triggers automatic post-recovery probe verification.
          </p>
        </div>
      </div>

      {/* Main Grid: Control Panel (Left) & Live Execution Terminal (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Remediation Parameter Configuration
          </h3>

          {/* Target Service */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Service</label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-blue-500 font-mono"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} [{s.status}] ({s.target_host}:{s.target_port})
                </option>
              ))}
            </select>
            {targetService && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                <span>Current State: </span>
                <span className={`font-semibold ${
                  targetService.status === 'HEALTHY' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {targetService.status}
                </span>
                {linkedIncident && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-400 font-mono">{linkedIncident.id}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Allowlisted Action</label>
            <div className="space-y-2">
              {ALLOWLISTED_ACTIONS.map((act) => {
                const isSelected = selectedAction === act.name;
                return (
                  <div
                    key={act.name}
                    onClick={() => setSelectedAction(act.name)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 text-slate-100 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="font-semibold">{act.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{act.desc}</div>
                    <div className="text-[11px] text-blue-400 font-mono mt-1">Recommended for: {act.recommendedFor}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dry Run Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <div>
              <div className="font-semibold text-slate-200">Dry-Run Simulation Mode</div>
              <div className="text-slate-400 text-[11px]">Validates parameters & dependencies without modifying state</div>
            </div>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-800 cursor-pointer"
            />
          </div>

          {/* Authorization Check */}
          <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-900/40 border border-slate-800">
            <span className="text-slate-400">Authorized Operator Role:</span>
            <span className={`font-mono font-semibold ${isAdmin ? 'text-emerald-400' : 'text-red-400'}`}>
              {operatorRole} {isAdmin ? '(Permitted)' : '(Forbidden)'}
            </span>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleRun}
            disabled={isExecuting || !selectedServiceId}
            className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              dryRun
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            } disabled:opacity-50`}
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Remediation & Verifying Probe...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>{dryRun ? 'Simulate Dry-Run' : 'Execute Authorized Remediation'}</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Execution Output Terminal & Audit */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 min-h-[320px] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-semibold text-slate-300">Remediation Execution Terminal (Stdout & Probe Verification)</span>
              </div>
              {executionOutput && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    executionOutput.status === 'SUCCEEDED'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-red-950 text-red-400 border border-red-800'
                  }`}
                >
                  {executionOutput.status}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 text-slate-300">
              {isExecuting ? (
                <div className="text-blue-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting to edge remediation agent and draining connections...</span>
                </div>
              ) : executionOutput ? (
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-[11px]">
                  {executionOutput.stdout_log}
                </pre>
              ) : errorMessage ? (
                <div className="text-red-400 font-mono">
                  [ERROR] Execution blocked: {errorMessage}
                </div>
              ) : (
                <div className="text-slate-500 py-16 text-center">
                  Select an allowlisted action and click Execute to observe automated remediation logs and post-probe verification.
                </div>
              )}
            </div>

            {executionOutput && (
              <div className="border-t border-slate-800/80 pt-2.5 mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <div>
                  Audit ID: <span className="text-slate-200">{executionOutput.id}</span> · Execution:{' '}
                  <span className="text-slate-200">{executionOutput.execution_time_ms}ms</span>
                </div>
                <div>
                  Post-State:{' '}
                  <span
                    className={`font-semibold ${
                      executionOutput.post_health_state === 'HEALTHY'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {executionOutput.post_health_state || 'UNVERIFIED'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Recovery Audits Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Immutable Recovery Audit Log (Latest Operations)
            </h4>
            <div className="max-h-48 overflow-y-auto text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/30">
                    <th className="py-2 px-3 font-medium">Audit ID</th>
                    <th className="py-2 px-3 font-medium">Target</th>
                    <th className="py-2 px-3 font-medium">Action</th>
                    <th className="py-2 px-3 font-medium">Initiator</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {recoveryAudits.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500 font-sans">
                        No remediation actions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recoveryAudits.slice(0, 5).map((aud) => (
                      <tr key={aud.id} className="hover:bg-slate-900/20">
                        <td className="py-2 px-3 text-slate-400">{aud.id}</td>
                        <td className="py-2 px-3 text-slate-200">{aud.service_id}</td>
                        <td className="py-2 px-3 text-blue-400 truncate max-w-[140px]">{aud.action_name}</td>
                        <td className="py-2 px-3 text-slate-400">{aud.initiated_by}</td>
                        <td className="py-2 px-3">
                          <span
                            className={
                              aud.status === 'SUCCEEDED'
                                ? 'text-emerald-400 font-semibold'
                                : aud.status === 'FAILED'
                                ? 'text-red-400 font-semibold'
                                : 'text-amber-400'
                            }
                          >
                            {aud.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">{aud.execution_time_ms}ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
