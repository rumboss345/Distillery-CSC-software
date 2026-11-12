import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OWNER_CREATE_ERROR,
  OWNER_RESET_DATA_ERROR,
  isAdminRole,
  isOwnerRole,
  isReservedAuthEmail,
  isSiteOwnerEmail,
  parseCreatedRole,
  reservedAuthEmails,
  roleLabel,
  siteOwnerEmail,
} from './roles';

describe('owner role', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it('uses OWNER_EMAIL when set, otherwise ADMIN_EMAIL', () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@csc.test');
    expect(siteOwnerEmail()).toBe('admin@csc.test');
    vi.stubEnv('OWNER_EMAIL', 'owner@csc.test');
    expect(siteOwnerEmail()).toBe('owner@csc.test');
    expect(isSiteOwnerEmail('owner@csc.test')).toBe(true);
    expect(isSiteOwnerEmail('admin@csc.test')).toBe(false);
  });

  it('does not assume a hardcoded owner when env is unset', () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    vi.stubEnv('OWNER_EMAIL', '');
    expect(siteOwnerEmail()).toBe('');
    expect(isSiteOwnerEmail('nelson@rum.ky')).toBe(false);
  });

  it('blocks self-registration for configured admin and owner emails', () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@csc.test');
    vi.stubEnv('OWNER_EMAIL', 'owner@csc.test');
    expect(reservedAuthEmails().sort()).toEqual(['admin@csc.test', 'owner@csc.test']);
    expect(isReservedAuthEmail('Admin@csc.test')).toBe(true);
    expect(isReservedAuthEmail('staff@csc.test')).toBe(false);
  });
});
