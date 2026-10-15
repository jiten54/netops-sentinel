import React from 'react';
import { ShieldCheck, RefreshCw, UserCheck, Activity } from 'lucide-react';

interface TopNavProps {
  activeTab: 'services' | 'incidents' | 'diagnostics' | 'remediation' | 'chaos' | 'metrics';
  setActiveTab: (tab: 'services' | 'incidents' | 'diagnostics' | 'remediation' | 'chaos' | 'metrics') => void;
  operatorRole: string;
  setOperatorRole: (role: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeIncidentCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  operatorRole,
  setOperatorRole,
  onRefresh,
  isRefreshing,
  activeIncidentCount
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950 border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-md">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400">
          <Activity className="w-4 h-4" />
        </div>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab('services'); }}
          className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap hover:text-white transition-colors"
        >
          NetOps Sentinel
        </a>
      </div>

      {/* Zone 2: Single-line Navigation Links */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('services')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'services' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          Services Health
        </button>
        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-2 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'incidents' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          <span>Incidents</span>
          {activeIncidentCount > 0 && (
            <span className="px-1.5 py-0.2 text-xs font-mono font-medium rounded bg-red-950/80 border border-red-800 text-red-400">
              {activeIncidentCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'diagnostics' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          Linux Diagnostics
        </button>
        <button
          onClick={() => setActiveTab('remediation')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'remediation' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          Remediation Engine
        </button>
        <button
          onClick={() => setActiveTab('chaos')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'chaos' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          Chaos Simulator
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'metrics' ? 'border-blue-500 text-slate-100 font-semibold' : 'border-transparent'
          }`}
        >
          Prometheus
        </button>
      </nav>

      {/* Zone 3: Primary Action & Role Control */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
          <UserCheck className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400 hidden sm:inline">Role:</span>
          <select
            value={operatorRole}
            onChange={(e) => setOperatorRole(e.target.value)}
            className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
          >
            <option value="netops-admin" className="bg-slate-900 text-slate-200">netops-admin</option>
            <option value="noc-engineer" className="bg-slate-900 text-slate-200">noc-engineer</option>
            <option value="readonly-auditor" className="bg-slate-900 text-slate-200">readonly-auditor</option>
          </select>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </header>
  );
};
