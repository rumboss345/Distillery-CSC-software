import { describe, expect, it } from 'vitest';
import {
  OWNER_CREATE_ERROR,
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
