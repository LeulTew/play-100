import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './browse-filters.css';

export function BrowseFilters({ activeCount, children, label = 'Filters', className = '' }: {
  activeCount: number; children: ReactNode; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      if (media.matches && ref.current?.contains(document.activeElement)) ref.current.querySelector('summary')?.focus();
      setOpen(!media.matches);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return <details ref={ref} className={`browse-filters ${className}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{label}<span>{activeCount ? `${activeCount} active` : 'None active'}</span></summary>
    <div className="browse-filters-content">{children}</div>
  </details>;
}
