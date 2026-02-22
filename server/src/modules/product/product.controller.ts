import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Product } from '../../../../shared/types/product';
import { productService } from './product.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

class ProductController extends BaseController<Product> {
  constructor() {
    super(productService);
  }

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
    res.json({ success: true, data: product });
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
}

export const productController = new ProductController();
