import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
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
import shipmentExcelRoutes from './modules/shipment/shipment-excel.routes';
import shipmentRoutes from './modules/shipment/shipment.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import salesExcelRoutes from './modules/sales/sales-excel.routes';
import salesRoutes from './modules/sales/sales.routes';
import systemRoutes from './modules/system/system.routes';
import restockRoutes from './modules/restock/restock.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import notificationRoutes from './modules/notification/notification.routes';
import productionRoutes from './modules/production/production.routes';
import materialRoutes from './modules/production/material.routes';
import fundRoutes from './modules/fund/fund.routes';
import sizeRunRoutes from './modules/size-run/size-run.routes';
import purchaseRoutes from './modules/purchase/purchase.routes';
import customerRoutes from './modules/customer/customer.routes';
import orderRoutes from './modules/order/order.routes';

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
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '토큰 갱신 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', refreshLimiter);

// Uploads: static file serving
const uploadsDir = path.join(__dirname, '../../uploads/products');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Routes
app.use(healthRoutes);
app.use('/api/auth', authRoutes);

// Module routes
app.use('/api/partners', partnerRoutes);
app.use('/api/products', productExcelRoutes);   // Excel routes first (specific paths)
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/codes', codeRoutes);
app.use('/api/shipments', shipmentExcelRoutes);  // Excel routes first
app.use('/api/shipments', shipmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesExcelRoutes);   // Excel routes first (specific paths)
app.use('/api/sales', salesRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/restocks', restockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/productions', productionRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/funds', fundRoutes);
app.use('/api/size-runs', sizeRunRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);

// Production: serve static files
if (config.nodeEnv === 'production') {
  const clientPath = path.join(__dirname, '../../../../dist-client');
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

export default app;
