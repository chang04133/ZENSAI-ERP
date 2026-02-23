import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Product } from '../../../../shared/types/product';
import { productService } from './product.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { audit } from '../../core/audit';

/** 매장 역할이면 cost_price 제거 */
function isStoreRole(req: Request): boolean {
  const role = req.user?.role;
  return role === 'STORE_MANAGER' || role === 'STORE_STAFF';
}

function stripCost(obj: any): any {
  if (!obj) return obj;
  const { cost_price, ...rest } = obj;
  return rest;
}

function stripCostFromResult(data: any, req: Request): any {
  if (!isStoreRole(req)) return data;
  if (Array.isArray(data)) return data.map(stripCost);
  if (data?.data && Array.isArray(data.data)) return { ...data, data: data.data.map(stripCost) };
  return stripCost(data);
}

class ProductController extends BaseController<Product> {
  constructor() {
    super(productService);
  }

  /** 목록 조회 - 매장 역할은 cost_price 제외 */
  list = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, search, orderBy, orderDir, ...filters } = req.query;
    const result = await productService.list({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      orderBy: orderBy as string,
      orderDir: orderDir as 'ASC' | 'DESC',
      ...filters,
    });
    res.json({ success: true, data: stripCostFromResult(result, req) });
  });

  searchVariants = asyncHandler(async (req: Request, res: Response) => {
    const search = ((req.query.search as string) || '').trim();
    const pool = getPool();
    const lim = search ? 50 : 500;
    const result = await pool.query(
      `SELECT pv.variant_id, pv.sku, pv.color, pv.size, pv.price,
              p.product_code, p.product_name, p.category,
              p.base_price, p.discount_price, p.event_price
       FROM product_variants pv
       JOIN products p ON pv.product_code = p.product_code
       WHERE pv.is_active = TRUE AND p.is_active = TRUE
         ${search ? 'AND (pv.sku ILIKE $1 OR p.product_name ILIKE $1 OR p.product_code ILIKE $1)' : ''}
       ORDER BY p.product_code, pv.color, pv.size
       LIMIT ${lim}`,
      search ? [`%${search}%`] : [],
    );
    res.json({ success: true, data: result.rows });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getWithVariants(req.params.code as string);
    if (!product) {
      res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: stripCostFromResult(product, req) });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    try {
      const product = await productService.createWithVariants(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 상품코드 또는 SKU입니다.' });
        return;
      }
      throw error;
    }
  });

  addVariant = asyncHandler(async (req: Request, res: Response) => {
    try {
      const variant = await productService.addVariant(req.params.code as string, req.body);
      res.status(201).json({ success: true, data: variant });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 SKU입니다.' });
        return;
      }
      throw error;
    }
  });

  updateVariant = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const variant = await productService.updateVariant(id, req.body);
    if (!variant) {
      res.status(404).json({ success: false, error: '변형을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: variant });
  });

  removeVariant = asyncHandler(async (req: Request, res: Response) => {
    await productService.removeVariant(parseInt(req.params.id as string, 10));
    res.json({ success: true });
  });

  listEventProducts = asyncHandler(async (req: Request, res: Response) => {
    const result = await productService.listEventProducts(req.query);
    res.json({ success: true, data: stripCostFromResult(result, req) });
  });

  updateEventPrice = asyncHandler(async (req: Request, res: Response) => {
    const { event_price, event_start_date, event_end_date } = req.body;
    const code = req.params.code as string;
    const product = await productService.updateEventPrice(
      code, event_price ?? null,
      event_start_date, event_end_date,
    );
    if (!product) {
      res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
      return;
    }
    audit('products', code, 'UPDATE', req.user!.userId,
      null, { event_price, event_start_date, event_end_date });
    res.json({ success: true, data: stripCostFromResult(product, req) });
  });

  bulkUpdateEventPrices = asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ success: false, error: '업데이트 항목이 필요합니다.' });
      return;
    }
    const result = await productService.bulkUpdateEventPrices(updates);
    if (isStoreRole(req) && result?.products) {
      result.products = result.products.map(stripCost);
    }
    res.json({ success: true, data: result });
  });

  eventRecommendations = asyncHandler(async (req: Request, res: Response) => {
    const { limit, category } = req.query;
    const data = await productService.eventRecommendations({
      limit: limit ? parseInt(limit as string, 10) : undefined,
      category: category as string | undefined,
    });
    res.json({ success: true, data: stripCostFromResult(data, req) });
  });
}

export const productController = new ProductController();
