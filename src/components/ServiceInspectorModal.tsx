import React, { useEffect, useState } from 'react';
import { X, Play, ShieldAlert, Wrench, ShieldCheck, Clock, Server, Activity, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Service, ProbeResult } from '../types';

interface ServiceInspectorModalProps {
  service: Service | null;
  onClose: () => void;
  onProbe: (id: string) => Promise<void>;
  isProbing: boolean;
  onNavigateToChaos: (serviceId: string) => void;
  onNavigateToRemediation: (serviceId: string) => void;
}

export const ServiceInspectorModal: React.FC<ServiceInspectorModalProps> = ({
  service,
  onClose,
  onProbe,
  isProbing,
  onNavigateToChaos,
  onNavigateToRemediation
}) => {
  const [history, setHistory] = useState<ProbeResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!service) return;
    setLoading(true);
    fetch(`/api/v1/services/${service.id}/history?limit=30`)
      .then((res) => res.json())
      .then((data) => setHistory(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [service]);

  if (!service) return null;

  const latestProbe = history[0];
  const chartData = [...history].reverse().map((h, i) => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: h.total_latency_ms,
    dns: h.dns_resolution_ms,
    tcp: h.tcp_handshake_ms,
    ttfb: h.ttfb_ms
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100">{service.name}</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                {service.protocol} :{service.target_port}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  service.status === 'HEALTHY'
                    ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-400'
                    : service.status === 'DEGRADED'
                    ? 'bg-amber-950/80 border border-amber-800 text-amber-400'
                    : 'bg-red-950/80 border border-red-800 text-red-400'
                }`}
              >
                {service.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{service.description || 'Monitored distributed edge target'}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions Strip */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-mono text-slate-300">{service.target_host}</span>
            <span aria-hidden="true">·</span>
            <span>Check interval: {service.check_interval_sec}s</span>
            <span aria-hidden="true">·</span>
            <span>Timeout: {service.timeout_sec}s</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onProbe(service.id)}
              disabled={isProbing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
              <span>Probe Now</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onNavigateToChaos(service.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-medium transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Simulate Chaos</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onNavigateToRemediation(service.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 font-medium transition-colors"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Remediate</span>
            </button>
          </div>
        </div>

        {/* Granular Timing Telemetry Strip */}
        {latestProbe && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Granular Roundtrip Breakdown (Latest Probe)
            </h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400 mb-1">DNS Resolution</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-200">
                  {latestProbe.dns_resolution_ms} ms
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400 mb-1">TCP Handshake</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-200">
                  {latestProbe.tcp_handshake_ms} ms
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400 mb-1">Time to First Byte (TTFB)</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-200">
                  {latestProbe.ttfb_ms} ms
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400 mb-1">Total Roundtrip</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-blue-400">
                  {latestProbe.total_latency_ms} ms
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TLS Certificate Inspection (Akamai Edge Requirement) */}
        {latestProbe && latestProbe.tls_valid !== undefined && (
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">TLS/SSL Certificate Inspection</span>
              </div>
              <span className={`font-mono text-xs ${latestProbe.tls_valid ? 'text-emerald-400' : 'text-red-400'}`}>
                {latestProbe.tls_valid ? 'VALID CERTIFICATE' : 'EXPIRED OR INVALID'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-slate-400">
              <div>
                <span>Issuer: </span>
                <span className="text-slate-200 font-mono">{latestProbe.tls_issuer || 'Edge Root CA'}</span>
              </div>
              <div>
                <span>Cipher Suite: </span>
                <span className="text-slate-200 font-mono truncate">{latestProbe.tls_cipher || 'TLS_AES_256_GCM_SHA384'}</span>
              </div>
              <div>
                <span>Days Remaining: </span>
                <span className={`font-mono font-semibold ${latestProbe.tls_expires_days && latestProbe.tls_expires_days < 14 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {latestProbe.tls_expires_days !== null ? `${latestProbe.tls_expires_days} days` : '90 days'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Historical Latency Chart */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Response Latency Trend (Last 30 Checks)
            </h3>
            <span className="text-xs text-slate-500 font-mono">SLA Threshold: {service.latency_threshold_ms}ms</span>
          </div>
          <div className="h-44 w-full p-2 rounded-lg bg-slate-950 border border-slate-800">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} unit="ms" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area type="monotone" dataKey="latency" stroke="#3b82f6" fillOpacity={1} fill="url(#latencyGrad)" strokeWidth={1.5} name="Total Latency (ms)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                Collecting telemetry...
              </div>
            )}
          </div>
        </div>

        {/* Recent Events Table */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Recent Health Probes Log
          </h3>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40">
                  <th className="py-2 px-3 font-medium">Timestamp</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium">HTTP</th>
                  <th className="py-2 px-3 font-medium text-right">Latency</th>
                  <th className="py-2 px-3 font-medium">Error / Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {history.slice(0, 8).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/30">
                    <td className="py-2 px-3 text-slate-400">{new Date(p.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2 px-3">
                      <span className={p.status === 'HEALTHY' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-300">{p.http_status_code || '—'}</td>
                    <td className="py-2 px-3 text-right text-slate-200">{p.total_latency_ms}ms</td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-xs">{p.error_message || 'OK - zero anomalies'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
