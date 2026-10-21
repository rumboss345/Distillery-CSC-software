import { useState, type ReactNode } from 'react';

const STORAGE_PREFIX = 'section-open:';

function readStoredOpen(storageKey: string | undefined): boolean | null {
  if (!storageKey) return null;
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + storageKey);
    return stored === '1' ? true : stored === '0' ? false : null;
  } catch {
    return null;
  }
}

interface CollapsibleSectionProps {
  title: ReactNode;
  /** Short note beside the title, such as a count. Shown open or closed. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Opens the section regardless of the remembered choice, e.g. when a link points into it. */
  forceOpen?: boolean;
  /** Remembers open or closed on this device. */
  storageKey?: string;
  headingLevel?: 'h3' | 'h4';
  className?: string;
  headingClassName?: string;
  id?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  forceOpen = false,
  storageKey,
  headingLevel = 'h3',
  className,
  headingClassName,
  id,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => readStoredOpen(storageKey) ?? defaultOpen);
  const isOpen = open || forceOpen;
  const Heading = headingLevel;

  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, next ? '1' : '0');
    } catch {
      // Remembering the choice is optional.
    }
  };

  return (
    <section id={id} className={`collapsible-section${isOpen ? ' collapsible-section--open' : ''}${className ? ` ${className}` : ''}`}>
      <Heading className={`collapsible-section-heading${headingClassName ? ` ${headingClassName}` : ''}`}>
        <button type="button" className="collapsible-section-toggle" aria-expanded={isOpen} onClick={toggle}>
          <span className="collapsible-section-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          <span className="collapsible-section-title">{title}</span>
          {summary != null && summary !== '' && <span className="collapsible-section-summary">{summary}</span>}
        </button>
      </Heading>
      {isOpen && <div className="collapsible-section-body">{children}</div>}
    </section>
  );
}
