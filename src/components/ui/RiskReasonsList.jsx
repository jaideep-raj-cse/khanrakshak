import React from 'react';

export default function RiskReasonsList({ reasons }) {
  return (
    <ul className="space-y-1.5">
      {reasons.map((reason, idx) => (
        <li key={idx} className="text-xs text-text-secondary flex gap-2">
          <span className="text-amber">•</span>
          {reason}
        </li>
      ))}
    </ul>
  );
}
