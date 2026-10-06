import React from 'react';

export default function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label && <span className="text-text-secondary text-xs uppercase tracking-wide">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg border border-border rounded-input h-9 px-2 text-sm text-text-primary outline-none focus:border-amber"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
