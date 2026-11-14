import { useEffect, useMemo, useState } from 'react';
import { formatCalendarDay, formatRecordedAt } from '../../lib/date-input';
import { buildLiquidMovements } from '../../lib/reporting/movements';
import { eventInReportRange, type ReportDateRange } from '../../lib/reporting/period';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import {
  applyTankBalances,
  buildTankHistory,
  TANK_HISTORY_COLLAPSED_COUNT,
  tankHistoryTotals,
  visibleTankHistory,
} from '../../lib/reporting/tank-history';
import { buildTankInventoryReportRows, type TankInventoryReportRow } from '../../lib/reporting/tank-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function TankInventoryReport() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel('Current', employee);
  const allTanks = useMemo(() => buildTankInventoryReportRows(range), [range]);
  const rows = filterRowsByPerson(
    allTanks,
    (row) => row.last_movement_user,
    employee,
  );

  const csvHeaders = [
    'Tank', 'Type', 'Status', 'Capacity gal', 'Volume gal', 'ABV', 'LAA gal', 'Fill %', 'Detail',
    'Last movement', 'Last movement type', 'Last movement by',
  ];
  const csvRows = rows.map((r) => [
    r.name, r.equipment_type, r.status, r.capacity_gal, r.volume_gal, r.abv ?? '',
    r.laa_gal, r.fill_pct ?? '', r.detail, r.last_movement_at ?? '', r.last_movement_type ?? '',
    r.last_movement_user ?? '',
  ]);

  return (
    <>
    <ReportTableShell
      title="Tank inventory"
      description={employee
        ? `Current holding and collection vessel levels whose latest movement was recorded by ${employee.label}.`
        : 'Current holding and collection vessel levels (snapshot). Last movement is derived from liquid movement history.'}
      periodLabel={periodLabel}
      csvFilename="tank-inventory"
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage={employee
        ? `No tanks whose latest movement was recorded by ${employee.label}.`
        : 'No holding or collection tanks configured.'}
    >
      <table>
        <thead>
          <tr>
            <th>Tank</th>
            <th>Type</th>
            <th>Status</th>
            <th className="num">Capacity</th>
            <th className="num">Volume</th>
            <th className="num">ABV</th>
            <th className="num">LAA</th>
            <th className="num">Fill</th>
            <th>Last movement</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.equipment_id}>
              <td><strong>{r.name}</strong></td>
              <td>{r.equipment_type}</td>
              <td>{r.status}</td>
              <td className="num">{r.capacity_gal > 0 ? `${r.capacity_gal} gal` : '—'}</td>
              <td className="num">{r.volume_gal > 0 ? `${r.volume_gal.toFixed(1)} gal` : 'Empty'}</td>
              <td className="num">{r.abv != null ? `${r.abv.toFixed(1)}%` : '—'}</td>
              <td className="num">{r.laa_gal > 0 ? `${r.laa_gal.toFixed(2)} gal` : '—'}</td>
              <td className="num">{r.fill_pct != null ? `${r.fill_pct}%` : '—'}</td>
              <td>
                {r.last_movement_at
                  ? `${formatCalendarDay(r.last_movement_at)} (${r.last_movement_type?.replace(/_/g, ' ')})`
                  : '—'}
              </td>
              <td>{r.last_movement_user?.trim() || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
    <TankHistorySection tanks={allTanks} />
    </>
  );
}

const ALL_TIME: ReportDateRange = { preset: 'all', from: null, to: null, label: 'All time' };

function TankHistorySection({ tanks }: { tanks: TankInventoryReportRow[] }) {
  const { range, employee } = useReportContext();
  const [tankId, setTankId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const tankOptions = useMemo(
    () => [...tanks].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [tanks],
  );
  const balancedHistory = useMemo(() => applyTankBalances(
    buildTankHistory(
      buildLiquidMovements(ALL_TIME, { includePlannedBottlings: true }),
      tanks.map((t) => ({ id: t.equipment_id, name: t.name })),
    ),
    tanks.map((t) => ({ id: t.equipment_id, volume_gal: t.volume_gal, abv: t.abv })),
  ), [tanks]);
  const entries = useMemo(
    () => filterRowsByPerson(
      balancedHistory.filter((e) =>
        (tankId == null || e.tank_id === tankId) && eventInReportRange(e.occurred_at, range)),
      (e) => e.user_label,
      employee,
    ),
    [balancedHistory, range, tankId, employee],
  );

  useEffect(() => {
    setExpanded(false);
  }, [range, tankId, employee]);

  const visible = visibleTankHistory(entries, expanded);
  const totals = tankHistoryTotals(entries);
  const hiddenCount = entries.length - visible.length;
  const tankName = tankId != null ? tankOptions.find((t) => t.equipment_id === tankId)?.name : null;

  const csvHeaders = [
    'Date', 'Tank', 'In/Out', 'From/To', 'Movement', 'What', 'Batch', 'Volume gal', 'ABV', 'LAA gal',
    'Tank total after gal', 'Tank ABV after', 'By', 'Reference', 'Notes',
  ];
  const csvRows = entries.map((e) => [
    e.occurred_at, e.tank_name, e.direction === 'in' ? 'In' : 'Out', e.counterpart, e.movement_label, e.what,
    e.batch_ref, e.volume_gal, e.abv, e.laa_gal, e.after_volume_gal ?? '', e.after_abv ?? '',
    e.user_label, e.reference, e.notes,
  ]);

  return (
    <ReportTableShell
      title={tankName ? `Tank history · ${tankName}` : 'Tank history'}
      description="What went into and out of each tank, where it came from and where it went. Newest first."
      periodLabel={reportPeriodLabel(range.label, employee)}
      csvFilename={tankName ? `tank-history-${tankName}` : 'tank-history'}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={false}
      tableWrap={false}
    >
      <div className="tank-history-toolbar">
        <div className="form-group">
          <label htmlFor="tank-history-tank">Tank</label>
          <select
            id="tank-history-tank"
            value={tankId ?? ''}
            onChange={(e) => setTankId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All tanks</option>
            {tankOptions.map((t) => (
              <option key={t.equipment_id} value={t.equipment_id}>{t.name}</option>
            ))}
          </select>
        </div>
        {entries.length > 0 && (
          <p className="tank-history-totals">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            {' · '}In <strong>{totals.in_gal.toFixed(2)} gal</strong>
            {' · '}Out <strong>{totals.out_gal.toFixed(2)} gal</strong>
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <p>
            {emptyForEmployee(
              tankName ? `Nothing went into or out of ${tankName} in this period.` : 'No tank ins or outs in this period.',
              employee,
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {tankId == null && <th>Tank</th>}
                  <th>In / Out</th>
                  <th>From / To</th>
                  <th>What</th>
                  <th className="num">Volume</th>
                  <th className="num">ABV</th>
                  <th className="num">LAA</th>
                  <th className="num">Tank total after</th>
                  <th>By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.key}>
                    <td>{formatRecordedAt(e.occurred_at)}</td>
                    {tankId == null && <td><strong>{e.tank_name}</strong></td>}
                    <td>
                      <span className={`badge ${e.direction === 'in' ? 'badge-complete' : 'badge-mashing'}`}>
                        {e.direction === 'in' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td>
                      {e.direction === 'in' ? 'From ' : 'To '}
                      <strong>{e.counterpart}</strong>
                      {e.movement_label !== e.counterpart && (
                        <div className="tank-history-sub">{e.movement_label}</div>
                      )}
                    </td>
                    <td>
                      {e.what || '—'}
                      {e.batch_ref && <div className="tank-history-sub">{e.batch_ref}</div>}
                    </td>
                    <td className="num tank-history-volume">
                      {e.direction === 'in' ? '+' : '−'}{e.volume_gal.toFixed(2)} gal
                    </td>
                    <td className="num">{e.abv > 0 ? `${e.abv.toFixed(2)}%` : '—'}</td>
                    <td className="num tank-history-volume">{e.laa_gal > 0 ? `${e.laa_gal.toFixed(2)} gal` : '—'}</td>
                    <td className="num tank-history-volume">
                      {e.after_volume_gal == null ? '—' : e.after_volume_gal > 0 ? (
                        <>
                          <strong>{e.after_volume_gal.toFixed(2)} gal</strong>
                          <div className="tank-history-sub">{(e.after_abv ?? 0).toFixed(2)}% ABV</div>
                        </>
                      ) : 'Empty'}
                    </td>
                    <td>{e.user_label?.trim() || '—'}</td>
                    <td className="tank-history-notes">
                      {e.notes || (e.unexplained_out_gal ? '' : '—')}
                      {e.unexplained_out_gal != null && (
                        <div className="tank-history-warning">
                          {e.unexplained_out_gal.toFixed(2)} gal left this tank after this with no record in this history.
                          The tank reads {e.after_volume_gal ? `${e.after_volume_gal.toFixed(2)} gal` : 'empty'} here because of it.
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > TANK_HISTORY_COLLAPSED_COUNT && (
            <div className="tank-history-more">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? `Show latest ${TANK_HISTORY_COLLAPSED_COUNT}` : `Show all ${entries.length} (${hiddenCount} more)`}
              </button>
            </div>
          )}
        </>
      )}
    </ReportTableShell>
  );
}
