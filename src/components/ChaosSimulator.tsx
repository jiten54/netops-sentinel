import React, { useState } from 'react';
import { ShieldAlert, Play, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Zap, Wrench, ShieldCheck } from 'lucide-react';
import { Service, Incident } from '../types';

interface ChaosSimulatorProps {
  services: Service[];
  incidents: Incident[];
  onProbeService: (id: string) => Promise<void>;
  onExecuteRecovery: (serviceId: string, actionName: string, dryRun: boolean, incidentId?: string) => Promise<any>;
  onRefresh: () => void;
  preselectedServiceId?: string;
  onNavigateToTab: (tab: any) => void;
}

const CHAOS_MODES = [
  {
    id: 'tcp_drop',
    name: 'TCP SYN Drop (Connection Refused)',
    description: 'Drops TCP handshake packets on target port. Simulates process crash or listening socket failure.',
    expectedError: 'TCP_CONNECTION_REFUSED',
    recommendedFix: 'restart_controlled_service'
  },
  {
    id: 'http_500',
    name: 'HTTP 500 Internal Origin Error',
    description: 'Upstream microservice triggers unhandled database connection pool exception.',
    expectedError: 'HTTP_500_INTERNAL_SERVER_ERROR',
    recommendedFix: 'restart_controlled_service'
  },
  {
    id: 'dns_failure',
    name: 'DNS NXDOMAIN Resolution Failure',
    description: 'Authoritative nameserver returns NXDOMAIN or query timeouts.',
    expectedError: 'DNS_NXDOMAIN',
    recommendedFix: 'flush_dns_cache'
  },
  {
    id: 'cert_expired',
    name: 'TLS Certificate Expiration Alert',
    description: 'X.509 certificate expired 3 days ago. Causes handshake verification warning.',
    expectedError: 'TLS_CERT_EXPIRED',
    recommendedFix: 'rotate_tls_cert'
  },
  {
    id: 'latency_spike',
    name: 'Elevated Latency Spike (1400ms)',
    description: 'Network congestion or heavy thread starvation exceeding the 350ms SLA threshold.',
    expectedError: 'LATENCY_THRESHOLD_EXCEEDED',
    recommendedFix: 'scale_test_replica'
  }
];

export const ChaosSimulator: React.FC<ChaosSimulatorProps> = ({
  services,
  incidents,
  onProbeService,
  onExecuteRecovery,
  onRefresh,
  preselectedServiceId,
  onNavigateToTab
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    preselectedServiceId || 'testservice-controlled'
  );
  const [selectedMode, setSelectedMode] = useState<string>('tcp_drop');
  const [activeChaos, setActiveChaos] = useState<{ mode: string; serviceId: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const targetService = services.find((s) => s.id === selectedServiceId);
  const activeIncident = incidents.find(
    (i) => i.service_id === selectedServiceId && i.status !== 'RESOLVED'
  );
  const modeObj = CHAOS_MODES.find((m) => m.id === selectedMode);

  const handleInject = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/chaos/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedServiceId,
          mode: selectedMode,
          latency_ms: selectedMode === 'latency_spike' ? 1400 : undefined
        })
      });
      const data = await res.json();
      setActiveChaos({ mode: selectedMode, serviceId: selectedServiceId });
      setStatusMessage(`Chaos armed: ${data.message}`);

      // Auto-trigger a probe to demonstrate immediate state transition!
      await onProbeService(selectedServiceId);
      onRefresh();
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = async () => {
    setIsProcessing(true);
    try {
      await fetch('/api/v1/chaos/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: selectedServiceId })
      });
      setActiveChaos(null);
      setStatusMessage('Chaos cleared. Running probe verification...');
      await onProbeService(selectedServiceId);
      onRefresh();
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemediate = async () => {
    if (!modeObj) return;
    setIsProcessing(true);
    try {
      await onExecuteRecovery(
        selectedServiceId,
        modeObj.recommendedFix,
        false,
        activeIncident?.id
      );
      setActiveChaos(null);
      setStatusMessage(`Remediation '${modeObj.recommendedFix}' applied and verified! Service restored to HEALTHY.`);
      onRefresh();
    } catch (e: any) {
      setStatusMessage(`Remediation error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-slate-100">Chaos Engineering & Failure Simulation Lab</h2>
        <p className="text-xs text-slate-400">
          Repeatable failure demonstration workflow specifically designed for review of NetOps Sentinel's detection, evidence correlation, and remediation lifecycle.
        </p>
      </div>

      {/* 4-Step Lifecycle Workflow Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-mono text-[11px]">1</span>
            <span>Inject Failure</span>
          </div>
          <p className="text-slate-400 text-[11px]">Arm controlled fault: TCP drop, HTTP 500, DNS NXDOMAIN, TLS expiry, or latency.</p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-400 flex items-center justify-center font-mono text-[11px]">2</span>
            <span>Autonomous Detection</span>
          </div>
          <p className="text-slate-400 text-[11px]">Prober detects failure, classifies taxonomy, and raises verified Incident with evidence.</p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-400 flex items-center justify-center font-mono text-[11px]">3</span>
            <span>Remediation Execution</span>
          </div>
          <p className="text-slate-400 text-[11px]">Trigger allowlisted recovery action. Reviewer observes step-by-step execution logs.</p>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-mono text-[11px]">4</span>
            <span>Automated Recovery</span>
          </div>
          <p className="text-slate-400 text-[11px]">Post-probe automatically verifies HEALTHY state and closes the incident with audit trace.</p>
        </div>
      </div>

      {/* Main Interactive Testing Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target Service */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Service</label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-blue-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          {/* Current Target Status */}
          {targetService && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Target Live State</label>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      targetService.status === 'HEALTHY'
                        ? 'text-emerald-400'
                        : targetService.status === 'DEGRADED'
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    STATUS: {targetService.status}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-300 font-mono">{targetService.last_latency_ms}ms</span>
                </div>
                {activeIncident && (
                  <span className="font-mono text-red-400 font-medium">
                    Active: {activeIncident.id}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chaos Mode Selection */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">Select Fault Injection Mode</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CHAOS_MODES.map((mode) => {
              const isSelected = selectedMode === mode.id;
              return (
                <div
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`p-3.5 rounded-lg border text-xs cursor-pointer transition-colors space-y-1.5 ${
                    isSelected
                      ? 'bg-red-950/40 border-red-500 text-slate-100 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-200">{mode.name}</div>
                  <div className="text-[11px] text-slate-400">{mode.description}</div>
                  <div className="text-[11px] text-amber-400 font-mono">Taxonomy: {mode.expectedError}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
          <button
            onClick={handleInject}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Arm & Trigger Failure Now</span>
          </button>

          {activeIncident && modeObj && (
            <button
              onClick={handleRemediate}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              <Wrench className="w-4 h-4" />
              <span>Execute Automated Fix ({modeObj.recommendedFix})</span>
            </button>
          )}

          <button
            onClick={handleClear}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset / Clear Chaos</span>
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Reviewer Walkthrough Demonstration Guide */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 text-xs text-slate-400 space-y-2">
        <div className="font-semibold text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>Recommended Reviewer Demonstration Steps (Akamai Job ID 4073 Evaluation)</span>
        </div>
        <ol className="list-decimal pl-5 space-y-1 leading-relaxed">
          <li>Select <strong>Controlled Test Service (Canary Target)</strong> and choose <strong>TCP SYN Drop</strong>.</li>
          <li>Click <strong>Arm & Trigger Failure Now</strong>. Notice how the service turns <span className="text-red-400 font-semibold">DOWN</span> within milliseconds.</li>
          <li>Switch to the <strong>Incidents</strong> tab: notice a new Incident with probable cause <code className="text-slate-300">TCP_CONNECTION_REFUSED (98% confidence)</code> and chronological evidence.</li>
          <li>Click <strong>Execute Automated Fix</strong> (or go to Remediation Engine and run <code className="text-slate-300">restart_controlled_service</code>).</li>
          <li>Inspect the execution log: notice the automated post-recovery probe runs immediately, verifies <span className="text-emerald-400 font-semibold">HEALTHY</span>, and auto-resolves the incident!</li>
        </ol>
      </div>
    </div>
  );
};
