import { describe, expect, it } from 'vitest';
import {
  assigneeFromUser,
  defaultAssignee,
  formatAssigneeLabel,
  resolveAssigneeOnChange,
} from './assignee';

describe('assignee', () => {
  it('formats assignee labels', () => {
    expect(formatAssigneeLabel('Jane Doe')).toBe('Jane Doe');
    expect(formatAssigneeLabel(null, 'jane@example.com')).toBe('jane@example.com');
    expect(formatAssigneeLabel(null)).toBe('—');
  });

  it('builds assignee from auth user', () => {
    expect(assigneeFromUser({ id: 3, name: 'Alex', email: 'alex@test.com' })).toEqual({
      assigned_user_id: 3,
      assigned_user_name: 'Alex',
    });
    expect(assigneeFromUser({ id: 3, name: null, email: 'alex@test.com' })).toEqual({
      assigned_user_id: 3,
      assigned_user_name: 'alex@test.com',
    });
  });

  it('defaults to null when no user is logged in', () => {
    expect(defaultAssignee(null)).toEqual({
      assigned_user_id: null,
      assigned_user_name: null,
    });
  });

  it('resolves assignee on dropdown change', () => {
    const users = [{ id: 2, name: 'Sam', email: 'sam@test.com' }];
    expect(resolveAssigneeOnChange(2, users)).toEqual({
      assigned_user_id: 2,
      assigned_user_name: 'Sam',
    });
    expect(resolveAssigneeOnChange(null, users)).toEqual({
      assigned_user_id: null,
      assigned_user_name: null,
    });
  });
});
