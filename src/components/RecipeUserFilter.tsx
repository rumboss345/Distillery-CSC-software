import { useMemo, useState } from 'react';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import {
  ALL_EMPLOYEES_KEY,
  employeeFromAccount,
  filterRowsByPerson,
  mergeReportEmployees,
  type ReportEmployee,
} from '../lib/reporting/person';

export interface RecipeAssigneeFields {
  assigned_user_id: number | null;
  assigned_user_name: string | null;
}

export function useRecipeUserFilter<T extends RecipeAssigneeFields>(recipes: readonly T[]) {
  const { users } = useAssignableUsers();
  const [employeeKey, setEmployeeKey] = useState(ALL_EMPLOYEES_KEY);

  const employees = useMemo(
    () => mergeReportEmployees(
      users.map(employeeFromAccount),
      recipes.map((recipe) => recipe.assigned_user_name ?? ''),
    ),
    [users, recipes],
  );

  const selectedEmployee: ReportEmployee | null = employeeKey
    ? employees.find((employee) => employee.key === employeeKey) ?? null
    : null;

  const filtered = useMemo(
    () => filterRowsByPerson(
      recipes,
      (recipe) => recipe.assigned_user_name,
      selectedEmployee,
      (recipe) => recipe.assigned_user_id,
    ),
    [recipes, selectedEmployee],
  );

  return { employeeKey, setEmployeeKey, employees, filtered, selectedEmployee };
}

export function RecipeUserFilter({
  employeeKey,
  employees,
  onChange,
  id = 'recipe-user-filter',
}: {
  employeeKey: string;
  employees: ReportEmployee[];
  onChange: (key: string) => void;
  id?: string;
}) {
  if (employees.length === 0) return null;
  return (
    <div className="form-group recipe-user-filter">
      <label htmlFor={id}>Employee</label>
      <select
        id={id}
        value={employeeKey}
        onChange={(event) => onChange(event.target.value)}
        data-testid="recipe-user-filter"
      >
        <option value={ALL_EMPLOYEES_KEY}>All employees</option>
        {employees.map((employee) => (
          <option key={employee.key} value={employee.key}>
            {employee.label}
          </option>
        ))}
      </select>
    </div>
  );
}
