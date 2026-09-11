import { useEffect, useState } from 'react';
import {
  activateCentralDatabase,
  exportBrowserDatabaseBase64,
  fetchMigrationHistory,
  fetchProductionStatus,
  importBrowserMigration,
  previewBrowserMigration,
  validateBrowserMigration,
  type ImportPreviewResponse,
  type ProductionStatus,
  type ValidationReport,
} from '../lib/production-api';

const REPLACE_PHRASE = 'REPLACE SERVER DATA';

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

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ValidationTable({ report }: { report: ValidationReport }) {
  const allRows = [...report.rows, ...report.batchNumbers];
  return (
    <div className="table-wrap" style={{ marginTop: '1rem' }}>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Browser</th>
            <th>Server</th>
            <th>Difference</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.browser}</td>
              <td>{row.server}</td>
              <td>{row.difference}</td>
              <td className={row.status === 'PASS' ? 'text-success' : 'text-danger'}>
                {row.status}
              </td>
            </tr>
          ))}
          {report.tankBalances.map((t) => (
            <tr key={`tank-${t.tankId}`}>
              <td>{t.tankName} calculated volume (L)</td>
              <td>{t.browserVolumeLitres.toFixed(1)}</td>
              <td>{t.serverVolumeLitres.toFixed(1)}</td>
              <td>{(t.serverVolumeLitres - t.browserVolumeLitres).toFixed(1)}</td>
              <td className={t.status === 'PASS' ? 'text-success' : 'text-danger'}>
                {t.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>
        Overall: {report.passed ? 'PASS — ready for cutover review' : 'FAIL — resolve discrepancies before cutover'}
      </p>
    </div>
  );
}

export function DataMigration() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [externalBackupAcknowledged, setExternalBackupAcknowledged] = useState(false);
  const [replacePhrase, setReplacePhrase] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

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
    setExternalBackupAcknowledged(true);
    setMessage('Browser database backup downloaded. Keep this file outside PostgreSQL — it is required for disaster recovery.');
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await previewBrowserMigration();
      setPreview(result);
      setReplacePhrase('');
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
    if (!externalBackupAcknowledged) {
      setError('Download an external browser backup file before importing. PostgreSQL-stored backups are audit convenience only, not disaster recovery.');
      return;
    }
    if (preview.serverHasExistingData && replacePhrase !== REPLACE_PHRASE) {
      setError(`Server already has data. Type "${REPLACE_PHRASE}" exactly to confirm replacement.`);
      return;
    }
    if (preview.serverHasExistingData) {
      if (!confirm(
        'WARNING: This will permanently REPLACE all server production data. Ensure you have a PostgreSQL/Render backup and your external browser backup before continuing.',
      )) {
        return;
      }
    } else if (!confirm('Import browser production data into the central PostgreSQL database? Browser remains authoritative until cutover.')) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const backup = exportBrowserDatabaseBase64();
      const result = await importBrowserMigration({
        replaceExisting: preview.serverHasExistingData,
        replaceConfirmationPhrase: preview.serverHasExistingData ? replacePhrase : undefined,
        sourceLabel: 'browser_localStorage',
        backupBase64: backup,
        externalBackupAcknowledged: true,
      });
      setValidationReport(result.validationReport);
      setMessage(result.message);
      setPreview(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await validateBrowserMigration();
      setValidationReport(result.report);
      downloadJson(result.report, `csc-migration-validation-${Date.now()}.json`);
      setMessage(`${result.message} Validation report downloaded.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async () => {
    if (!status?.canActivateCentralDatabase) {
      setError(status?.activateBlockedReason ?? 'Cutover is not available yet.');
      return;
    }
    if (!validationReport?.passed && !overrideReason.trim()) {
      setError('Validation must pass, or provide an administrator override reason.');
      return;
    }
    if (!confirm(
      'Activate Central Database?\n\n'
      + '• Browser production writes will be DISABLED\n'
      + '• PostgreSQL becomes the authoritative production database\n'
      + '• This action is logged and cannot be undone without administrator intervention\n\n'
      + 'Continue?',
    )) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await activateCentralDatabase({
        confirm: true,
        override: !validationReport?.passed,
        overrideReason: validationReport?.passed ? undefined : overrideReason,
      });
      setMessage(result.message);
      if (result.reloadRequired) {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setBusy(false);
    }
  };

  const migrationState = status?.migrationState ?? 'LOCAL_ONLY';

  return (
    <div>
      <div className="page-header">
        <h2>Production Database Migration</h2>
        <p>
          Import browser-local production data into central PostgreSQL.
          Import and cutover are separate operations — the browser database remains authoritative until an administrator activates the central database.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-info">{message}</div>}

      {(migrationState === 'MIGRATION_IMPORTED' || migrationState === 'SERVER_READ_ONLY_VALIDATION') && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Central database imported but production screens are still operating from the browser database. Server cutover has NOT occurred.</strong>
        </div>
      )}

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Server Status</h4>
        {!status ? (
          <p>Loading…</p>
        ) : (
          <dl className="floor-detail-list">
            <dt>Migration state</dt>
            <dd><strong>{status.migrationState}</strong></dd>
            <dt>Status</dt>
            <dd>{status.statusMessage}</dd>
            <dt>Database configured</dt>
            <dd>{status.databaseConfigured ? 'Yes' : 'No — set DATABASE_URL'}</dd>
            <dt>Database connected</dt>
            <dd>{status.databaseConnected ? 'Yes' : 'No'}</dd>
            <dt>Authoritative write path</dt>
            <dd>{status.serverAuthoritative ? 'Central PostgreSQL (server API)' : 'Browser localStorage'}</dd>
            <dt>Server API cutover ready</dt>
            <dd>{status.serverApiCutoverReady ? 'Yes' : 'No — Step 1A required'}</dd>
            <dt>Canonical liquid unit</dt>
            <dd>{status.canonicalLiquidUnit} (ABV 0–100%)</dd>
            <dt>Last import</dt>
            <dd>
              {status.importMetadata.lastImportAt
                ? `#${status.importMetadata.lastImportRunId} — ${status.importMetadata.lastImportAt} by ${status.importMetadata.lastImportedByEmail ?? 'unknown'}`
                : 'None'}
            </dd>
          </dl>
        )}
      </div>

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Backup Requirements</h4>
        <p className="form-hint">
          Before importing, you must download and keep a separate browser SQLite backup file (A).
          After validation, download the validation report (B).
          Configure PostgreSQL/Render automated backups (C) before production cutover.
          Storing a copy inside PostgreSQL (<code>data_import_runs.backup_blob</code>) is an audit convenience only — not disaster recovery.
        </p>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={externalBackupAcknowledged}
            onChange={(e) => setExternalBackupAcknowledged(e.target.checked)}
          />
          I have downloaded an external browser backup file and stored it outside PostgreSQL
        </label>
      </div>

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Step 1 — Import Workflow</h4>
        <ol style={{ marginBottom: '1rem', paddingLeft: '1.25rem', color: 'var(--text-muted)' }}>
          <li>Download external browser backup (required).</li>
          <li>Preview record counts (does not alter production tables).</li>
          <li>Import into PostgreSQL (all-or-nothing transaction).</li>
          <li>Run validation comparison (browser vs server).</li>
        </ol>
        <div className="page-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handleBackup}>Download Browser Backup</button>
          <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={busy}>Preview Import</button>
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={busy || !preview || !externalBackupAcknowledged}>
            Import to Server
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleValidate} disabled={busy}>
            Run Validation
          </button>
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
              <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <p className="alert alert-danger" style={{ marginBottom: '0.75rem' }}>
                  <strong>Server production data already exists.</strong> Replacement requires administrator confirmation and destroys existing server data.
                  Take a PostgreSQL/Render backup before proceeding.
                </p>
                <label>
                  Type <strong>{REPLACE_PHRASE}</strong> to confirm replacement:
                  <input
                    type="text"
                    className="form-control"
                    value={replacePhrase}
                    onChange={(e) => setReplacePhrase(e.target.value)}
                    placeholder={REPLACE_PHRASE}
                    style={{ marginTop: '0.5rem' }}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {validationReport && (
        <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
          <h4>Validation Report</h4>
          <ValidationTable report={validationReport} />
        </div>
      )}

      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h4>Step 2 — Activate Central Database (Cutover)</h4>
        <p className="form-hint">
          Cutover is a separate administrator action. Import alone does not switch authority.
          Activation requires Step 1A production API writes to be complete.
        </p>
        {status && !status.canActivateCentralDatabase && status.activateBlockedReason && (
          <div className="alert alert-info">{status.activateBlockedReason}</div>
        )}
        {validationReport && !validationReport.passed && (
          <div style={{ marginTop: '1rem' }}>
            <label>
              Administrator override reason (required when validation fails):
              <textarea
                className="form-control"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                style={{ marginTop: '0.5rem' }}
              />
            </label>
          </div>
        )}
        <button
          type="button"
          className="btn btn-danger"
          style={{ marginTop: '1rem' }}
          onClick={handleActivate}
          disabled={busy || !status?.canActivateCentralDatabase}
        >
          Activate Central Database
        </button>
      </div>

      {history.length > 0 && (
        <div className="detail-panel">
          <h4>Import History (metadata only)</h4>
          <p className="form-hint">Backup payloads are not loaded in this view.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source</th>
                  <th>By</th>
                  <th>Status</th>
                  <th>Backup size</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.id)}</td>
                    <td>{String(row.source_label ?? '')}</td>
                    <td>{String(row.imported_by_email ?? '')}</td>
                    <td>{String(row.status ?? '')}</td>
                    <td>{row.backup_size_bytes ? `${Math.round(Number(row.backup_size_bytes) / 1024)} KB` : '—'}</td>
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
