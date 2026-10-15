import React, { useState, useEffect, useCallback } from 'react';
import { TopNav } from './components/TopNav';
import { KpiStrip } from './components/KpiStrip';
import { ServiceList } from './components/ServiceList';
import { IncidentView } from './components/IncidentView';
import { RecoveryConsole } from './components/RecoveryConsole';
import { DiagnosticsView } from './components/DiagnosticsView';
import { ChaosSimulator } from './components/ChaosSimulator';
import { PrometheusViewer } from './components/PrometheusViewer';
import { ServiceInspectorModal } from './components/ServiceInspectorModal';
import { Service, Incident, RecoveryAudit, KpiSummary } from './types';
import { Shield, Activity, Terminal } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'services' | 'incidents' | 'diagnostics' | 'remediation' | 'chaos' | 'metrics'>('services');
  const [operatorRole, setOperatorRole] = useState<string>('netops-admin');

  // Core Data
  const [services, setServices] = useState<Service[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [recoveryAudits, setRecoveryAudits] = useState<RecoveryAudit[]>([]);

  // UI state
  const [probingIds, setProbingIds] = useState<Set<string>>(new Set());
  const [inspectingService, setInspectingService] = useState<Service | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [remediationTarget, setRemediationTarget] = useState<{ serviceId?: string; incidentId?: string }>({});
  const [chaosTargetId, setChaosTargetId] = useState<string | undefined>();

  // Data Fetching
  const loadData = useCallback(async () => {
    try {
      const [srvRes, incRes, kpiRes, audRes] = await Promise.all([
        fetch('/api/v1/services'),
        fetch('/api/v1/incidents'),
        fetch('/api/v1/kpi'),
        fetch('/api/v1/recovery/audit')
      ]);

      if (srvRes.ok) {
        const srvData = await srvRes.json();
        setServices(srvData);
        if (inspectingService) {
          const updated = srvData.find((s: Service) => s.id === inspectingService.id);
          if (updated) setInspectingService(updated);
        }
      }
      if (incRes.ok) {
        const incData = await incRes.json();
        setIncidents(incData);
      }
      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        setKpi(kpiData);
      }
      if (audRes.ok) {
        const audData = await audRes.json();
        setRecoveryAudits(audData);
      }
    } catch (e) {
      console.error('Error fetching NetOps data:', e);
    }
  }, [inspectingService]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setTimeout(() => setIsRefreshing(false), 300);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Actions
  const handleProbeService = async (serviceId: string) => {
    setProbingIds((prev) => new Set(prev).add(serviceId));
    try {
      await fetch(`/api/v1/services/${serviceId}/probe`, {
        method: 'POST',
        headers: {
          'X-Correlation-ID': `manual-probe-${Date.now()}`
        }
      });
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setProbingIds((prev) => {
        const next = new Set(prev);
        next.delete(serviceId);
        return next;
      });
    }
  };

  const handleCreateService = async (newSrv: Partial<Service>) => {
    try {
      const res = await fetch('/api/v1/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSrv)
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcknowledgeIncident = async (incidentId: string) => {
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_name: `operator:${operatorRole}` })
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolveIncident = async (incidentId: string, notes: string) => {
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator_name: `operator:${operatorRole}`,
          resolution_notes: notes
        })
      });
      if (res.ok) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecuteRecovery = async (
    serviceId: string,
    actionName: string,
    dryRun: boolean,
    incidentId?: string
  ): Promise<RecoveryAudit> => {
    const res = await fetch('/api/v1/recovery/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Role': operatorRole
      },
      body: JSON.stringify({
        service_id: serviceId,
        action_name: actionName,
        dry_run: dryRun,
        incident_id: incidentId
      })
    });
    const data = await res.json();
    await loadData();
    return data;
  };

  const activeIncidentsCount = incidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING' || i.status === 'MITIGATING'
  ).length;

  return (
    <div className="min-h-screen bg-[#090D14] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200">
      {/* Top Bar */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        operatorRole={operatorRole}
        setOperatorRole={setOperatorRole}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        activeIncidentCount={activeIncidentsCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Context Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Network Operations Center
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300">
                Akamai Job ID 4073
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated probing, Linux diagnostics, incident correlation, and safe remediation.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Worker Daemon: Active (10s sweep)</span>
            </div>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <div className="font-mono text-slate-300">
              Probes Recorded: <span className="text-white font-semibold tabular-nums">{kpi?.total_probes_run || 0}</span>
            </div>
          </div>
        </div>

        {/* Global KPI Strip */}
        <KpiStrip
          kpi={kpi}
          onFilterIncidents={() => setActiveTab('incidents')}
        />

        {/* Views */}
        {activeTab === 'services' && (
          <ServiceList
            services={services}
            onProbeService={handleProbeService}
            onInspectService={(srv) => setInspectingService(srv)}
            onCreateService={handleCreateService}
            probingIds={probingIds}
            onNavigateToChaos={(id) => {
              setChaosTargetId(id);
              setActiveTab('chaos');
            }}
            onNavigateToRemediation={(id) => {
              setRemediationTarget({ serviceId: id });
              setActiveTab('remediation');
            }}
          />
        )}

        {activeTab === 'incidents' && (
          <IncidentView
            incidents={incidents}
            onAcknowledge={handleAcknowledgeIncident}
            onResolve={handleResolveIncident}
            onTriggerRemediation={(serviceId, incidentId) => {
              setRemediationTarget({ serviceId, incidentId });
              setActiveTab('remediation');
            }}
            operatorRole={operatorRole}
          />
        )}

        {activeTab === 'remediation' && (
          <RecoveryConsole
            services={services}
            incidents={incidents}
            recoveryAudits={recoveryAudits}
            onExecuteRecovery={handleExecuteRecovery}
            operatorRole={operatorRole}
            preselectedServiceId={remediationTarget.serviceId}
            preselectedIncidentId={remediationTarget.incidentId}
          />
        )}

        {activeTab === 'diagnostics' && <DiagnosticsView />}

        {activeTab === 'chaos' && (
          <ChaosSimulator
            services={services}
            incidents={incidents}
            onProbeService={handleProbeService}
            onExecuteRecovery={handleExecuteRecovery}
            onRefresh={handleRefresh}
            preselectedServiceId={chaosTargetId}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'metrics' && <PrometheusViewer />}
      </main>

      {/* Service Deep Inspector Modal */}
      {inspectingService && (
        <ServiceInspectorModal
          service={inspectingService}
          onClose={() => setInspectingService(null)}
          onProbe={handleProbeService}
          isProbing={probingIds.has(inspectingService.id)}
          onNavigateToChaos={(id) => {
            setChaosTargetId(id);
            setActiveTab('chaos');
          }}
          onNavigateToRemediation={(id) => {
            setRemediationTarget({ serviceId: id });
            setActiveTab('remediation');
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            NetOps Sentinel · Network Operations Automation & Observability Platform
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>FastAPI + Python 3.12</span>
            <span aria-hidden="true">·</span>
            <span>PostgreSQL & Alembic</span>
            <span aria-hidden="true">·</span>
            <span>Docker & Prometheus</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
