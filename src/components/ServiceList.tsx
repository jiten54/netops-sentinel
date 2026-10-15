import React, { useState } from 'react';
import { Search, Plus, Play, Info, ExternalLink, CheckCircle, AlertTriangle, XCircle, HelpCircle, Lock, ShieldAlert, Cpu } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Service, ProbeResult } from '../types';

interface ServiceListProps {
  services: Service[];
  onProbeService: (id: string) => Promise<void>;
  onInspectService: (service: Service) => void;
  onCreateService: (service: Partial<Service>) => Promise<void>;
  probingIds: Set<string>;
  onNavigateToChaos: (serviceId: string) => void;
  onNavigateToRemediation: (serviceId: string) => void;
}

export const ServiceList: React.FC<ServiceListProps> = ({
  services,
  onProbeService,
  onInspectService,
  onCreateService,
  probingIds,
  onNavigateToChaos,
  onNavigateToRemediation
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HEALTHY' | 'DEGRADED' | 'DOWN'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Service Form State
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('http://127.0.0.1:3000/health/liveness');
  const [newHost, setNewHost] = useState('127.0.0.1');
  const [newPort, setNewPort] = useState(3000);
  const [newProtocol, setNewProtocol] = useState<'HTTP' | 'HTTPS' | 'TCP' | 'DNS'>('HTTP');
  const [newThreshold, setNewThreshold] = useState(300);
  const [newTags, setNewTags] = useState('edge,custom');

  const filtered = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.target_host.toLowerCase().includes(search.toLowerCase()) ||
      s.tags.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName) return;
    await onCreateService({
      id: newId,
      name: newName,
      target_url: newUrl,
      target_host: newHost,
      target_port: newPort,
      protocol: newProtocol,
      latency_threshold_ms: newThreshold,
      tags: newTags,
      check_interval_sec: 15,
      timeout_sec: 5
    });
    setShowAddModal(false);
    setNewId('');
    setNewName('');
  };

  const renderStatus = (status: Service['status']) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            <span>HEALTHY</span>
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>DEGRADED</span>
          </span>
        );
      case 'DOWN':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>DOWN</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>UNKNOWN</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter services by name, IP, hostname or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Filter Segmented Control & Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            {(['ALL', 'HEALTHY', 'DEGRADED', 'DOWN'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setStatusFilter(mode)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  statusFilter === mode
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'ALL' ? 'All' : mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Target</span>
          </button>
        </div>
      </div>

      {/* Services Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/40 text-slate-400 text-xs">
                <th className="py-3 px-4 font-medium">Service & Protocol</th>
                <th className="py-3 px-4 font-medium">Target Host / VIP</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Roundtrip Latency</th>
                <th className="py-3 px-4 font-medium text-right">Consecutive Failures</th>
                <th className="py-3 px-4 font-medium">Last Probe</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No edge services match your current filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((srv) => {
                  const isProbing = probingIds.has(srv.id);
                  return (
                    <tr
                      key={srv.id}
                      className="hover:bg-slate-900/40 transition-colors group cursor-pointer"
                      onClick={() => onInspectService(srv)}
                    >
                      {/* Name & Protocol */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-200 flex items-center gap-2">
                          <span>{srv.name}</span>
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                            {srv.protocol}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="font-mono">{srv.id}</span>
                          {srv.tags && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-400">{srv.tags.split(',').join(' · ')}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Host & Port */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                        <div>{srv.target_host}:{srv.target_port}</div>
                        <div className="text-slate-400 text-xs truncate max-w-xs">{srv.target_url}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {renderStatus(srv.status)}
                      </td>

                      {/* Latency */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono tabular-nums text-slate-200 font-semibold">
                          {srv.last_latency_ms ? `${srv.last_latency_ms} ms` : '—'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          threshold: {srv.latency_threshold_ms} ms
                        </div>
                      </td>

                      {/* Consecutive Failures */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {srv.consecutive_failures > 0 ? (
                          <span className="text-red-400 font-semibold">{srv.consecutive_failures} failures</span>
                        ) : (
                          <span className="text-slate-400">{srv.consecutive_successes} ok</span>
                        )}
                      </td>

                      {/* Last Checked */}
                      <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {srv.last_checked_at
                          ? new Date(srv.last_checked_at).toLocaleTimeString()
                          : 'Pending'}
                      </td>

                      {/* Action buttons */}
                      <td
                        className="py-3.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onProbeService(srv.id)}
                            disabled={isProbing}
                            title="Execute low-level probe now"
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            <Play className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            onClick={() => onInspectService(srv)}
                            title="Inspect service telemetry and historical metrics"
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Target Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-1">Add Monitored Edge Service</h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure a new HTTP/HTTPS endpoint or TCP socket for distributed health probing.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Service Identifier (slug)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. edge-auth-west"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Edge Auth Proxy (US-West)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">Target Host / Domain</label>
                  <input
                    type="text"
                    required
                    value={newHost}
                    onChange={(e) => setNewHost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={newPort}
                    onChange={(e) => setNewPort(parseInt(e.target.value) || 80)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Probe Target URL</label>
                <input
                  type="url"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Protocol</label>
                  <select
                    value={newProtocol}
                    onChange={(e) => setNewProtocol(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="HTTP">HTTP</option>
                    <option value="HTTPS">HTTPS</option>
                    <option value="TCP">TCP Socket</option>
                    <option value="DNS">DNS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">SLA Latency (ms)</label>
                  <input
                    type="number"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(parseFloat(e.target.value) || 300)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
                >
                  Create Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
