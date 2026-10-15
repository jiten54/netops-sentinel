import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Server, Layers, Terminal, RefreshCw, CheckCircle, AlertCircle, Network } from 'lucide-react';
import { LinuxDiagnostics } from '../types';

export const DiagnosticsView: React.FC = () => {
  const [data, setData] = useState<LinuxDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const fetchDiagnostics = () => {
    setLoading(true);
    fetch('/api/v1/diagnostics/system')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Linux System & Edge Node Diagnostics</h2>
          <p className="text-xs text-slate-400">
            Real-time operating system metrics, process utilization, and kernel virtualization isolation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-mono transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{showRawJson ? 'Hide Raw JSON' : 'View Raw Script Output'}</span>
          </button>
          <button
            onClick={fetchDiagnostics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </button>
        </div>
      </div>

      {showRawJson && data && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300 max-h-72 overflow-y-auto">
          <div className="text-slate-400 text-[11px] mb-2 font-semibold">
            Execution Output from ./scripts/diagnostics.sh json:
          </div>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}

      {/* Virtualization Context Card */}
      {data && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-400 mb-1">Hostname</div>
            <div className="font-mono text-slate-200 font-semibold">{data.hostname}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Environment Isolation</div>
            <div className="font-mono text-blue-400 font-semibold">
              {data.environment?.runtime_isolation || 'containerized'}
              {data.environment?.is_container ? ' (Container)' : ' (Bare Metal)'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Kernel Release</div>
            <div className="font-mono text-slate-300 truncate">{data.environment?.kernel_version}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">System Uptime</div>
            <div className="font-mono text-emerald-400 font-semibold">
              {Math.floor(data.uptime_seconds / 60)} minutes ({data.uptime_seconds}s)
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CPU Card */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>CPU & Load Average</span>
              </span>
              <span className="font-mono text-slate-400">{data.cpu.cores} Cores</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {data.cpu.load_1m}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Load (1m, 5m, 15m): <span className="text-slate-200">{data.cpu.load_average}</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (data.cpu.load_1m / (data.cpu.cores || 1)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Memory Card */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>System Memory</span>
              </span>
              <span className="font-mono text-slate-400">{data.memory.total_mb} MB Total</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {data.memory.usage_percent}%
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Used: <span className="text-slate-200">{data.memory.used_mb} MB</span> · Avail:{' '}
              <span className="text-slate-200">{data.memory.available_mb} MB</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, data.memory.usage_percent)}%` }}
              />
            </div>
          </div>

          {/* Disk Card */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span>Root Mount Storage</span>
              </span>
              <span className="font-mono text-slate-400">{data.disk.mount}</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {data.disk.usage_percent}%
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Capacity: <span className="text-slate-200">{data.disk.total}</span>
              {data.disk.available && ` · Free: ${data.disk.available}`}
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, data.disk.usage_percent)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Network Interfaces */}
      {data && data.network && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-400" />
            <span>Active Network Interfaces & VIP Bindings</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            {data.network.interfaces.map((iface, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">{iface.interface}</div>
                <div className="text-slate-200 font-semibold mt-0.5">{iface.ip}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Memory Consuming Processes Table */}
      {data && data.processes && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Process Telemetry (Total: {data.processes.total} processes)
            </h3>
            <span className="text-xs text-slate-500 font-mono">Running: {data.processes.running}</span>
          </div>

          <div className="overflow-x-auto text-xs font-mono">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40">
                  <th className="py-2 px-3 font-medium">PID</th>
                  <th className="py-2 px-3 font-medium">PPID</th>
                  <th className="py-2 px-3 font-medium">User</th>
                  <th className="py-2 px-3 font-medium text-right">CPU %</th>
                  <th className="py-2 px-3 font-medium text-right">MEM %</th>
                  <th className="py-2 px-3 font-medium">Command</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {data.processes.top_memory.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30">
                    <td className="py-2 px-3 text-slate-300 font-semibold">{p.pid}</td>
                    <td className="py-2 px-3 text-slate-400">{p.ppid}</td>
                    <td className="py-2 px-3 text-slate-400">{p.user}</td>
                    <td className="py-2 px-3 text-right text-slate-200">{p.cpu_pct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right text-blue-400">{p.mem_pct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-slate-300 font-semibold">{p.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
