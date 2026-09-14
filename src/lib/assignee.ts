import type { AuthUser } from './auth-api';
import type { AssignableUser } from './auth-api';

export interface AssignedEmployee {
  assigned_user_id: number | null;
  assigned_user_name: string | null;
}

export function formatAssigneeLabel(name: string | null | undefined, email?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (email) return email;
  return '—';
}

export function assigneeFromUser(user: Pick<AuthUser, 'id' | 'name' | 'email'>): AssignedEmployee {
  return {
    assigned_user_id: user.id,
    assigned_user_name: user.name?.trim() || user.email,
  };
}

export function defaultAssignee(user: AuthUser | null): AssignedEmployee {
  if (!user) {
    return { assigned_user_id: null, assigned_user_name: null };
  }
  return assigneeFromUser(user);
}

export function resolveAssigneeOnChange(
  userId: number | null,
  users: AssignableUser[],
): AssignedEmployee {
  if (!userId) {
    return { assigned_user_id: null, assigned_user_name: null };
  }
  const match = users.find((user) => user.id === userId);
  return {
    assigned_user_id: userId,
    assigned_user_name: match ? formatAssigneeLabel(match.name, match.email) : null,
  };
}
