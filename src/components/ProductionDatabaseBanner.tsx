import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProductionStatus, type ProductionStatus } from '../lib/production-api';
import { setCachedProductionStatus } from '../db/production-mode';

export function ProductionDatabaseBanner() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    fetchProductionStatus()
      .then((s) => {
        setCachedProductionStatus(s);
        setStatus(s);
        setFetchFailed(false);
      })
      .catch(() => {
        setFetchFailed(true);
        setStatus(null);
      });
  }, []);

  if (fetchFailed) {
    return (
      <div className="production-banner production-banner--error">
        Cannot reach the central production database or server API.
        If cutover has occurred, production changes cannot be recorded until service is restored.
      </div>
    );
  }

  if (!status) return null;

  if (!status.databaseConfigured) {
    return (
      <div className="production-banner production-banner--warn">
        Central production database is not configured on the server (DATABASE_URL missing).
        Production data is stored in this browser only.
      </div>
    );
  }

  if (!status.databaseConnected) {
    return (
      <div className="production-banner production-banner--error">
        {status.serverAuthoritative
          ? 'Central production database unavailable. Changes cannot be recorded.'
          : 'Cannot reach the central production database. Browser database remains authoritative for production writes.'}
      </div>
    );
  }

  if (status.migrationState === 'MIGRATION_IMPORTED' || status.migrationState === 'SERVER_READ_ONLY_VALIDATION') {
    return (
      <div className="production-banner production-banner--warn">
        <strong>{status.statusMessage}</strong>
        {' '}<Link to="/admin/data-migration">Review migration &amp; validation</Link>
      </div>
    );
  }

  if (status.migrationState === 'MIGRATION_READY') {
    return (
      <div className="production-banner production-banner--info">
        {status.statusMessage}
        {' '}<Link to="/admin/data-migration">Review migration</Link>
      </div>
    );
  }

  if (status.migrationState === 'LOCAL_ONLY') {
    return (
      <div className="production-banner production-banner--info">
        {status.statusMessage}
      </div>
    );
  }

  if (status.serverAuthoritative) {
    return (
      <div className="production-banner production-banner--info">
        {status.statusMessage}
      </div>
    );
  }

  return null;
}
