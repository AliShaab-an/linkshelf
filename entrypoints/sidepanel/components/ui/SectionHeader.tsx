import type { ReactNode, Ref } from 'react';
import { sectionTitle } from './styles';

/** The title row shared by every sidebar section: a focusable h2, an optional description, and an optional action. */
export function SectionHeader({ title, description, action, headingRef, headingId }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  headingId?: string;
}) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
    <div className="min-w-0 flex-1">
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className={sectionTitle}>{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
    {action}
  </div>;
}
