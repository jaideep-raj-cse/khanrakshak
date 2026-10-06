import React from 'react';
import EmptyState from './EmptyState';

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <EmptyState title="No activity yet" description="Timeline events will appear here as the workflow progresses." />;
  }

  return (
    <ol className="relative pl-5">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
      {events.map((event, idx) => (
        <li key={idx} className="relative pb-5 last:pb-0">
          <span className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-elevated border-2 border-amber" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">{event.action}</span>
            <span className="text-xs font-mono text-text-secondary shrink-0">{event.displayDate}</span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{event.description}</p>
          <p className="text-[11px] text-text-muted mt-0.5 font-mono">
            {event.actor} · {event.role}
          </p>
        </li>
      ))}
    </ol>
  );
}
