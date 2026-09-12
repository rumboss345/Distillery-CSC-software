import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { resetAdminAccount } from './db/auth.js';
import { initializeServerDatastores } from './startup.js';

function loadEnvFile() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
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

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
  process.exit(1);
}

await initializeServerDatastores();
await resetAdminAccount(email, password);
console.log(`Admin account reset for ${email.toLowerCase()}`);
