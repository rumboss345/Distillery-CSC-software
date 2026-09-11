import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProductionStatus, type ProductionStatus } from '../lib/production-api';

export function ProductionDatabaseBanner() {
  const [status, setStatus] = useState<ProductionStatus | null>(null);

  useEffect(() => {
    fetchProductionStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  if (!status.databaseConfigured) {
    return (
      <div className="production-banner production-banner--warn">
        Central production database is not configured on the server (DATABASE_URL missing).
        Production data is still stored in this browser only.
      </div>
    );
  }

  if (!status.databaseConnected) {
    return (
      <div className="production-banner production-banner--error">
        Cannot reach the central production database. You can view cached browser data, but writes may fail until the database is available.
      </div>
    );
  }

  if (status.authoritativeSource === 'browser_local') {
    return (
      <div className="production-banner production-banner--info">
        Production data in this browser has not been migrated to the central database yet.
        {' '}<Link to="/admin/data-migration">Review migration</Link>
      </div>
    );
  }

  return null;
}
