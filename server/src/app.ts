import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';

// Auth (standalone - not auto-registered)
import healthRoutes from './routes/health.routes';
import authRoutes from './auth/routes';

// Modules
import partnerRoutes from './modules/partner/partner.routes';
import productRoutes from './modules/product/product.routes';
import productExcelRoutes from './modules/product/product-excel.routes';
import userRoutes from './modules/user/user.routes';
import codeRoutes from './modules/code/code.routes';
import shipmentRoutes from './modules/shipment/shipment.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import salesRoutes from './modules/sales/sales.routes';
import systemRoutes from './modules/system/system.routes';
import restockRoutes from './modules/restock/restock.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import notificationRoutes from './modules/notification/notification.routes';
import productionRoutes from './modules/production/production.routes';
import materialRoutes from './modules/production/material.routes';
import fundRoutes from './modules/fund/fund.routes';

const app = express();

// Middleware
function getCorsOrigin(): cors.CorsOptions['origin'] {
  if (config.nodeEnv !== 'production') {
    // 개발: 5172 마스터 + 5173 관리자 + 5174 매장매니저 + 5175 직원
    return ['http://localhost:5172', config.clientUrl, 'http://localhost:5174', 'http://localhost:5175'];
  }
  // 프로덕션: CORS_ORIGINS 환경변수로 허용 도메인 지정, 미설정 시 same-origin만 허용
  if (config.corsOrigins) {
    const origins = config.corsOrigins.split(',').map((o) => o.trim());
    return origins.length === 1 ? origins[0] : origins;
  }
  return false;
}
app.use(cors({
  origin: getCorsOrigin(),
  credentials: true,
}));
app.use(express.json());

// Routes
app.use(healthRoutes);
app.use('/api/auth', authRoutes);

// Module routes
app.use('/api/partners', partnerRoutes);
app.use('/api/products', productExcelRoutes);   // Excel routes first (specific paths)
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/codes', codeRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/restocks', restockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/productions', productionRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/funds', fundRoutes);

// Production: serve static files
if (config.nodeEnv === 'production') {
  const clientPath = path.join(__dirname, '../../dist-client');
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

export default app;
