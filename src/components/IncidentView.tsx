import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, ArrowRight, UserCheck, Wrench, Shield, Check, Eye } from 'lucide-react';
import { Incident } from '../types';

interface IncidentViewProps {
  incidents: Incident[];
  onAcknowledge: (id: string) => Promise<void>;
  onResolve: (id: string, notes: string) => Promise<void>;
  onTriggerRemediation: (serviceId: string, incidentId: string) => void;
  operatorRole: string;
}

export const IncidentView: React.FC<IncidentViewProps> = ({
  incidents,
  onAcknowledge,
  onResolve,
  onTriggerRemediation,
  operatorRole
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(incidents[0] || null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED'>('ALL');
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  const filtered = incidents.filter((i) => {
    if (filter === 'ALL') return true;
    return i.status === filter;
  });

  const renderSeverity = (sev: Incident['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-400">CRITICAL</span>;
      case 'MAJOR':
        return <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-orange-950 border border-orange-800 text-orange-400">MAJOR</span>;
      case 'MINOR':
        return <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400">MINOR</span>;
      default:
        return <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-yellow-950 border border-yellow-800 text-yellow-400">WARNING</span>;
    }
  };

  const currentInc = selectedIncident || filtered[0] || null;

  return (
    <div className="space-y-4">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Incident Detection & Root Cause Analysis</h2>
          <p className="text-xs text-slate-400">
            Automated failure correlation, evidence extraction, and chronological timeline auditing.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
          {(['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                filter === mode
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'ALL' ? 'All Incidents' : mode}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-500">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
          <p className="text-sm text-slate-300 font-medium">No active incidents</p>
          <p className="text-xs text-slate-400 mt-1">All monitored edge services are operating within normal SLA thresholds.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Incidents List (Left Column) */}
          <div className="lg:col-span-5 space-y-2">
            {filtered.map((inc) => {
              const isSelected = currentInc?.id === inc.id;
              return (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-blue-500/80 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs text-slate-400">{inc.id}</span>
                    <div className="flex items-center gap-2">
                      {renderSeverity(inc.severity)}
                      <span className={`text-xs font-medium ${inc.status === 'RESOLVED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {inc.status}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-200 mb-1">{inc.title}</h3>
                  <div className="text-xs text-slate-400 line-clamp-1">{inc.probable_cause}</div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{new Date(inc.started_at).toLocaleTimeString()}</span>
                    <span aria-hidden="true">·</span>
                    <span>Confidence: {Math.round(inc.confidence_score * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Incident Detail (Right Column) */}
          {currentInc && (
            <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-5">
              {/* Detail Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">{currentInc.id}</span>
                    {renderSeverity(currentInc.severity)}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      currentInc.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                    }`}>
                      {currentInc.status}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">{currentInc.title}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Target Service: <span className="font-mono text-slate-300">{currentInc.service_id}</span> · Started at {new Date(currentInc.started_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentInc.status === 'OPEN' && (
                    <button
                      onClick={() => onAcknowledge(currentInc.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  {currentInc.status !== 'RESOLVED' && (
                    <>
                      <button
                        onClick={() => onTriggerRemediation(currentInc.service_id, currentInc.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Remediate</span>
                      </button>
                      <button
                        onClick={() => setShowResolveModal(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Resolve</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Probable Cause & Confidence */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Evidence-Based Probable Cause Deduction</span>
                  </div>
                  <span className="font-mono text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                    {Math.round(currentInc.confidence_score * 100)}% Confidence
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-200">
                  {currentInc.probable_cause}
                </p>
                <p className="text-xs text-slate-400">
                  Derived from raw network probe telemetry, socket handshake timing, and failure classification rules.
                </p>
              </div>

              {/* Diagnostic Evidence Points */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Diagnostic Evidence Points
                </h4>
                <div className="space-y-1.5 text-xs font-mono">
                  {JSON.parse(currentInc.evidence_json || '[]').map((ev: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-slate-300 font-semibold">{ev.error_type || 'PROBE_ANOMALY'}</div>
                        <div className="text-slate-400 text-xs font-sans mt-0.5">{ev.message || 'Health SLA violated'}</div>
                      </div>
                      <div className="text-right text-slate-400 shrink-0">
                        {ev.latency_ms ? `${ev.latency_ms} ms` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chronological Timeline Audit */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Chronological Incident Timeline
                </h4>
                <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {currentInc.timeline_events.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-slate-950" />
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{ev.event_type}</span>
                          <span className="text-slate-500 font-mono text-[11px]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-slate-400 font-mono text-[11px]">{ev.actor}</span>
                        </div>
                        <p className="text-slate-300 mt-0.5">{ev.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Resolve Modal */}
      {showResolveModal && currentInc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-1">Resolve Incident: {currentInc.id}</h3>
            <p className="text-xs text-slate-400 mb-4">
              Document resolution notes for operational audit records.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Resolution Summary</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Cleared DNS cache on edge resolver and verified nominal reachability."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onResolve(currentInc.id, resolveNotes);
                    setShowResolveModal(false);
                    setResolveNotes('');
                  }}
                  className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
                >
                  Confirm Resolution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
