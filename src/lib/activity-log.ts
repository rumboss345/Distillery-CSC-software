import type { ActionAssignmentKey } from './permissions';

export async function logUserAction(actionKey: ActionAssignmentKey, description: string): Promise<void> {
  try {
    const token = localStorage.getItem('distillery-tracker-auth-token');
    if (!token) return;
    await fetch('/api/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action_key: actionKey, description }),
    });
  } catch {
    // Activity logging is best-effort; do not block the UI.
  }
}
