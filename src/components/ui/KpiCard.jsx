import React from 'react';

const ACCENTS = {
  neutral: 'text-text-primary',
  low: 'text-risk-low',
  moderate: 'text-risk-moderate',
  high: 'text-risk-high',
  critical: 'text-risk-critical',
  amber: 'text-amber',
};

export default function KpiCard({ label, value, icon: Icon, accent = 'neutral', hint }) {
  return (
    <div className="bg-surface border border-border rounded-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary uppercase tracking-wide">{label}</span>
        {Icon && <Icon size={16} className="text-text-secondary" />}
      </div>
      <div className={`font-mono text-3xl font-bold mono-tabular ${ACCENTS[accent]}`}>{value}</div>
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  );
}
