import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  resolveReportPeriod,
  type ReportDateRange,
  type ReportPeriodPreset,
} from '../../lib/reporting/period';

export interface ReportContextValue {
  preset: ReportPeriodPreset;
  customFrom: string;
  customTo: string;
  setPreset: (p: ReportPeriodPreset) => void;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  range: ReportDateRange;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<ReportPeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(
    () => resolveReportPeriod(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const value = useMemo(
    () => ({
      preset,
      customFrom,
      customTo,
      setPreset,
      setCustomFrom,
      setCustomTo,
      range,
    }),
    [preset, customFrom, customTo, range],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReportContext(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReportContext must be used within ReportProvider');
  return ctx;
}
