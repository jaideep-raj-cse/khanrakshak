import React from 'react';

const ROWS = [
  { key: 'severity', label: 'Severity' },
  { key: 'recurrence', label: 'Recurrence' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'delay', label: 'Delay' },
];

// Shows each risk component's weight (fixed, e.g. Severity 40%), the reason it
// scored what it did, and how much of the final 0-100 score it contributed.
// If `score` (and optionally `levelLabel`) are passed, a final-score row is
// shown so the parts visibly add up to the total.
export default function RiskBreakdown({ breakdown, score, levelLabel }) {
  return (
    <div className="space-y-2.5">
      {ROWS.map(({ key, label }) => {
        const part = breakdown[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-text-secondary">
                {label} <span className="text-text-muted font-mono">({part.weight}%)</span>
              </span>
              <span className="font-mono text-text-primary">+{part.contribution}</span>
            </div>
            <div className="h-1.5 bg-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-amber rounded-full"
                style={{ width: `${Math.min(100, part.value)}%` }}
              />
            </div>
            {part.reason && <p className="mt-1 text-[11px] text-text-muted">{part.reason}</p>}
          </div>
        );
      })}
      {score !== undefined && (
        <div className="flex items-center justify-between pt-2.5 border-t border-border text-xs">
          <span className="text-text-secondary font-semibold">
            Final score{levelLabel ? ` · ${levelLabel}` : ''}
          </span>
          <span className="font-mono text-text-primary font-semibold">{score} / 100</span>
        </div>
      )}
    </div>
  );
}
