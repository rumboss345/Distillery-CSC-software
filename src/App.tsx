import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MashFermentation } from './pages/MashFermentation';
import { Distillation } from './pages/Distillation';
import { Barrels } from './pages/Barrels';
import { Bottling } from './pages/Bottling';
import { Blending } from './pages/Blending';
import { Inventory } from './pages/Inventory';
import { Reports } from './pages/Reports';
import { FloorPlanPage } from './pages/FloorPlan';
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
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mash" element={<MashFermentation />} />
          <Route path="/distillation" element={<Distillation />} />
          <Route path="/blending" element={<Blending />} />
          <Route path="/barrels" element={<Barrels />} />
          <Route path="/bottling" element={<Bottling />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/floor-plan" element={<FloorPlanPage />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <AppContent />;
}
