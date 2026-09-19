import { describe, expect, it } from 'vitest';
import { TEST_EMPLOYEE_PROFILES } from './seed-test-employees.js';

describe('TEST_EMPLOYEE_PROFILES', () => {
  it('defines four unique test employees', () => {
    expect(TEST_EMPLOYEE_PROFILES).toHaveLength(4);
    const emails = TEST_EMPLOYEE_PROFILES.map((p) => p.email);
    expect(new Set(emails).size).toBe(4);
    for (const profile of TEST_EMPLOYEE_PROFILES) {
      expect(profile.name.trim().length).toBeGreaterThan(0);
      expect(profile.permissions.length).toBeGreaterThan(0);
    }
  });
});
