import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRefreshKey } from '../../db/queries';
import { useAssignableUsers } from '../../hooks/useAssignableUsers';
import {
  ALL_EMPLOYEES_KEY,
  employeeFromAccount,
  listRecordedReportNames,
  mergeReportEmployees,
  type ReportEmployee,
} from '../../lib/reporting/person';
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
  employeeKey: string;
  setEmployeeKey: (key: string) => void;
  employees: ReportEmployee[];
  /** Null means every employee, including rows with no person recorded. */
  employee: ReportEmployee | null;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<ReportPeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [employeeKey, setEmployeeKey] = useState(ALL_EMPLOYEES_KEY);
  const [recordedNames, setRecordedNames] = useState<string[]>([]);
  const { users } = useAssignableUsers();
  const { key: refreshKey } = useRefreshKey();

  useEffect(() => {
    setRecordedNames(listRecordedReportNames());
  }, [refreshKey]);

  const range = useMemo(
    () => resolveReportPeriod(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const employees = useMemo(
    () => mergeReportEmployees(users.map(employeeFromAccount), recordedNames),
    [users, recordedNames],
  );
  const employee = employeeKey
    ? employees.find((option) => option.key === employeeKey) ?? null
    : null;

  const value = useMemo(
    () => ({
      preset,
      customFrom,
      customTo,
      setPreset,
      setCustomFrom,
      setCustomTo,
      range,
      employeeKey,
      setEmployeeKey,
      employees,
      employee,
    }),
    [preset, customFrom, customTo, range, employeeKey, employees, employee],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReportContext(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReportContext must be used within ReportProvider');
  return ctx;
}
