import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { productController } from './product.controller';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();

const write = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

// 이미지 업로드용 multer 설정
const uploadsDir = path.join(__dirname, '../../../../uploads/products');
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const rawCode = req.params.code;
    const code = (typeof rawCode === 'string' ? rawCode : 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${code}_${Date.now()}${ext}`);
  },
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('이미지 파일만 업로드 가능합니다 (jpg, png, webp, gif)'));
  },
});

// 바코드 대시보드 (매장용)
router.get('/barcode-dashboard', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;

  // 바코드 통계
  const statsSql = `
    SELECT
      COUNT(*)::int AS total_variants,
      COUNT(CASE WHEN barcode IS NOT NULL AND barcode != '' THEN 1 END)::int AS with_barcode,
      COUNT(CASE WHEN barcode IS NULL OR barcode = '' THEN 1 END)::int AS without_barcode
    FROM product_variants WHERE is_active = TRUE`;
  const stats = (await pool.query(statsSql)).rows[0];

  // 매장 재고가 있는 variant 목록 (바코드 포함)
  const variantParams: any[] = [];
  let inventoryJoin = '';
  let inventoryFilter = '';
  let inventorySelect = '';
  if (partnerCode) {
    variantParams.push(partnerCode);
    inventoryJoin = `LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code = $1`;
    inventoryFilter = `AND (i.qty > 0 OR i.qty IS NOT NULL)`;
    inventorySelect = `, COALESCE(i.qty, 0)::int AS stock_qty`;
  } else {
    inventorySelect = `, pv.stock_qty`;
  }

  const variantSql = `
    SELECT pv.variant_id, pv.sku, pv.color, pv.size, pv.barcode,
           p.product_code, p.product_name, p.category, p.sub_category,
           p.base_price, p.discount_price
           ${inventorySelect}
    FROM product_variants pv
    JOIN products p ON pv.product_code = p.product_code
    ${inventoryJoin}
    WHERE pv.is_active = TRUE AND p.is_active = TRUE ${inventoryFilter}
    ORDER BY p.product_code, pv.color, pv.size
    LIMIT 500`;
  const variants = (await pool.query(variantSql, variantParams)).rows;

  // 매장 역할이면 cost_price 제거 (안전장치)
  const userRole = req.user?.role;
  const isStoreUser = userRole === 'STORE_MANAGER' || userRole === 'STORE_STAFF';
  const safeVariants = isStoreUser
    ? variants.map(({ cost_price, ...rest }: any) => rest)
    : variants;

  res.json({ success: true, data: { stats, variants: safeVariants } });
}));

// 바코드 등록/수정 (매장 매니저도 가능)
router.put('/variants/:id/barcode', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const variantId = parseInt(req.params.id as string, 10);
  const { barcode } = req.body;

  // 중복 체크
  if (barcode) {
    const dup = await pool.query(
      `SELECT variant_id FROM product_variants WHERE barcode = $1 AND variant_id != $2`,
      [barcode, variantId],
    );
    if (dup.rows.length > 0) {
      res.status(409).json({ success: false, error: '이미 다른 상품에 등록된 바코드입니다.' });
      return;
    }
  }

  const result = await pool.query(
    `UPDATE product_variants SET barcode = $1 WHERE variant_id = $2 RETURNING *`,
    [barcode || null, variantId],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '변형을 찾을 수 없습니다.' });
    return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

// 이미지 업로드
router.post('/:code/image', ...write, imageUpload.single('image'), asyncHandler(async (req, res) => {
  const pool = getPool();
  const { code } = req.params;
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: '이미지 파일이 필요합니다.' });
    return;
  }

  // 기존 이미지 삭제
  const prev = await pool.query('SELECT image_url FROM products WHERE product_code = $1', [code]);
  if (prev.rows.length === 0) {
    res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    return;
  }
  const oldUrl = prev.rows[0].image_url;
  if (oldUrl) {
    const oldPath = path.join(__dirname, '../../../../', oldUrl);
    try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
  }

  const imageUrl = `/uploads/products/${file.filename}`;
  await pool.query('UPDATE products SET image_url = $1 WHERE product_code = $2', [imageUrl, code]);
  res.json({ success: true, data: { image_url: imageUrl } });
}));

// 행사 상품
router.get('/events', authMiddleware, productController.listEventProducts);
router.get('/events/recommendations', authMiddleware, productController.eventRecommendations);
router.put('/events/bulk', ...write, productController.bulkUpdateEventPrices);

router.get('/variants/options', authMiddleware, asyncHandler(async (_req, res) => {
  const pool = getPool();
  const colors = await pool.query("SELECT DISTINCT color FROM product_variants WHERE is_active = TRUE AND color IS NOT NULL ORDER BY color");
  const sizes = await pool.query("SELECT DISTINCT size FROM product_variants WHERE is_active = TRUE AND size IS NOT NULL ORDER BY CASE size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 WHEN 'FREE' THEN 7 ELSE 8 END");
  res.json({ success: true, data: { colors: colors.rows.map((r: any) => r.color), sizes: sizes.rows.map((r: any) => r.size) } });
}));
router.get('/',      authMiddleware, productController.list);
router.get('/variants/search', authMiddleware, productController.searchVariants);
router.get('/:code', authMiddleware, productController.getById);
router.post('/',     ...write, validateRequired(['product_code', 'product_name']), productController.create);
router.put('/:code/event-price', ...write, productController.updateEventPrice);
router.put('/:code', ...write, productController.update);
router.delete('/:code', ...write, productController.remove);

// SKU별 부족알림 토글
router.put('/variants/:id/alert', authMiddleware, asyncHandler(async (req, res) => {
  const pool = getPool();
  const variantId = parseInt(req.params.id as string, 10);
  const { low_stock_alert } = req.body;
  const result = await pool.query(
    `UPDATE product_variants SET low_stock_alert = $1 WHERE variant_id = $2 RETURNING variant_id, low_stock_alert`,
    [!!low_stock_alert, variantId],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '변형을 찾을 수 없습니다.' });
    return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

// Variant sub-routes
router.post('/:code/variants',       ...write, validateRequired(['color', 'size']), productController.addVariant);
router.put('/:code/variants/:id',    ...write, productController.updateVariant);
router.delete('/:code/variants/:id', ...write, productController.removeVariant);

export default router;
