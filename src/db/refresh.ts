let sharedNotice: string | null = null;
const noticeListeners = new Set<() => void>();
const refreshListeners = new Set<() => void>();

export function subscribeSharedNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

export function getSharedNotice(): string | null {
  return sharedNotice;
}

export function setSharedNotice(message: string | null): void {
  if (sharedNotice === message) return;
  sharedNotice = message;
  noticeListeners.forEach((listener) => listener());
}

export function dismissSharedNotice(): void {
  setSharedNotice(null);
}

export function subscribeSharedRefresh(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

export function notifySharedRefresh(): void {
  refreshListeners.forEach((listener) => listener());
}
