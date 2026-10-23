import { Fragment } from 'react';
import { formatCalendarDay } from '../../lib/date-input';
import { emptyForEmployee, filterRowsByPerson, reportPeriodLabel } from '../../lib/reporting/person';
import { buildVolumeChangeRows, groupVolumeChanges } from '../../lib/reporting/volume-changes';
import { useReportContext } from './report-context';
import { ReportTableShell } from './ReportTableShell';

export function VolumeChangesReport() {
  const { range, employee } = useReportContext();
  const periodLabel = reportPeriodLabel(range.label, employee);
  const groups = groupVolumeChanges(filterRowsByPerson(
    buildVolumeChangeRows(range),
    (row) => row.who,
    employee,
  ));

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
      description="Grouped by kind. Fermenter leftovers, set tank volumes and ABV, water blended into alcohol already in a tank, bottling variances, blend differences, and distillation alcohol loss or gain. Watering down is a blend of water into the spirit: the alcohol stays in the tank. The summary Volume variances box totals the gallons and the ABV changes. Gallons sent to a tank, and water blended in on purpose, stay out of that total. A distillation result is the alcohol charged minus the alcohol collected. When more alcohol is collected than was charged, it is recorded as a gain. Alcohol left in the stillage is part of a loss, and its ABV is included in the summary."
      periodLabel={periodLabel}
      csvFilename={`volume-changes-${range.from ?? 'all'}`}
      csvHeaders={csvHeaders}
      csvRows={csvRows}
      isEmpty={groups.length === 0}
      emptyMessage={emptyForEmployee('No volume or ABV changes in this period.', employee)}
    >
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Place</th>
            <th className="num">Change</th>
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
                  <td className="num">{row.change}</td>
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
