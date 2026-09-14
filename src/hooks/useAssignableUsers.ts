import { useEffect, useState } from 'react';
import { fetchAssignableUsers, type AssignableUser } from '../lib/auth-api';

let cachedUsers: AssignableUser[] | null = null;
let cachePromise: Promise<AssignableUser[]> | null = null;

async function loadAssignableUsers(): Promise<AssignableUser[]> {
  if (cachedUsers) return cachedUsers;
  if (!cachePromise) {
    cachePromise = fetchAssignableUsers()
      .then(({ users }) => {
        cachedUsers = users;
        return users;
      })
      .catch(() => {
        cachePromise = null;
        return [];
      });
  }
  return cachePromise;
}

export function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(!cachedUsers);

  useEffect(() => {
    let active = true;
    loadAssignableUsers().then((loaded) => {
      if (active) {
        setUsers(loaded);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { users, loading };
}

export function invalidateAssignableUsersCache() {
  cachedUsers = null;
  cachePromise = null;
}
