import { describe, expect, it } from 'vitest';
import { PRODUCTION_MUTATIONS, userMayMutate } from '../../db/production-catalog';
import { userHasPermission } from '../permissions';
import {
  dashboardViewForRole,
  hasFullProductionAccess,
  isStaffRole,
  parseCreatedRole,
  roleLabel,
} from '../roles';

describe('production manager role', () => {
  it('has every production page without picking permissions', () => {
    expect(hasFullProductionAccess('manager')).toBe(true);
    expect(userHasPermission('manager', [], 'bottling')).toBe(true);
    expect(userHasPermission('manager', [], 'reports')).toBe(true);
    expect(userHasPermission('user', ['wash'], 'bottling')).toBe(false);
  });

  it('can record production but not run administrator or owner actions', () => {
    expect(userMayMutate('manager', [], PRODUCTION_MUTATIONS.saveBottlingRun.access)).toBe(true);
    expect(userMayMutate('manager', [], 'admin')).toBe(false);
    expect(userMayMutate('manager', [], 'owner')).toBe(false);
    expect(userMayMutate('manager', [], PRODUCTION_MUTATIONS.saveDashboardThresholds.access)).toBe(false);
  });

  it('is a staff role that administrators can create', () => {
    expect(isStaffRole('manager')).toBe(true);
    expect(isStaffRole('admin')).toBe(false);
    expect(parseCreatedRole('manager', 'admin')).toBe('manager');
    expect(roleLabel('manager')).toBe('Production manager');
  });
});

describe('dashboard views', () => {
  it('gives owners and administrators the business view, managers the production view and staff their own work', () => {
    expect(dashboardViewForRole('owner')).toBe('owner');
    expect(dashboardViewForRole('admin')).toBe('owner');
    expect(dashboardViewForRole('manager')).toBe('manager');
    expect(dashboardViewForRole('user')).toBe('operator');
    expect(dashboardViewForRole(undefined)).toBe('operator');
  });
});
