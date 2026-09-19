import { format, parseISO } from 'date-fns';
import { buildTankInventoryReportRows } from '../../lib/reporting/tank-rows';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function TankInventoryReport() {
  const { range } = useReportContext();
  const rows = buildTankInventoryReportRows(range);

  const csvHeaders = [
    'Tank', 'Type', 'Status', 'Capacity gal', 'Volume gal', 'ABV', 'LAA gal', 'Fill %', 'Detail',
    'Last movement', 'Last movement type',
  ];
  const csvRows = rows.map((r) => [
    r.name, r.equipment_type, r.status, r.capacity_gal, r.volume_gal, r.abv ?? '',
    r.laa_gal, r.fill_pct ?? '', r.detail, r.last_movement_at ?? '', r.last_movement_type ?? '',
  ]);

  return (
    <ReportTableShell
      title="Tank inventory"
      description="Current holding and collection vessel levels (snapshot). Last movement is derived from liquid movement history."
      periodLabel="Current"
      csvFilename="tank-inventory"
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={rows.length === 0}
      emptyMessage="No holding or collection tanks configured."
    >
      <table>
        <thead>
          <tr>
            <th>Tank</th>
            <th>Type</th>
            <th>Status</th>
            <th>Capacity</th>
            <th>Volume</th>
            <th>ABV</th>
            <th>LAA</th>
            <th>Fill</th>
            <th>Last movement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.equipment_id}>
              <td><strong>{r.name}</strong></td>
              <td>{r.equipment_type}</td>
              <td>{r.status}</td>
              <td>{r.capacity_gal > 0 ? `${r.capacity_gal} gal` : '—'}</td>
              <td>{r.volume_gal > 0 ? `${r.volume_gal.toFixed(1)} gal` : 'Empty'}</td>
              <td>{r.abv != null ? `${r.abv.toFixed(1)}%` : '—'}</td>
              <td>{r.laa_gal > 0 ? `${r.laa_gal.toFixed(2)} gal` : '—'}</td>
              <td>{r.fill_pct != null ? `${r.fill_pct}%` : '—'}</td>
              <td>
                {r.last_movement_at
                  ? `${format(parseISO(r.last_movement_at.slice(0, 10)), 'MMM d, yyyy')} (${r.last_movement_type?.replace(/_/g, ' ')})`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
