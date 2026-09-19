import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createUserByAdmin, getUserByEmail, initializeAuthDatabase } from './db.js';
import { DEFAULT_USER_PERMISSIONS } from './permissions.js';

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
initializeAuthDatabase();

const [email, password, name = ''] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: tsx server/create-user.ts <email> <password> [name]');
  process.exit(1);
}

if (getUserByEmail(email)) {
  console.error(`User already exists: ${email.toLowerCase()}`);
  process.exit(1);
}

const user = createUserByAdmin(
  email,
  password,
  name.trim() || null,
  DEFAULT_USER_PERMISSIONS,
  [],
);

console.log(`User created: ${user.email} (${user.name ?? 'no name'}) — approved with default permissions`);
