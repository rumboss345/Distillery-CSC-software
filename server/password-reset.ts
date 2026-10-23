import { createHash, randomBytes } from 'crypto';

const RESET_TTL_MS = 60 * 60 * 1000;

export function newResetToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpired(expiresAt: string): boolean {
  const expires = Date.parse(expiresAt);
  return !Number.isFinite(expires) || expires <= Date.now();
}
