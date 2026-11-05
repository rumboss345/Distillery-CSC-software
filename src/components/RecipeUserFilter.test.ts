import { describe, expect, it } from 'vitest';
import { filterRowsByPerson, reportEmployeeKey } from '../lib/reporting/person';
import type { RecipeAssigneeFields } from './RecipeUserFilter';

describe('recipe user filter', () => {
  const rows: Array<RecipeAssigneeFields & { name: string }> = [
    { name: 'A', assigned_user_id: 1, assigned_user_name: 'Ada Lovelace' },
    { name: 'B', assigned_user_id: 2, assigned_user_name: 'Sam Chen' },
    { name: 'C', assigned_user_id: null, assigned_user_name: null },
  ];

  it('filters by assigned user id and name', () => {
    const ada = {
      id: 1,
      key: reportEmployeeKey(1),
      label: 'Ada Lovelace',
      aliases: ['ada lovelace'],
    };
    const filtered = filterRowsByPerson(
      rows,
      (row) => row.assigned_user_name,
      ada,
      (row) => row.assigned_user_id,
    );
    expect(filtered.map((row) => row.name)).toEqual(['A']);
  });
});
