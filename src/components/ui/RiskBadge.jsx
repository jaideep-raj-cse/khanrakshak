import React from 'react';

const STYLES = {
  LOW: { color: '#10B981', label: 'Low' },
  MODERATE: { color: '#D97706', label: 'Moderate' },
  HIGH: { color: '#EA580C', label: 'High' },
  CRITICAL: { color: '#EF4444', label: 'Critical' },
};

export default function RiskBadge({ level }) {
  const style = STYLES[level] ?? STYLES.LOW;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-btn border text-[11px] font-mono uppercase tracking-wide"
      style={{
        color: style.color,
        borderColor: style.color,
        backgroundColor: `${style.color}1F`,
      }}
    >
      <span className="w-1.5 h-1.5" style={{ backgroundColor: style.color }} />
      {style.label}
    </span>
  );
}
