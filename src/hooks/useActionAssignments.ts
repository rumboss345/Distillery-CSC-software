import { useEffect, useState } from 'react';
import { fetchActionAssignments, type AssignmentEntry } from '../lib/auth-api';

let cached: Record<string, AssignmentEntry[]> | null = null;

export function useActionAssignments(refreshKey = 0) {
  const [assignments, setAssignments] = useState<Record<string, AssignmentEntry[]>>(cached ?? {});

  useEffect(() => {
    fetchActionAssignments()
      .then(({ assignments: next }) => {
        cached = next;
        setAssignments(next);
      })
      .catch(() => setAssignments({}));
  }, [refreshKey]);

  return assignments;
}

export function invalidateActionAssignmentsCache() {
  cached = null;
}
