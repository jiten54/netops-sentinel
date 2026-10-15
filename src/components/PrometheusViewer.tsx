import React, { useEffect, useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, RefreshCw } from 'lucide-react';

export const PrometheusViewer: React.FC = () => {
  const [metricsText, setMetricsText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchMetrics = () => {
    setLoading(true);
    fetch('/metrics')
      .then((res) => res.text())
      .then((text) => setMetricsText(text))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(metricsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Prometheus Metrics Exposition</h2>
          <p className="text-xs text-slate-400">
            Standard Prometheus text exposition format scraped at <code className="text-blue-400 font-mono">/metrics</code>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Metrics'}</span>
          </button>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="text-slate-500 py-12 text-center">Fetching live Prometheus metrics...</div>
        ) : (
          <pre className="whitespace-pre-wrap leading-relaxed">{metricsText}</pre>
        )}
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-200">Prometheus Scrape Configuration</div>
        <p>
          Configure your Prometheus instance to scrape this target in <code className="text-slate-300 font-mono">prometheus.yml</code>:
        </p>
        <pre className="p-2 rounded bg-slate-950 font-mono text-[11px] text-blue-300 overflow-x-auto mt-1">
{`scrape_configs:
  - job_name: 'netops_sentinel'
    scrape_interval: 10s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['localhost:3000']`}
        </pre>
      </div>
    </div>
  );
};
