import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <Icon size={26} className="text-text-secondary mb-3" />
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="text-xs text-text-secondary mt-1 max-w-sm">{description}</p>}
    </div>
  );
}
