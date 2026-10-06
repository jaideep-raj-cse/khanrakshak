import React from 'react';
import { TriangleAlert } from 'lucide-react';

// Distinct from StatusBadge/RiskBadge on purpose: escalation is an overlay
// signal ("this also needs management attention right now"), not a
// lifecycle status or a risk level, so it renders as its own compact chip.
// `level` is the persisted escalationLevel (1 = overdue, 2 = Compliance
// Officer, 3 = Administrator).
export default function EscalationBadge({ level }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-btn border text-[11px] font-mono uppercase tracking-wide whitespace-nowrap border-risk-critical text-risk-critical bg-risk-critical/10">
      <TriangleAlert size={11} />
      {level ? `Escalated · L${level}` : 'Escalated'}
    </span>
  );
}
