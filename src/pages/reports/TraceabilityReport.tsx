import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { searchTraceability } from '../../lib/reporting/traceability';

export function TraceabilityReport() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const hits = submitted.length >= 2 ? searchTraceability(submitted) : [];

  return (
    <div className="section">
      <h3 className="section-title">Traceability lookup</h3>
      <p className="report-section-desc">
        Search wash, distillation, blend, bottling, and barrel records by batch number, lot, product name, or ID.
      </p>
      <form
        className="traceability-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
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
              {hits.map((h) => (
                <tr key={`${h.domain}-${h.id}`}>
                  <td>{h.domain}</td>
                  <td><strong>{h.batch_or_ref}</strong></td>
                  <td>{format(parseISO(h.date.slice(0, 10)), 'MMM d, yyyy')}</td>
                  <td>{h.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
