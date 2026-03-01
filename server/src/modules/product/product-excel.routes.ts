import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';
import { inventoryRepository } from '../inventory/inventory.repository';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /excel/template
router.get('/excel/template', authMiddleware, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const templateData = [
    { '상품코드': 'TS-001', '상품명': '베이직 티셔츠', '카테고리': 'TOP', '세부카테고리': 'SHORT_SLEEVE', '브랜드': 'ZENSAI', '시즌': '2025SS', '기본가': 39000, '매입가': 20000, '할인가': '', '행사가격': '', '판매상태': '판매중', '컬러': 'BK', '사이즈': 'M', '변형가격': '', '바코드': '8801234567890', '창고위치': 'A-01-01', '재고수량': 100 },
    { '상품코드': 'TS-001', '상품명': '베이직 티셔츠', '카테고리': 'TOP', '세부카테고리': 'SHORT_SLEEVE', '브랜드': 'ZENSAI', '시즌': '2025SS', '기본가': 39000, '매입가': 20000, '할인가': '', '행사가격': '', '판매상태': '판매중', '컬러': 'BK', '사이즈': 'L', '변형가격': '', '바코드': '8801234567891', '창고위치': 'A-01-02', '재고수량': 80 },
    { '상품코드': 'TS-002', '상품명': '오버핏 셔츠', '카테고리': 'TOP', '세부카테고리': 'SWEATSHIRT', '브랜드': 'ZENSAI', '시즌': '2025SS', '기본가': 59000, '매입가': 30000, '할인가': 49000, '행사가격': 45000, '판매상태': '판매중', '컬러': 'WH', '사이즈': 'FREE', '변형가격': 62000, '바코드': '8801234567892', '창고위치': 'B-02-01', '재고수량': 50 },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, '상품등록');

  const guideData = [
    { '항목': '상품코드', '설명': '상품 고유 코드 (필수)', '예시': 'TS-001' },
    { '항목': '상품명', '설명': '상품 이름 (필수)', '예시': '베이직 티셔츠' },
    { '항목': '카테고리', '설명': '대분류 코드값', '예시': 'TOP, BOTTOM, OUTER, DRESS, ACC' },
    { '항목': '세부카테고리', '설명': '소분류 코드값', '예시': 'HOODIE, JEANS, JACKET' },
    { '항목': '브랜드', '설명': '브랜드명', '예시': 'ZENSAI' },
    { '항목': '시즌', '설명': '시즌 정보', '예시': '2025SS, 2025FW' },
    { '항목': '기본가', '설명': '기본 판매가 (숫자)', '예시': '39000' },
    { '항목': '매입가', '설명': '매입가/원가 (숫자)', '예시': '20000' },
    { '항목': '할인가', '설명': '할인 판매가 (선택)', '예시': '35000' },
    { '항목': '행사가격', '설명': '행사/프로모션가 (선택)', '예시': '29000' },
    { '항목': '판매상태', '설명': '판매중/일시품절/단종/승인대기', '예시': '판매중' },
    { '항목': '컬러', '설명': '컬러 코드 (필수)', '예시': 'BK, WH, NV' },
    { '항목': '사이즈', '설명': 'XS/S/M/L/XL/XXL/FREE (필수)', '예시': 'M' },
    { '항목': '변형가격', '설명': '변형별 개별 가격 (미입력시 기본가)', '예시': '42000' },
    { '항목': '바코드', '설명': '변형별 바코드 (선택)', '예시': '8801234567890' },
    { '항목': '창고위치', '설명': '변형별 창고 위치 (선택)', '예시': 'A-01-01' },
    { '항목': '재고수량', '설명': '초기 재고수량 (숫자, 선택)', '예시': '100' },
    { '항목': '', '설명': '', '예시': '' },
    { '항목': '※ 참고', '설명': '같은 상품코드의 행이 여러개면 각 행이 변형(컬러/사이즈)으로 등록됩니다.', '예시': '' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideData);
  guideWs['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, guideWs, '작성가이드');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=product_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
});

// POST /excel/upload
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: '파일이 없습니다.' }); return; }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (rows.length === 0) { res.status(400).json({ success: false, error: '데이터가 없습니다.' }); return; }

    const productMap = new Map<string, { product: any; variants: any[] }>();
    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'];
    const validStatuses = ['판매중', '일시품절', '단종', '승인대기'];

    for (const row of rows) {
      const code = String(row['상품코드'] || '').trim();
      const name = String(row['상품명'] || '').trim();
      const color = String(row['컬러'] || '').trim();
      const size = String(row['사이즈'] || '').trim();
      if (!code || !name || !color || !size || !validSizes.includes(size.toUpperCase())) continue;

      if (!productMap.has(code)) {
        const saleStatus = String(row['판매상태'] || '판매중').trim();
        productMap.set(code, {
          product: {
            product_code: code, product_name: name,
            category: String(row['카테고리'] || '').trim() || null,
            sub_category: String(row['세부카테고리'] || '').trim() || null,
            brand: String(row['브랜드'] || '').trim() || null,
            season: String(row['시즌'] || '').trim() || null,
            base_price: Number(row['기본가']) || 0,
            cost_price: Number(row['매입가']) || 0,
            discount_price: row['할인가'] ? Number(row['할인가']) : null,
            event_price: row['행사가격'] ? Number(row['행사가격']) : null,
            sale_status: validStatuses.includes(saleStatus) ? saleStatus : '판매중',
          },
          variants: [],
        });
      }
      productMap.get(code)!.variants.push({
        color,
        size: size.toUpperCase(),
        price: row['변형가격'] ? Number(row['변형가격']) : null,
        barcode: String(row['바코드'] || '').trim() || null,
        warehouse_location: String(row['창고위치'] || '').trim() || null,
        stock_qty: Number(row['재고수량']) || 0,
      });
    }

    if (productMap.size === 0) { res.status(400).json({ success: false, error: '유효한 상품 데이터가 없습니다.' }); return; }

    const partnerCode = (req.body?.partner_code || '').trim();
    const userId = req.user!.userId;

    const pool = getPool();
    const client = await pool.connect();
    let created = 0, skipped = 0, stockCreated = 0;
    const errors: string[] = [];

    try {
      await client.query('BEGIN');
      for (const [code, { product, variants }] of productMap) {
        try {
          const existing = await client.query('SELECT product_code FROM products WHERE product_code = $1', [code]);
          if (existing.rows.length > 0) { skipped++; errors.push(`${code}: 이미 존재 (건너뜀)`); continue; }
          await client.query(
            `INSERT INTO products (product_code, product_name, category, sub_category, brand, season, base_price, cost_price, discount_price, event_price, sale_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              product.product_code, product.product_name, product.category, product.sub_category,
              product.brand, product.season,
              product.base_price, product.cost_price, product.discount_price, product.event_price, product.sale_status,
            ],
          );
          for (const v of variants) {
            const sku = `${code}-${v.color}-${v.size}`;
            try {
              const variantResult = await client.query(
                `INSERT INTO product_variants (product_code, color, size, sku, price, barcode, warehouse_location, stock_qty)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING variant_id`,
                [code, v.color, v.size, sku, v.price || product.base_price, v.barcode, v.warehouse_location, v.stock_qty],
              );
              // 재고수량이 있고 거래처가 선택된 경우 재고 등록
              if (v.stock_qty > 0 && partnerCode && variantResult.rows.length > 0) {
                const variantId = variantResult.rows[0].variant_id;
                await inventoryRepository.applyChange(
                  partnerCode, variantId, v.stock_qty,
                  'INBOUND', 0, userId, client,
                );
                stockCreated++;
              }
            } catch (e: any) { if (e.code === '23505') errors.push(`${sku}: 중복 SKU`); }
          }
          created++;
        } catch (e: any) { errors.push(`${code}: ${e.message}`); }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    res.json({ success: true, data: { total: productMap.size, created, skipped, stockCreated, errors: errors.length > 0 ? errors : undefined } });
  }),
);

export default router;
