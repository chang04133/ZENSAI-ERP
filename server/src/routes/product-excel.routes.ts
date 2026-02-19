import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { getPool } from '../db/connection';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/products/excel/template - 엑셀 템플릿 다운로드
router.get('/excel/template', authMiddleware, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const templateData = [
    {
      '상품코드': 'TS-001',
      '상품명': '베이직 티셔츠',
      '카테고리': '상의',
      '브랜드': 'ZENSAI',
      '시즌': '2025SS',
      '기본가': 39000,
      '컬러': 'BK',
      '사이즈': 'M',
      '변형가격': '',
    },
    {
      '상품코드': 'TS-001',
      '상품명': '베이직 티셔츠',
      '카테고리': '상의',
      '브랜드': 'ZENSAI',
      '시즌': '2025SS',
      '기본가': 39000,
      '컬러': 'BK',
      '사이즈': 'L',
      '변형가격': '',
    },
    {
      '상품코드': 'TS-002',
      '상품명': '오버핏 셔츠',
      '카테고리': '상의',
      '브랜드': 'ZENSAI',
      '시즌': '2025SS',
      '기본가': 59000,
      '컬러': 'WH',
      '사이즈': 'FREE',
      '변형가격': 62000,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, '상품등록');

  // Add guide sheet
  const guideData = [
    { '항목': '상품코드', '설명': '상품 고유 코드 (필수)', '예시': 'TS-001' },
    { '항목': '상품명', '설명': '상품 이름 (필수)', '예시': '베이직 티셔츠' },
    { '항목': '카테고리', '설명': '상품 분류', '예시': '상의, 하의, 아우터, 원피스' },
    { '항목': '브랜드', '설명': '브랜드명', '예시': 'ZENSAI' },
    { '항목': '시즌', '설명': '시즌 정보', '예시': '2025SS, 2025FW' },
    { '항목': '기본가', '설명': '기본 판매가 (숫자)', '예시': '39000' },
    { '항목': '컬러', '설명': '컬러 코드 (필수)', '예시': 'BK, WH, NV, BG' },
    { '항목': '사이즈', '설명': 'XS/S/M/L/XL/XXL/FREE (필수)', '예시': 'M' },
    { '항목': '변형가격', '설명': '변형별 개별 가격 (미입력시 기본가)', '예시': '42000' },
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

// POST /api/products/excel/upload - 엑셀 업로드로 상품 일괄 등록
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: '파일이 없습니다.' });
        return;
      }

      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      if (rows.length === 0) {
        res.status(400).json({ success: false, error: '데이터가 없습니다.' });
        return;
      }

      // Group by product_code
      const productMap = new Map<string, { product: any; variants: any[] }>();

      for (const row of rows) {
        const code = String(row['상품코드'] || '').trim();
        const name = String(row['상품명'] || '').trim();
        const color = String(row['컬러'] || '').trim();
        const size = String(row['사이즈'] || '').trim();

        if (!code || !name || !color || !size) continue;

        const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'];
        if (!validSizes.includes(size.toUpperCase())) continue;

        if (!productMap.has(code)) {
          productMap.set(code, {
            product: {
              product_code: code,
              product_name: name,
              category: String(row['카테고리'] || '').trim() || null,
              brand: String(row['브랜드'] || '').trim() || null,
              season: String(row['시즌'] || '').trim() || null,
              base_price: Number(row['기본가']) || 0,
            },
            variants: [],
          });
        }

        productMap.get(code)!.variants.push({
          color,
          size: size.toUpperCase(),
          price: row['변형가격'] ? Number(row['변형가격']) : null,
        });
      }

      if (productMap.size === 0) {
        res.status(400).json({ success: false, error: '유효한 상품 데이터가 없습니다. 템플릿을 확인해주세요.' });
        return;
      }

      // Insert into database
      const pool = getPool();
      const client = await pool.connect();
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      try {
        await client.query('BEGIN');

        for (const [code, { product, variants }] of productMap) {
          try {
            // Check if product already exists
            const existing = await client.query('SELECT product_code FROM products WHERE product_code = $1', [code]);
            if (existing.rows.length > 0) {
              skipped++;
              errors.push(`${code}: 이미 존재하는 상품코드 (건너뜀)`);
              continue;
            }

            // Insert product
            await client.query(
              `INSERT INTO products (product_code, product_name, category, brand, season, base_price)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [product.product_code, product.product_name, product.category, product.brand, product.season, product.base_price]
            );

            // Insert variants
            for (const v of variants) {
              const sku = `${code}-${v.color}-${v.size}`;
              try {
                await client.query(
                  `INSERT INTO product_variants (product_code, color, size, sku, price)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [code, v.color, v.size, sku, v.price || product.base_price]
                );
              } catch (variantErr: any) {
                if (variantErr.code === '23505') {
                  errors.push(`${sku}: 중복 SKU (건너뜀)`);
                }
              }
            }

            created++;
          } catch (productErr: any) {
            errors.push(`${code}: ${productErr.message}`);
          }
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        data: {
          total: productMap.size,
          created,
          skipped,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error: any) {
      console.error('엑셀 업로드 오류:', error);
      res.status(500).json({ success: false, error: '엑셀 처리 중 오류가 발생했습니다.' });
    }
  }
);

export default router;
