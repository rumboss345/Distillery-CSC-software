import { Link } from 'react-router-dom';
import { formatDateDisplay } from '../../lib/date-input';
import type { ScheduleDay, ScheduleJob, TodayProduction } from '../../lib/dashboard/schedule';

function JobRow({ job, showDeadline }: { job: ScheduleJob; showDeadline: boolean }) {
  return (
    <li className={`dash-job dash-job-${job.state}`}>
      <Link to={job.href} className="dash-job-link">
        <span className={`dash-job-state dash-job-state-${job.state}`}>{job.stateLabel}</span>
        <span className="dash-job-main">
          <span className="dash-job-title">
            <span className="dash-job-kind">{job.kindLabel}</span> {job.title}
          </span>
          {job.detail && <span className="dash-job-detail">{job.detail}</span>}
        </span>
        <span className="dash-job-side">
          <span className="dash-job-operator">{job.operator}</span>
          {showDeadline && (
            <span className="dash-job-deadline">
              {job.deadline === job.startDate ? formatDateDisplay(job.deadline) : `Due ${formatDateDisplay(job.deadline)}`}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function CleaningList({ jobs }: { jobs: ScheduleJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="dash-job-group dash-cleaning" data-testid="dashboard-needs-cleaning">
      <h4 className="dash-job-group-title">To clean ({jobs.length})</h4>
      <ul className="dash-cleaning-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link to={job.href} title={job.detail}>{job.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TodayProductionPanel({
  today,
  title = "Today's production",
}: {
  today: TodayProduction;
  title?: string;
}) {
  const open = today.overdue.length + today.inProgress.length + today.plannedToday.length;
  const groups: { label: string; jobs: ScheduleJob[] }[] = [
    { label: 'Overdue', jobs: today.overdue },
    { label: 'In progress', jobs: today.inProgress },
    { label: 'Planned for today', jobs: today.plannedToday },
    { label: 'Finished today', jobs: today.doneToday },
  ];
  return (
    <section className="dash-panel" data-testid="dashboard-today" aria-labelledby="dash-today-title">
      <header className="dash-panel-header">
        <h3 id="dash-today-title" className="dash-panel-title">{title}</h3>
        <div className="dash-chip-row">
          {today.openByKind.map((row) => (
            <span key={row.kind} className="dash-chip">{row.count} {row.label.toLowerCase()}</span>
          ))}
        </div>
      </header>
      {open === 0 && today.doneToday.length === 0 ? (
        <p className="dash-empty">No production is planned or running today.</p>
      ) : (
        groups.filter((group) => group.jobs.length > 0).map((group) => (
          <div key={group.label} className="dash-job-group">
            <h4 className="dash-job-group-title">{group.label} ({group.jobs.length})</h4>
            <ul className="dash-job-list">
              {group.jobs.map((job) => <JobRow key={job.id} job={job} showDeadline={group.label !== 'Finished today'} />)}
            </ul>
          </div>
        ))
      )}
      <CleaningList jobs={today.needsCleaning} />
    </section>
  );
}

export function SevenDaySchedulePanel({ days }: { days: ScheduleDay[] }) {
  const total = days.reduce((sum, day) => sum + day.jobs.length, 0);
  return (
    <section className="dash-panel" data-testid="dashboard-schedule" aria-labelledby="dash-schedule-title">
      <header className="dash-panel-header">
        <h3 id="dash-schedule-title" className="dash-panel-title">Next 7 days</h3>
        <Link to="/calendar" className="dash-panel-link">Open calendar</Link>
      </header>
      {total === 0 ? (
        <p className="dash-empty">No production or cleaning is scheduled for the next seven days.</p>
      ) : (
        <div className="dash-schedule">
          {days.map((day) => (
            <div key={day.date} className={`dash-schedule-day${day.isToday ? ' dash-schedule-today' : ''}`}>
              <h4 className="dash-schedule-date">{day.label}</h4>
              {(() => {
                const production = day.jobs.filter((job) => job.kind !== 'cleaning');
                const cleaning = day.jobs.filter((job) => job.kind === 'cleaning');
                return (
                  <>
                    {production.length === 0 && cleaning.length === 0 && (
                      <p className="dash-schedule-none">Nothing scheduled</p>
                    )}
                    {production.length > 0 && (
                      <ul className="dash-job-list">
                        {production.map((job) => <JobRow key={`${day.date}-${job.id}`} job={job} showDeadline />)}
                      </ul>
                    )}
                    <CleaningList jobs={cleaning} />
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
