import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { MashFermentation } from './pages/MashFermentation';
import { Distillation } from './pages/Distillation';
import { Barrels } from './pages/Barrels';
import { BarrelInventoryLayout } from './pages/barrel-inventory/BarrelInventoryLayout';
import { BarrelDashboardPage } from './pages/barrel-inventory/BarrelDashboardPage';
import { BarrelsMasterPage } from './pages/barrel-inventory/BarrelsMasterPage';
import { BarrelFillsPage } from './pages/barrel-inventory/BarrelFillsPage';
import { BarrelObservationsPage } from './pages/barrel-inventory/BarrelObservationsPage';
import { BarrelDumpsPage } from './pages/barrel-inventory/BarrelDumpsPage';
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
import { LiquidInventoryLayout } from './pages/liquid-inventory/LiquidInventoryLayout';
import { TankBoardPage } from './pages/liquid-inventory/TankBoardPage';
import { LiquidLotsPage } from './pages/liquid-inventory/LiquidLotsPage';
import { LiquidLotDetailPage } from './pages/liquid-inventory/LiquidLotDetailPage';
import { TransactionsPage } from './pages/liquid-inventory/TransactionsPage';
import { ReconciliationPage } from './pages/liquid-inventory/ReconciliationPage';
import { ProductionLayout } from './pages/production/ProductionLayout';
import { ProductionOrdersPage } from './pages/production/ProductionOrdersPage';
import { ProductionOrderDetailPage } from './pages/production/ProductionOrderDetailPage';
import { BatchExecutionPage } from './pages/production/BatchExecutionPage';
import { MaterialInventoryLayout } from './pages/material-inventory/MaterialInventoryLayout';
import { MaterialDashboardPage } from './pages/material-inventory/MaterialDashboardPage';
import { MaterialListPage } from './pages/material-inventory/MaterialListPage';
import { MaterialLotsPage } from './pages/material-inventory/MaterialLotsPage';
import { MaterialTransactionsPage } from './pages/material-inventory/MaterialTransactionsPage';
import { MaterialOpeningBalancePage } from './pages/material-inventory/MaterialOpeningBalancePage';
import { MaterialReconciliationPage } from './pages/material-inventory/MaterialReconciliationPage';
import { PurchasingLayout } from './pages/purchasing/PurchasingLayout';
import { PurchaseOrdersPage } from './pages/purchasing/PurchaseOrdersPage';
import { ReceiptsPage } from './pages/purchasing/ReceiptsPage';
import { CostingLayout } from './pages/costing/CostingLayout';
import { CostingDashboardPage } from './pages/costing/CostingDashboardPage';
import { LandedCostsPage } from './pages/costing/LandedCostsPage';
import { MaterialValuationPage } from './pages/costing/MaterialValuationPage';
import { LiquidValuationPage } from './pages/costing/LiquidValuationPage';
import { BatchCostingPage } from './pages/costing/BatchCostingPage';
import { CostAdjustmentsPage } from './pages/costing/CostAdjustmentsPage';
import { PlannedCostEstimatePage } from './pages/costing/PlannedCostEstimatePage';
import { FinishedGoodsLayout } from './pages/finished-goods/FinishedGoodsLayout';
import { FinishedGoodsDashboardPage } from './pages/finished-goods/FinishedGoodsDashboardPage';
import { FgInventoryPage } from './pages/finished-goods/FgInventoryPage';
import { FgLotsPage } from './pages/finished-goods/FgLotsPage';
import { PackagingRunsPage } from './pages/finished-goods/PackagingRunsPage';
import { FgTransactionsPage } from './pages/finished-goods/FgTransactionsPage';
import { QualityLayout } from './pages/quality/QualityLayout';
import { QualityDashboardPage } from './pages/quality/QualityDashboardPage';
import { SpecificationsPage } from './pages/quality/SpecificationsPage';
import { SamplesPage } from './pages/quality/SamplesPage';
import { HoldsPage } from './pages/quality/HoldsPage';
import { CoaPage } from './pages/quality/CoaPage';
import { RecallTracePage } from './pages/quality/RecallTracePage';
import { WarehouseLayout } from './pages/warehouse/WarehouseLayout';
import { WarehouseDashboardPage } from './pages/warehouse/WarehouseDashboardPage';
import { LocationHierarchyPage } from './pages/warehouse/LocationHierarchyPage';
import { TransferDocumentsPage } from './pages/warehouse/TransferDocumentsPage';
import { CycleCountsPage } from './pages/warehouse/CycleCountsPage';
import { BarcodesLabelsPage } from './pages/warehouse/BarcodesLabelsPage';
import { MaintenanceLayout } from './pages/maintenance/MaintenanceLayout';
import { MaintenanceDashboardPage } from './pages/maintenance/MaintenanceDashboardPage';
import { EquipmentPage } from './pages/maintenance/EquipmentPage';
import { WorkOrdersPage } from './pages/maintenance/WorkOrdersPage';
import { PmSchedulesPage } from './pages/maintenance/PmSchedulesPage';
import { DowntimePage } from './pages/maintenance/DowntimePage';
import { CalibrationPage } from './pages/maintenance/CalibrationPage';
import { PlanningLayout } from './pages/planning/PlanningLayout';
import { PlanningDashboardPage } from './pages/planning/PlanningDashboardPage';
import { DemandPage } from './pages/planning/DemandPage';
import { ProductionPlanPage } from './pages/planning/ProductionPlanPage';
import { MrpPage } from './pages/planning/MrpPage';
import { PurchasingRecommendationsPage } from './pages/planning/PurchasingRecommendationsPage';
import { SafetyStockPage } from './pages/planning/SafetyStockPage';
import { SchedulePage } from './pages/planning/SchedulePage';
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
            <Route path="/barrels" element={<Navigate to="/barrels-inventory" replace />} />
            <Route path="/barrels-inventory" element={<BarrelInventoryLayout />}>
              <Route index element={<BarrelDashboardPage />} />
              <Route path="barrels" element={<BarrelsMasterPage />} />
              <Route path="fills" element={<BarrelFillsPage />} />
              <Route path="observations" element={<BarrelObservationsPage />} />
              <Route path="dumps" element={<BarrelDumpsPage />} />
            </Route>
            <Route path="/barrels-legacy" element={<Barrels />} />
            <Route path="/bottling" element={<Bottling />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/recipes" element={<RecipesLayout />}>
              <Route index element={<RecipesPage />} />
              <Route path=":id" element={<RecipeDetailPage />} />
            </Route>
            <Route path="/production" element={<ProductionLayout />}>
              <Route index element={<ProductionOrdersPage />} />
              <Route path=":id" element={<ProductionOrderDetailPage />} />
              <Route path=":id/batch/:batchId" element={<BatchExecutionPage />} />
            </Route>
            <Route path="/material-inventory" element={<MaterialInventoryLayout />}>
              <Route index element={<MaterialDashboardPage />} />
              <Route path="raw-materials" element={<MaterialListPage materialKind="raw" />} />
              <Route path="packaging" element={<MaterialListPage materialKind="packaging" />} />
              <Route path="opening-balance" element={<MaterialOpeningBalancePage />} />
              <Route path="lots" element={<MaterialLotsPage />} />
              <Route path="transactions" element={<MaterialTransactionsPage />} />
              <Route path="reconciliation" element={<MaterialReconciliationPage />} />
            </Route>
            <Route path="/purchasing" element={<PurchasingLayout />}>
              <Route index element={<PurchaseOrdersPage />} />
              <Route path="receipts" element={<ReceiptsPage />} />
            </Route>
            <Route path="/finished-goods" element={<FinishedGoodsLayout />}>
              <Route index element={<FinishedGoodsDashboardPage />} />
              <Route path="inventory" element={<FgInventoryPage />} />
              <Route path="lots" element={<FgLotsPage />} />
              <Route path="packaging-runs" element={<PackagingRunsPage />} />
              <Route path="transactions" element={<FgTransactionsPage />} />
            </Route>
            <Route path="/warehouse" element={<WarehouseLayout />}>
              <Route index element={<WarehouseDashboardPage />} />
              <Route path="locations" element={<LocationHierarchyPage />} />
              <Route path="transfers" element={<TransferDocumentsPage />} />
              <Route path="cycle-counts" element={<CycleCountsPage />} />
              <Route path="barcodes" element={<BarcodesLabelsPage />} />
            </Route>
            <Route path="/quality" element={<QualityLayout />}>
              <Route index element={<QualityDashboardPage />} />
              <Route path="specifications" element={<SpecificationsPage />} />
              <Route path="samples" element={<SamplesPage />} />
              <Route path="holds" element={<HoldsPage />} />
              <Route path="coa" element={<CoaPage />} />
              <Route path="recall" element={<RecallTracePage />} />
            </Route>
            <Route path="/maintenance" element={<MaintenanceLayout />}>
              <Route index element={<MaintenanceDashboardPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="work-orders" element={<WorkOrdersPage />} />
              <Route path="pm-schedules" element={<PmSchedulesPage />} />
              <Route path="downtime" element={<DowntimePage />} />
              <Route path="calibration" element={<CalibrationPage />} />
            </Route>
            <Route path="/planning" element={<PlanningLayout />}>
              <Route index element={<PlanningDashboardPage />} />
              <Route path="demand" element={<DemandPage />} />
              <Route path="production-plan" element={<ProductionPlanPage />} />
              <Route path="mrp" element={<MrpPage />} />
              <Route path="purchasing-recommendations" element={<PurchasingRecommendationsPage />} />
              <Route path="safety-stock" element={<SafetyStockPage />} />
              <Route path="schedule" element={<SchedulePage />} />
            </Route>
            <Route path="/costing" element={<CostingLayout />}>
              <Route index element={<CostingDashboardPage />} />
              <Route path="landed-costs" element={<LandedCostsPage />} />
              <Route path="material-valuation" element={<MaterialValuationPage />} />
              <Route path="liquid-valuation" element={<LiquidValuationPage />} />
              <Route path="batch-costing" element={<BatchCostingPage />} />
              <Route path="planned-estimate" element={<PlannedCostEstimatePage />} />
              <Route path="adjustments" element={<CostAdjustmentsPage />} />
            </Route>
            <Route path="/liquid-inventory" element={<LiquidInventoryLayout />}>
              <Route index element={<TankBoardPage />} />
              <Route path="lots" element={<LiquidLotsPage />} />
              <Route path="lots/:id" element={<LiquidLotDetailPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="reconciliation" element={<ReconciliationPage />} />
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
