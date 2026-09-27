import React from 'react';
import { Construction } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function PlaceholderPage({ title, buildStep }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="bg-surface border border-dashed border-border rounded-card p-10 flex flex-col items-center text-center gap-3">
        <Construction size={28} className="text-text-secondary" />
        <p className="text-sm text-text-secondary max-w-sm">
          This module is defined in the product specification and is scheduled for{' '}
          <span className="text-text-primary font-medium">{buildStep}</span> of the incremental
          build plan.
        </p>
      </div>
    </div>
  );
}
