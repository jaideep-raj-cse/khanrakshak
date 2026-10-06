import React from 'react';
import { RISK_COLORS } from '../../data/constants';

const STYLES = {
  LOW: { color: RISK_COLORS.LOW, label: 'Low' },
  MODERATE: { color: RISK_COLORS.MODERATE, label: 'Medium' },
  HIGH: { color: RISK_COLORS.HIGH, label: 'High' },
  CRITICAL: { color: RISK_COLORS.CRITICAL, label: 'Critical' },
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
