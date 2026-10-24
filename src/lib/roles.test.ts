import { describe, expect, it } from 'vitest';
import {
  OWNER_CREATE_ERROR,
  OWNER_RESET_DATA_ERROR,
  isAdminRole,
  isOwnerRole,
  isSiteOwnerEmail,
  parseCreatedRole,
  roleLabel,
  siteOwnerEmail,
} from './roles';

describe('owner role', () => {
  it('treats owners as administrators for page access', () => {
    expect(isOwnerRole('owner')).toBe(true);
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('admin')).toBe('Administrator');
  });

  it('names clear-all-data and empty-tanks as owner-only', () => {
    expect(OWNER_RESET_DATA_ERROR).toMatch(/only an owner/i);
    expect(OWNER_RESET_DATA_ERROR).toMatch(/clear all data/i);
    expect(OWNER_RESET_DATA_ERROR).toMatch(/empty all tanks/i);
  });

  it('lets only an owner choose the owner role when creating a user', () => {
    expect(parseCreatedRole('owner', 'owner')).toBe('owner');
    expect(parseCreatedRole('admin', 'admin')).toBe('admin');
    expect(() => parseCreatedRole('owner', 'admin')).toThrow(OWNER_CREATE_ERROR);
  });

  it('names nelson@rum.ky as the site owner', () => {
    expect(siteOwnerEmail()).toBe('nelson@rum.ky');
    expect(isSiteOwnerEmail('Nelson@rum.ky')).toBe(true);
    expect(isSiteOwnerEmail('admin@example.com')).toBe(false);
  });
});
