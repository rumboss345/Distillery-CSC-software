import { useState } from 'react';
import { formatRecordedAt } from '../../lib/date-input';
import {
  getTraceabilityPath,
  searchTraceability,
  type TraceabilityHit,
} from '../../lib/reporting/traceability';

function hitKey(hit: TraceabilityHit): string {
  return `${hit.kind}:${hit.id}`;
}

export function TraceabilityReport() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [pickedFor, setPickedFor] = useState('');

  const hits = submitted.length >= 2 ? searchTraceability(submitted) : [];
  const selectedKey = pickedFor === submitted
    ? pickedKey
    : hits.length === 1
      ? hitKey(hits[0])
      : null;
  const selected = hits.find((hit) => hitKey(hit) === selectedKey) ?? null;
  const path = selected ? getTraceabilityPath(selected.kind, selected.id) : null;

  const choose = (hit: TraceabilityHit) => {
    setPickedFor(submitted);
    setPickedKey(hitKey(hit));
  };

  return (
    <div className="section">
      <h3 className="section-title">Traceability</h3>
      <p className="report-section-desc">
        Look up a wash, distillation, blend, barrel, or bottling batch and follow where it came from
        and where it went, from wash through bottling. Each step shows when it was done and where.
      </p>
      <form
        className="traceability-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
          setPickedFor('');
          setPickedKey(null);
        }}
      >
        <input
          type="search"
          placeholder="Batch number, lot, or product…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Traceability search"
        />
        <button type="submit" className="btn btn-primary btn-sm">Search</button>
      </form>
      {submitted.length >= 2 && hits.length === 0 && (
        <div className="empty-state">
          <p>No matches for “{submitted}”.</p>
        </div>
      )}
      {hits.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((hit) => {
                const selectedHit = hitKey(hit) === selectedKey;
                return (
                  <tr key={hitKey(hit)} className={selectedHit ? 'trace-hit selected' : 'trace-hit'}>
                    <td>{hit.domain}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-pressed={selectedHit}
                        onClick={() => choose(hit)}
                      >
                        {hit.batch_or_ref}
                      </button>
                    </td>
                    <td>{formatRecordedAt(hit.date)}</td>
                    <td>{hit.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hits.length > 1 && !selected && (
        <p className="field-hint">Select a batch to see its path from wash to bottling.</p>
      )}
      {path && (
        <div className="trace-path">
          <h4 className="trace-path-title">{path.title}</h4>
          <p className="report-section-desc">
            Where this record came from, and each place it was handled through bottling.
          </p>
          {path.steps.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Batch</th>
                    <th>When</th>
                    <th>Where</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {path.steps.map((step) => (
                    <tr key={step.key}>
                      <td>{step.stage}</td>
                      <td><strong>{step.reference}</strong></td>
                      <td>{formatRecordedAt(step.when)}</td>
                      <td>{step.where}</td>
                      <td>{step.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {path.gaps.length > 0 && (
            <ul className="trace-gaps">
              {path.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
