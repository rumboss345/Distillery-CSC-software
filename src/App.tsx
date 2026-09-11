import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { MashFermentation } from './pages/MashFermentation';
import { Distillation } from './pages/Distillation';
import { Barrels } from './pages/Barrels';
import { Bottling } from './pages/Bottling';
import { Blending } from './pages/Blending';
import { Inventory } from './pages/Inventory';
import { Reports } from './pages/Reports';
import { FloorPlanPage } from './pages/FloorPlan';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ApproveUser } from './pages/ApproveUser';
import { AdminUsers } from './pages/AdminUsers';
import { DataMigration } from './pages/DataMigration';
import { AdminRoute } from './components/AdminRoute';
import { MasterDataLayout } from './pages/master-data/MasterDataLayout';
import { ProductsPage } from './pages/master-data/ProductsPage';
import { SkusPage } from './pages/master-data/SkusPage';
import { MaterialsPage } from './pages/master-data/MaterialsPage';
import { BulkSpiritsPage } from './pages/master-data/BulkSpiritsPage';
import { SuppliersPage } from './pages/master-data/SuppliersPage';
import { LocationsPage } from './pages/master-data/LocationsPage';
import { RecipesLayout } from './pages/recipes/RecipesLayout';
import { RecipesPage } from './pages/recipes/RecipesPage';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage';
import { useDatabaseReady } from './db/queries';

function AppContent() {
  const { ready, error } = useDatabaseReady();

  if (error) {
    return (
      <div className="loading-screen">
        <p>Failed to load database: {error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading distillery database...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/approve" element={<ApproveUser />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wash" element={<MashFermentation />} />
            <Route path="/mash" element={<Navigate to="/wash" replace />} />
            <Route path="/distillation" element={<Distillation />} />
            <Route path="/blending" element={<Blending />} />
            <Route path="/barrels" element={<Barrels />} />
            <Route path="/bottling" element={<Bottling />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/recipes" element={<RecipesLayout />}>
              <Route index element={<RecipesPage />} />
              <Route path=":id" element={<RecipeDetailPage />} />
            </Route>
            <Route path="/master-data" element={<MasterDataLayout />}>
              <Route index element={<Navigate to="products" replace />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="skus" element={<SkusPage />} />
              <Route path="materials" element={<MaterialsPage />} />
              <Route path="bulk-spirits" element={<BulkSpiritsPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="locations" element={<LocationsPage />} />
            </Route>
            <Route path="/floor-plan" element={<FloorPlanPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/data-migration" element={<AdminRoute><DataMigration /></AdminRoute>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
