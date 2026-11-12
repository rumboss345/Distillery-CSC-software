/** Short-lived administrator approval for staff production actions; kept in memory only. */
interface StoredApproval {
  token: string;
  actions: string[];
  expiresAt: number;
}

let approval: StoredApproval | null = null;

/** Expire a little early so a token is not sent just as the server stops accepting it. */
const EXPIRY_MARGIN_MS = 15_000;

export function setAdminApproval(token: string, actions: string[], expiresInSeconds: number, now = Date.now()): void {
  approval = { token, actions, expiresAt: now + expiresInSeconds * 1000 - EXPIRY_MARGIN_MS };
}

export function adminApprovalFor(action: string, now = Date.now()): string | null {
  if (!approval) return null;
  if (now >= approval.expiresAt) {
    approval = null;
    return null;
  }
  return approval.actions.includes(action) ? approval.token : null;
}

export function clearAdminApproval(): void {
  approval = null;
}
