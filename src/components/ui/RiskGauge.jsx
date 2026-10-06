import React from 'react';

const RISK_COLOR = {
  LOW: '#10B981',
  MODERATE: '#D97706',
  HIGH: '#EA580C',
  CRITICAL: '#EF4444',
};

const RISK_LABEL = {
  LOW: 'Low',
  MODERATE: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// Semicircular arc gauge: 0-100 mapped across 180°, drawn with a fixed
// background track and a colored progress arc using stroke-dasharray.
export default function RiskGauge({ score, level, size = 176 }) {
  const color = RISK_COLOR[level] ?? RISK_COLOR.LOW;
  const strokeWidth = 14;
  const radius = size / 2 - strokeWidth;
  const circumference = Math.PI * radius; // half circle
  const clamped = Math.max(0, Math.min(100, score));
  const progress = (clamped / 100) * circumference;

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + strokeWidth / 2} viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}>
        {/* Track */}
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke="#334155"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
        />
      </svg>
      <div className="-mt-8 flex flex-col items-center">
        <span className="font-mono text-3xl font-bold" style={{ color }}>
          {clamped}
        </span>
        <span className="text-[10px] text-text-secondary -mt-1">/ 100</span>
      </div>
      <span
        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-btn border text-xs font-mono uppercase tracking-wide"
        style={{ color, borderColor: color, backgroundColor: `${color}1F` }}
      >
        {RISK_LABEL[level] ?? level}
      </span>
    </div>
  );
}
