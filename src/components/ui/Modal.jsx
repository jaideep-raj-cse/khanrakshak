import React from 'react';
import { X } from 'lucide-react';

// Small reusable confirmation/form dialog. Introduced for Step 4 (Verify /
// Reject confirmations, completion-notes form) — kept generic so it isn't a
// one-off component per workflow action.
export default function Modal({ title, children, onClose, footer, width = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className={`w-full ${width} bg-surface border border-border rounded-card overflow-hidden shadow-xl`}>
        <div className="h-11 px-4 flex items-center justify-between bg-elevated border-b border-border">
          <span className="text-sm font-semibold">{title}</span>
          <button
            onClick={onClose}
            className="p-1 rounded-btn text-text-secondary hover:text-text-primary hover:bg-surface"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 pb-4 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
