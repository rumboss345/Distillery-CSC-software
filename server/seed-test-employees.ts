import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  createUserByAdmin,
  getUserByEmail,
  initializeAuthDatabase,
  updateUserByAdmin,
} from './db.js';
import {
  DEFAULT_USER_PERMISSIONS,
  type PermissionKey,
  type ProcessStageKey,
} from './permissions.js';

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

const DEFAULT_PASSWORD = process.env.TEST_EMPLOYEE_PASSWORD ?? 'TestEmployee1!';

export interface TestEmployeeProfile {
  email: string;
  name: string;
  permissions: PermissionKey[];
  processAssignments: ProcessStageKey[];
}

/** Approved employee accounts for local / staging assignee dropdowns and login tests. */
export const TEST_EMPLOYEE_PROFILES: TestEmployeeProfile[] = [
  {
    email: 'maria.santos@csc.test',
    name: 'Maria Santos',
    permissions: DEFAULT_USER_PERMISSIONS,
    processAssignments: ['preparation', 'fermentation'],
  },
  {
    email: 'james.cobb@csc.test',
    name: 'James Cobb',
    permissions: DEFAULT_USER_PERMISSIONS,
    processAssignments: ['distillation'],
  },
  {
    email: 'elena.park@csc.test',
    name: 'Elena Park',
    permissions: DEFAULT_USER_PERMISSIONS,
    processAssignments: ['storage', 'other'],
  },
  {
    email: 'chris.dalton@csc.test',
    name: 'Chris Dalton',
    permissions: DEFAULT_USER_PERMISSIONS,
    processAssignments: ['preparation', 'fermentation', 'distillation', 'storage', 'other'],
  },
];

export function seedTestEmployees(password = DEFAULT_PASSWORD): void {
  for (const profile of TEST_EMPLOYEE_PROFILES) {
    const existing = getUserByEmail(profile.email);
    if (existing) {
      updateUserByAdmin(existing.id, {
        name: profile.name,
        permissions: profile.permissions,
        processAssignments: profile.processAssignments,
      });
      console.log(`Updated test employee: ${profile.name} <${profile.email}>`);
      continue;
    }
    createUserByAdmin(
      profile.email,
      password,
      profile.name,
      profile.permissions,
      profile.processAssignments,
    );
    console.log(`Created test employee: ${profile.name} <${profile.email}>`);
  }
}

if (process.argv[1]?.endsWith('seed-test-employees.ts')) {
  seedTestEmployees();
  console.log('');
  console.log('All test employees use password:', DEFAULT_PASSWORD);
  console.log('(override with TEST_EMPLOYEE_PASSWORD in .env)');
}
