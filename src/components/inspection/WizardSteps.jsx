import React from 'react';
import { Check } from 'lucide-react';

export default function WizardSteps({ steps, currentIndex }) {
  return (
    <div className="mb-6">
      <div className="flex items-center">
        {steps.map((label, idx) => {
          const isComplete = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono border-2 ${
                    isComplete
                      ? 'bg-amber border-amber text-surface'
                      : isCurrent
                      ? 'border-amber text-amber'
                      : 'border-border text-text-secondary'
                  }`}
                >
                  {isComplete ? <Check size={13} /> : idx + 1}
                </div>
                <span
                  className={`hidden lg:block text-[10px] mt-1 text-center max-w-[72px] leading-tight ${
                    isCurrent ? 'text-amber' : 'text-text-secondary'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${isComplete ? 'bg-amber' : 'bg-border'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="lg:hidden mt-2 text-xs text-text-secondary">
        Step {currentIndex + 1} of {steps.length}: <span className="text-text-primary">{steps[currentIndex]}</span>
      </div>
    </div>
  );
}
