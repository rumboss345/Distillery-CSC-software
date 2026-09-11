import { useEffect, useState } from 'react';
import {
  exportBrowserDatabaseBase64,
  fetchMigrationHistory,
  fetchProductionStatus,
  importBrowserMigration,
  previewBrowserMigration,
  type ImportPreviewResponse,
  type ProductionStatus,
} from '../lib/production-api';

function downloadBase64File(base64: string, filename: string) {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([binary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataMigration() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const [nextStatus, nextHistory] = await Promise.all([
        fetchProductionStatus(),
        fetchMigrationHistory(),
      ]);
      setStatus(nextStatus);
      setHistory(nextHistory.imports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load migration status');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleBackup = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadBase64File(exportBrowserDatabaseBase64(), `csc-browser-db-backup-${stamp}.db`);
    setMessage('Browser database backup downloaded.');
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await previewBrowserMigration();
      setPreview(result);
      setReplaceExisting(false);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!preview) {
      setError('Run preview before importing.');
      return;
    }
    if (preview.serverHasExistingData && !replaceExisting) {
      setError('Server already has data. Check "Replace existing server data" to continue.');
      return;
    }
    if (!confirm(
      preview.serverHasExistingData
        ? 'This will REPLACE all server production data with your browser export. Continue?'
        : 'Import browser production data into the central server database?',
    )) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const backup = exportBrowserDatabaseBase64();
      downloadBase64File(backup, `csc-pre-import-backup-${Date.now()}.db`);
      const result = await importBrowserMigration({
        replaceExisting: preview.serverHasExistingData,
        sourceLabel: 'browser_localStorage',
        backupBase64: backup,
      });
      setMessage(result.message);
      setPreview(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Production Database Migration</h2>
        <p>
          Move browser-local production data into the central PostgreSQL database.
          Existing batch numbers and IDs are preserved during import.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-info">{message}</div>}

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Server Status</h4>
        {!status ? (
          <p>Loading…</p>
        ) : (
          <dl className="floor-detail-list">
            <dt>Database configured</dt>
            <dd>{status.databaseConfigured ? 'Yes' : 'No — set DATABASE_URL'}</dd>
            <dt>Database connected</dt>
            <dd>{status.databaseConnected ? 'Yes' : 'No'}</dd>
            <dt>Authoritative source</dt>
            <dd>{status.authoritativeSource === 'server' ? 'Central server database' : 'Browser localStorage (legacy)'}</dd>
            <dt>Canonical liquid unit</dt>
            <dd>{status.canonicalLiquidUnit} (ABV stored as 0–100%)</dd>
            <dt>Last import</dt>
            <dd>
              {status.importMetadata.lastImportAt
                ? `${status.importMetadata.lastImportAt} by ${status.importMetadata.lastImportedByEmail ?? 'unknown'}`
                : 'None'}
            </dd>
          </dl>
        )}
      </div>

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Migration Workflow</h4>
        <ol style={{ marginBottom: '1rem', paddingLeft: '1.25rem', color: 'var(--text-muted)' }}>
          <li>Download a backup of the current browser database.</li>
          <li>Preview record counts from this browser.</li>
          <li>Import into the server (requires confirmation; never automatic).</li>
          <li>Validate counts on the server after import.</li>
        </ol>
        <p className="form-hint" style={{ marginBottom: '1rem' }}>
          If multiple browsers have different data, migrate one at a time. Do not silently merge conflicting databases.
        </p>
        <div className="page-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-secondary" onClick={handleBackup}>Download Browser Backup</button>
          <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={busy}>Preview Import</button>
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={busy || !preview}>Import to Server</button>
        </div>
        {preview && (
          <div style={{ marginTop: '1rem' }}>
            <h5>Preview — {preview.preview.sourceLabel}</h5>
            {preview.preview.warnings.length > 0 && (
              <ul>{preview.preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Table</th><th>Records in browser export</th></tr></thead>
                <tbody>
                  {Object.entries(preview.preview.tables).map(([table, count]) => (
                    <tr key={table}><td>{table}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.serverHasExistingData && (
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                Replace existing server production data (requires explicit confirmation)
              </label>
            )}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="detail-panel">
          <h4>Import History</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Source</th><th>By</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.id)}</td>
                    <td>{String(row.source_label ?? '')}</td>
                    <td>{String(row.imported_by_email ?? '')}</td>
                    <td>{String(row.status ?? '')}</td>
                    <td>{String(row.created_at ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
