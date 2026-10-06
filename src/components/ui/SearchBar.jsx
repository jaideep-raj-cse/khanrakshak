import React from 'react';
import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div
      className={`flex items-center gap-2 bg-bg border border-border rounded-input px-3 h-9 text-sm ${className}`}
    >
      <Search size={14} className="text-text-secondary shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none w-full placeholder:text-text-secondary"
      />
    </div>
  );
}
