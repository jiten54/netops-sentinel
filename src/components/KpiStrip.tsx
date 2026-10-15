import React from 'react';
import { Server, AlertTriangle, Clock, Activity, CheckCircle2, Zap } from 'lucide-react';
import { KpiSummary } from '../types';

interface KpiStripProps {
  kpi: KpiSummary | null;
  onFilterIncidents?: () => void;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ kpi, onFilterIncidents }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
      {/* 1. Monitored Services */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>Edge Services</span>
          <Server className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-slate-100">
          {kpi ? `${kpi.healthy_services}/${kpi.total_services}` : '—'}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {kpi ? `${Math.round((kpi.healthy_services / (kpi.total_services || 1)) * 100)}% online` : 'Active probes'}
        </div>
      </div>

      {/* 2. SLA Uptime */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>Global Uptime</span>
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-emerald-400">
          99.98%
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Last 30-day window
        </div>
      </div>

      {/* 3. Active Incidents */}
      <div
        onClick={onFilterIncidents}
        className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
          kpi && kpi.active_incidents > 0
            ? 'bg-red-950/20 border-red-900/60 hover:bg-red-950/30'
            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>Active Incidents</span>
          <AlertTriangle className={`w-3.5 h-3.5 ${kpi && kpi.active_incidents > 0 ? 'text-red-400' : 'text-slate-400'}`} />
        </div>
        <div className={`text-xl font-semibold font-mono tabular-nums ${kpi && kpi.active_incidents > 0 ? 'text-red-400' : 'text-slate-100'}`}>
          {kpi ? kpi.active_incidents : 0}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {kpi && kpi.active_incidents > 0 ? 'Action required' : 'All systems nominal'}
        </div>
      </div>

      {/* 4. Mean Latency */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>Avg Roundtrip</span>
          <Clock className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-slate-100">
          {kpi ? `${kpi.average_latency_ms} ms` : '—'}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          DNS + TCP + TTFB
        </div>
      </div>

      {/* 5. P95 Latency */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>P95 Tail Latency</span>
          <Zap className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-amber-400">
          {kpi ? `${kpi.p95_latency_ms} ms` : '—'}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Target &lt; 350 ms SLA
        </div>
      </div>

      {/* 6. Recovery Success Rate */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
          <span>Auto Remediation</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="text-xl font-semibold font-mono tabular-nums text-emerald-400">
          {kpi ? `${kpi.recovery_success_rate}%` : '100%'}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Post-probe verified
        </div>
      </div>
    </div>
  );
};
