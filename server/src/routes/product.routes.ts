import { Router } from 'express';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { validateRequired } from '../middleware/validate';
import {
  listProducts, getProductWithVariants, createProduct, updateProduct,
  deactivateProduct, addVariant, updateVariant, removeVariant,
} from '../db/queries/product.queries';

const router = Router();

// GET /api/products
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit, search, category, brand, season } = req.query;
    const result = await listProducts({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      category: category as string,
      brand: brand as string,
      season: season as string,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/products/:code
router.get('/:code', authMiddleware, async (req, res) => {
  try {
    const code = req.params.code as string;
    const product = await getProductWithVariants(code);
    if (!product) {
      res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/products
router.post('/',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  validateRequired(['product_code', 'product_name']),
  async (req, res) => {
    try {
      const product = await createProduct(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 상품코드 또는 SKU입니다.' });
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/products/:code
router.put('/:code',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const code = req.params.code as string;
      const product = await updateProduct(code, req.body);
      if (!product) {
        res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/products/:code
router.delete('/:code',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const code = req.params.code as string;
      await deactivateProduct(code);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/products/:code/variants
router.post('/:code/variants',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  validateRequired(['color', 'size']),
  async (req, res) => {
    try {
      const code = req.params.code as string;
      const variant = await addVariant(code, req.body);
      res.status(201).json({ success: true, data: variant });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 SKU입니다.' });
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/products/:code/variants/:id
router.put('/:code/variants/:id',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const variant = await updateVariant(id, req.body);
      if (!variant) {
        res.status(404).json({ success: false, error: '변형을 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: variant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/products/:code/variants/:id
router.delete('/:code/variants/:id',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      await removeVariant(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
