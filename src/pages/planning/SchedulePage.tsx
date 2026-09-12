import { planningRepository } from '../../db/repositories/planning-repository';

export function SchedulePage() {
  const slots = planningRepository.listScheduleSlots();
  const conflicts = planningRepository.listScheduleConflicts();
  const conflictIds = new Set(conflicts.flatMap((c) => [c.slotAId, c.slotBId]));

  return (
    <>
      <section className="card">
        <h2>Production Schedule</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Equipment</th>
              <th>SKU</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Conflict</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className={conflictIds.has(slot.id) ? 'row-warning' : undefined}>
                <td>{slot.schedule_code}</td>
                <td>{slot.equipment_name}</td>
                <td>{slot.sku_code ?? '—'}</td>
                <td>{slot.scheduled_start.slice(0, 16)}</td>
                <td>{slot.scheduled_end.slice(0, 16)}</td>
                <td>{slot.status}</td>
                <td>{conflictIds.has(slot.id) ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {slots.length === 0 && <p>No scheduled production slots.</p>}
      </section>
    </>
  );
}
