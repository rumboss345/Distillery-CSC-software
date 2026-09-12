import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';
import { Dashboard } from './pages/Dashboard';
import { MashFermentation } from './pages/MashFermentation';
import { Recipes } from './pages/Recipes';
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
        <Route element={<RequirePermission />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wash" element={<MashFermentation />} />
            <Route path="/mash" element={<Navigate to="/wash" replace />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/distillation" element={<Distillation />} />
            <Route path="/blending" element={<Blending />} />
            <Route path="/barrels" element={<Barrels />} />
            <Route path="/bottling" element={<Bottling />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/floor-plan" element={<FloorPlanPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin/users" element={<AdminUsers />} />
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
