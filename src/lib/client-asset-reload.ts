const STALE_CLIENT_RELOAD_KEY = 'csc-distillery-stale-client-reload';

export function isStaleClientChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/** After a deploy, cached tabs may reference removed /assets/* chunks — reload once. */
export function reloadForFreshClientAssets(): void {
  if (sessionStorage.getItem(STALE_CLIENT_RELOAD_KEY) === '1') return;
  sessionStorage.setItem(STALE_CLIENT_RELOAD_KEY, '1');
  window.location.reload();
}
