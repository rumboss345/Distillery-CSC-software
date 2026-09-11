import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { isDatabaseConfigured } from '../../config.js';
import accountingRoutes from './accounting.js';
import adminRoutes from './admin.js';
import barrelRoutes from './barrel.js';
import costingRoutes from './costing.js';
import finishedGoodsRoutes from './finished-goods.js';
import liquidRoutes from './liquid.js';
import materialRoutes from './material.js';
import productionRoutes from './production.js';
import qualityRoutes from './quality.js';
import reportingRoutes from './reporting.js';
import salesRoutes from './sales.js';
import warehouseRoutes from './warehouse.js';

export const ERP_API_DOMAINS = [
  'material',
  'liquid',
  'finished-goods',
  'sales',
  'quality',
  'warehouse',
  'barrel',
  'production',
  'costing',
  'accounting',
  'reporting',
  'admin',
] as const;

export type ErpApiDomain = (typeof ERP_API_DOMAINS)[number];

const router = Router();

function requirePostgres(_req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  if (!isDatabaseConfigured()) {
    res.status(503).json({
      error: 'PostgreSQL is not configured. Set DATABASE_URL to use the ERP API.',
    });
    return;
  }
  next();
}

router.use(requirePostgres);
router.use(authMiddleware);

router.use('/material', materialRoutes);
router.use('/liquid', liquidRoutes);
router.use('/finished-goods', finishedGoodsRoutes);
router.use('/sales', salesRoutes);
router.use('/quality', qualityRoutes);
router.use('/warehouse', warehouseRoutes);
router.use('/barrel', barrelRoutes);
router.use('/production', productionRoutes);
router.use('/costing', costingRoutes);
router.use('/accounting', accountingRoutes);
router.use('/reporting', reportingRoutes);
router.use('/admin', adminRoutes);

router.get('/status', (_req, res) => {
  res.json({
    ready: true,
    domains: ERP_API_DOMAINS,
    handlersRegistered: true,
  });
});

export default router;
