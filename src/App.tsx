import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { ChangePassword } from './pages/ChangePassword';
import { ApproveUser } from './pages/ApproveUser';
import { useDatabaseReady } from './db/client-actions';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const MashFermentation = lazy(() => import('./pages/MashFermentation').then((m) => ({ default: m.MashFermentation })));
const Fermentation = lazy(() => import('./pages/Fermentation').then((m) => ({ default: m.Fermentation })));
const Recipes = lazy(() => import('./pages/Recipes').then((m) => ({ default: m.Recipes })));
const EquipmentMaintenance = lazy(() => import('./pages/EquipmentMaintenance').then((m) => ({ default: m.EquipmentMaintenance })));
const Distillation = lazy(() => import('./pages/Distillation').then((m) => ({ default: m.Distillation })));
const TankTransfer = lazy(() => import('./pages/TankTransfer').then((m) => ({ default: m.TankTransfer })));
const Barrels = lazy(() => import('./pages/Barrels').then((m) => ({ default: m.Barrels })));
const Bottling = lazy(() => import('./pages/Bottling').then((m) => ({ default: m.Bottling })));
const Blending = lazy(() => import('./pages/Blending').then((m) => ({ default: m.Blending })));
const Inventory = lazy(() => import('./pages/Inventory').then((m) => ({ default: m.Inventory })));
const ReportsLayout = lazy(() => import('./pages/reports/ReportsLayout').then((m) => ({ default: m.ReportsLayout })));
const SummaryReport = lazy(() => import('./pages/reports/SummaryReport').then((m) => ({ default: m.SummaryReport })));
const CostingReport = lazy(() => import('./pages/reports/CostingReport').then((m) => ({ default: m.CostingReport })));
const WashReport = lazy(() => import('./pages/reports/WashReport').then((m) => ({ default: m.WashReport })));
const FermentationReport = lazy(() => import('./pages/reports/FermentationReport').then((m) => ({ default: m.FermentationReport })));
const DistillationReport = lazy(() => import('./pages/reports/DistillationReport').then((m) => ({ default: m.DistillationReport })));
const TankInventoryReport = lazy(() => import('./pages/reports/TankInventoryReport').then((m) => ({ default: m.TankInventoryReport })));
const BlendingReport = lazy(() => import('./pages/reports/BlendingReport').then((m) => ({ default: m.BlendingReport })));
const BottlingReportPage = lazy(() => import('./pages/reports/BottlingReportPage').then((m) => ({ default: m.BottlingReportPage })));
const VolumeChangesReport = lazy(() => import('./pages/reports/VolumeChangesReport').then((m) => ({ default: m.VolumeChangesReport })));
const MaintenanceReport = lazy(() => import('./pages/reports/MaintenanceReport').then((m) => ({ default: m.MaintenanceReport })));
const MovementsReport = lazy(() => import('./pages/reports/MovementsReport').then((m) => ({ default: m.MovementsReport })));
const ExceptionsReport = lazy(() => import('./pages/reports/ExceptionsReport').then((m) => ({ default: m.ExceptionsReport })));
const TraceabilityReport = lazy(() => import('./pages/reports/TraceabilityReport').then((m) => ({ default: m.TraceabilityReport })));
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })));
const FloorPlanPage = lazy(() => import('./pages/FloorPlan').then((m) => ({ default: m.FloorPlanPage })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const SpiritWeightCalculator = lazy(() => import('./pages/SpiritWeightCalculator').then((m) => ({ default: m.SpiritWeightCalculator })));
const MessagingCenter = lazy(() => import('./pages/MessagingCenter').then((m) => ({ default: m.MessagingCenter })));

function RouteLoading() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Loading page…</p>
    </div>
  );
}

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
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/approve" element={<ApproveUser />} />
          <Route element={<RequirePermission />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/wash" element={<MashFermentation />} />
              <Route path="/fermentation" element={<Fermentation />} />
              <Route path="/mash" element={<Navigate to="/wash" replace />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/equipment-maintenance" element={<EquipmentMaintenance />} />
              <Route path="/distillation" element={<Distillation />} />
              <Route path="/tank-transfer" element={<TankTransfer />} />
              <Route path="/blending" element={<Blending />} />
              <Route path="/tools/spirit-calculator" element={<SpiritWeightCalculator />} />
              <Route path="/barrels" element={<Barrels />} />
              <Route path="/bottling" element={<Bottling />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/floor-plan" element={<FloorPlanPage />} />
              <Route path="/messages" element={<MessagingCenter />} />
              <Route path="/reports" element={<ReportsLayout />}>
                <Route index element={<SummaryReport />} />
                <Route path="costing" element={<CostingReport />} />
                <Route path="wash" element={<WashReport />} />
                <Route path="fermentation" element={<FermentationReport />} />
                <Route path="distillation" element={<DistillationReport />} />
                <Route path="tanks" element={<TankInventoryReport />} />
                <Route path="blending" element={<BlendingReport />} />
                <Route path="bottling" element={<BottlingReportPage />} />
                <Route path="volume-changes" element={<VolumeChangesReport />} />
                <Route path="maintenance" element={<MaintenanceReport />} />
                <Route path="movements" element={<MovementsReport />} />
                <Route path="exceptions" element={<ExceptionsReport />} />
                <Route path="traceability" element={<TraceabilityReport />} />
              </Route>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/account/password" element={<ChangePassword />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
}