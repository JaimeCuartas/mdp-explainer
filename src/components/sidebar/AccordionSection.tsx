import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionSectionProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function AccordionSection({ label, children, defaultOpen = false }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="accordion-section">
      <button type="button" className="accordion-toggle" onClick={() => setIsOpen((prev) => !prev)}>
        <span>{label}</span>
        <ChevronDown size={16} className={`accordion-chevron${isOpen ? ' accordion-chevron--open' : ''}`} />
      </button>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
}
