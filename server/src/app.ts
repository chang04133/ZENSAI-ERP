import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import healthRoutes from './routes/health.routes';
import authRoutes from './auth/routes';
import partnerRoutes from './routes/partner.routes';
import productRoutes from './routes/product.routes';
import productExcelRoutes from './routes/product-excel.routes';
import userRoutes from './routes/user.routes';
import masterCodeRoutes from './routes/master-code.routes';

const app = express();

// Middleware
app.use(cors({
  origin: config.nodeEnv === 'production' ? true : config.clientUrl,
  credentials: true,
}));
app.use(express.json());

// Routes
app.use(healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/products', productExcelRoutes);  // Excel routes first (specific paths)
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/codes', masterCodeRoutes);

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
