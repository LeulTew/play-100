import type { ReactNode } from 'react';

export function SelectField({ id, label, value, onChange, children, className = '', disabled = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <div className={`filter-select ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="select-shell">
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <svg className="select-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </div>
    </div>
  );
}
