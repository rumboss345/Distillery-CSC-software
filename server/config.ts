import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

export const isProduction = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT ?? process.env.AUTH_PORT ?? 3001);
export const HOST = isProduction ? '0.0.0.0' : undefined;
export const JWT_SECRET = process.env.JWT_SECRET ?? 'distillery-tracker-dev-secret-change-in-production';
export const APP_URL = process.env.APP_URL ?? (isProduction ? undefined : 'http://localhost:5173');
export const DATABASE_URL = process.env.DATABASE_URL ?? '';

export function requireDatabaseUrl(): string {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured. Add a PostgreSQL connection string (Render Postgres or local docker-compose).',
    );
  }
  return DATABASE_URL;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(DATABASE_URL);
}
