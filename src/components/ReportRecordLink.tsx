import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { reportSourcePath, type ReportSourceTarget } from '../lib/reporting/report-links';

export function ReportRecordLink({
  target,
  children,
  className,
}: {
  target: ReportSourceTarget;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={reportSourcePath(target)} className={className ?? 'report-record-link'}>
      {children}
    </Link>
  );
}
