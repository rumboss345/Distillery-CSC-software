import { Fragment } from 'react';
import { formatCalendarDay } from '../../lib/date-input';
import { buildVolumeChangeRows, groupVolumeChanges } from '../../lib/reporting/volume-changes';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function VolumeChangesReport() {
  const { range } = useReportContext();
  const groups = groupVolumeChanges(buildVolumeChangeRows(range));

  const csvHeaders = ['Date', 'Kind', 'Place', 'Change', 'Why', 'Who'];
  const csvRows = groups.flatMap((group) => [
    ...group.rows.map((row) => [
      row.occurred_at, row.kind, row.place, row.change, row.why, row.who,
    ]),
    ['', group.kind, 'Total', group.totalLabel, '', ''],
  ]);

  return (
    <ReportTableShell
      title="Volume changes"
      description="Grouped by kind. Fermenter leftovers, set tank volumes and ABV, bottling variances, blend differences, and distillation alcohol loss. A distillation loss is the alcohol charged minus the alcohol collected. Set volume, bottling variance, blend volume, and distillation loss add into Volume variances on the summary."
      periodLabel={range.label}
      csvFilename={`volume-changes-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={groups.length === 0}
      emptyMessage="No volume or ABV changes in this period."
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Place</th>
            <th>Change</th>
            <th>Why</th>
            <th>Who</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.kind}>
              <tr className="volume-change-kind" data-kind={group.kind}>
                <td colSpan={5}>
                  <div className="volume-change-kind-row">
                    <span>{group.kind}</span>
                    <span>{group.totalLabel}</span>
                  </div>
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key}>
                  <td>{formatCalendarDay(row.occurred_at)}</td>
                  <td><strong>{row.place}</strong></td>
                  <td>{row.change}</td>
                  <td>{row.why}</td>
                  <td>{row.who}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </ReportTableShell>
  );
}
