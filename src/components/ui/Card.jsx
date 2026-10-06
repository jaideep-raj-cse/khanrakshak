import React from 'react';

export default function Card({ title, action, children, className = '' }) {
  return (
    <div className={`bg-surface border border-border rounded-card overflow-hidden ${className}`}>
      {title && (
        <div className="h-9 px-3 flex items-center justify-between bg-elevated border-b border-border">
          <span className="text-xs font-semibold tracking-wide">{title}</span>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
