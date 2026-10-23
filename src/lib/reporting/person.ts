import { queryAll } from '../../db/database';
import { formatAssigneeLabel } from '../assignee';

/** One choice in the report employee list. `id` is set for a current account. */
export interface ReportEmployee {
  id: number | null;
  key: string;
  label: string;
  /** Lowercased name, email, and display label that count as this person. */
  aliases: string[];
}

export const ALL_EMPLOYEES_KEY = '';

const UNASSIGNED = new Set(['', '—', '-', '–', '— (system)']);

export function reportEmployeeKey(id: number): string {
  return `user:${id}`;
}

export function recordedNameKey(name: string): string {
  return `name:${name.trim().toLowerCase()}`;
}

export function normalizeRecordedPerson(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A blank, dash, or system label is not a specific employee. */
export function isUnassignedPerson(value: string | null | undefined): boolean {
  const label = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!label) return true;
  return UNASSIGNED.has(label) || UNASSIGNED.has(label.toLowerCase());
}

function uniqueAliases(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRecordedPerson(value);
    if (!normalized || isUnassignedPerson(value)) continue;
    seen.add(normalized);
  }
  return [...seen];
}

export function employeeFromAccount(user: {
  id: number;
  name: string | null;
  email: string;
}): ReportEmployee {
  const label = formatAssigneeLabel(user.name, user.email);
  return {
    id: user.id,
    key: reportEmployeeKey(user.id),
    label,
    aliases: uniqueAliases([user.name, user.email, label]),
  };
}

/** Accounts first, then recorded names that are not a current account. */
export function mergeReportEmployees(
  accounts: readonly ReportEmployee[],
  recordedNames: readonly string[],
): ReportEmployee[] {
  const covered = new Set(accounts.flatMap((employee) => employee.aliases));
  const extras: ReportEmployee[] = [];
  const seen = new Set<string>();
  for (const name of recordedNames) {
    if (isUnassignedPerson(name)) continue;
    const normalized = normalizeRecordedPerson(name);
    if (!normalized || covered.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    extras.push({
      id: null,
      key: recordedNameKey(name),
      label: name.replace(/\s+/g, ' ').trim(),
      aliases: [normalized],
    });
  }
  return [...accounts, ...extras].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/**
 * `employee` null means every row, including rows with no person.
 * A chosen employee matches their account id, name, or email.
 * A dash or blank recorded name does not match a specific employee.
 */
export function reportPersonMatches(
  recorded: string | null | undefined,
  employee: ReportEmployee | null,
  recordedUserId?: number | null,
): boolean {
  if (!employee) return true;
  if (employee.id != null && recordedUserId != null && recordedUserId === employee.id) return true;
  if (isUnassignedPerson(recorded)) return false;
  return employee.aliases.includes(normalizeRecordedPerson(recorded));
}

export function filterRowsByPerson<T>(
  rows: readonly T[],
  recorded: (row: T) => string | null | undefined,
  employee: ReportEmployee | null,
  recordedUserId?: (row: T) => number | null | undefined,
): T[] {
  if (!employee) return [...rows];
  return rows.filter((row) => reportPersonMatches(
    recorded(row),
    employee,
    recordedUserId?.(row),
  ));
}

export function reportPeriodLabel(periodLabel: string, employee: ReportEmployee | null): string {
  if (!employee) return periodLabel;
  return `${periodLabel} · ${employee.label}`;
}

export function emptyForEmployee(message: string, employee: ReportEmployee | null): string {
  if (!employee) return message;
  if (message.includes('in this period')) {
    return message.replace('in this period', `for ${employee.label} in this period`);
  }
  if (message.includes('for this period')) {
    return message.replace('for this period', `for ${employee.label} in this period`);
  }
  const trimmed = message.endsWith('.') ? message.slice(0, -1) : message;
  return `${trimmed} for ${employee.label}.`;
}

/** Names already written on production records, so a former employee can still be selected. */
export function listRecordedReportNames(): string[] {
  try {
    const rows = queryAll<{ name: string | null }>(`
      SELECT DISTINCT name FROM (
        SELECT TRIM(assigned_user_name) AS name FROM mash_batches
        UNION ALL
        SELECT TRIM(assigned_user_name) FROM distillation_runs
        UNION ALL
        SELECT TRIM(assigned_user_name) FROM blend_products
        UNION ALL
        SELECT TRIM(variance_changed_by) FROM bottling_runs
        UNION ALL
        SELECT TRIM(changed_by) FROM discarded_fermentations
        UNION ALL
        SELECT TRIM(changed_by) FROM holding_tank_volume_variances
        UNION ALL
        SELECT TRIM(changed_by) FROM holding_tank_dilutions
        UNION ALL
        SELECT TRIM(recorded_by_user_name) FROM equipment_maintenance_log
      )
      WHERE name IS NOT NULL AND name != ''
    `);
    return rows.map((row) => row.name ?? '').filter((name) => name.trim().length > 0);
  } catch {
    return [];
  }
}
