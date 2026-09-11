import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { refreshProductionMode } from '../db/production-mode';
import { setSqlJsLegacyOnly, shouldUseServerApi } from './data-adapter';
import { bootstrapErpCache } from './server-api-adapter';
import { invalidateErpCache } from './server-cache';
import { hydrateErpTablesFromServerCache, clearHydrationState } from './server-cache-hydrator';
import { getDb, initDatabase } from '../db/database';
import { isPostgresAuthoritativeMode } from '../db/production-mode';

interface ErpDataContextValue {
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ErpDataContext = createContext<ErpDataContextValue | null>(null);

export function ErpDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReady(false);
    setError(null);

    try {
      await refreshProductionMode().catch(() => null);
      if (shouldUseServerApi()) {
        setSqlJsLegacyOnly(true);
        await initDatabase();
        await bootstrapErpCache();
        if (isPostgresAuthoritativeMode()) {
          hydrateErpTablesFromServerCache(getDb());
        }
      }
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ERP data');
      setReady(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    invalidateErpCache();
    clearHydrationState();
    await load();
  }, [load]);

  const value = useMemo(
    () => ({ ready, error, refresh }),
    [ready, error, refresh],
  );

  return <ErpDataContext.Provider value={value}>{children}</ErpDataContext.Provider>;
}

export function useErpData(): ErpDataContextValue {
  const ctx = useContext(ErpDataContext);
  if (!ctx) {
    throw new Error('useErpData must be used within ErpDataProvider');
  }
  return ctx;
}
