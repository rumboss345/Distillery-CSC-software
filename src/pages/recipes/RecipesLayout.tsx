import { Outlet } from 'react-router-dom';

export function RecipesLayout() {
  return (
    <div>
      <div className="page-header">
        <h2>Recipes & Formulas</h2>
        <p>Production specifications and version-controlled formulas (templates only — no inventory consumption)</p>
      </div>
      <Outlet />
    </div>
  );
}
