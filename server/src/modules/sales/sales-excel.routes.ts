import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { inventoryRepository } from '../inventory/inventory.repository';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /excel/template — 매출 엑셀 템플릿 다운로드
router.get('/excel/template', authMiddleware, (_req, res) => {
  const wb = XLSX.utils.book_new();

  const templateData = [
    { '매출일': '2026-02-22', '거래처코드': 'P001', 'SKU': 'ZS26SS-T001-BK-M', '수량': 3, '단가': 39000, '매출유형': '정상' },
    { '매출일': '2026-02-22', '거래처코드': 'P001', 'SKU': 'ZS26SS-T001-BK-S', '수량': 2, '단가': 35000, '매출유형': '할인' },
    { '매출일': '2026-02-22', '거래처코드': 'P002', 'SKU': 'ZS26SS-T001-WH-L', '수량': 1, '단가': 29000, '매출유형': '행사' },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, '매출등록');

  const guideData = [
    { '항목': '매출일', '설명': '매출 날짜 (필수, YYYY-MM-DD 형식)', '예시': '2026-02-22' },
    { '항목': '거래처코드', '설명': '거래처 코드 (필수, 매장용은 자동적용)', '예시': 'P001' },
    { '항목': 'SKU', '설명': '상품 변형 SKU 코드 (필수)', '예시': 'ZS26SS-T001-BK-M' },
    { '항목': '수량', '설명': '판매 수량 (필수, 1 이상 숫자)', '예시': '3' },
    { '항목': '단가', '설명': '판매 단가 (필수, 숫자)', '예시': '39000' },
    { '항목': '매출유형', '설명': '정상/할인/행사 (선택, 기본: 정상)', '예시': '정상' },
    { '항목': '', '설명': '', '예시': '' },
    { '항목': '※ 참고', '설명': '매출 등록 시 재고가 자동으로 차감됩니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '같은 날짜/거래처의 데이터를 여러 행에 입력할 수 있습니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '매장 직원/매니저는 거래처코드가 자동 적용됩니다.', '예시': '' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideData);
  guideWs['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, guideWs, '작성가이드');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=sales_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
});

// POST /excel/upload — 매출 엑셀 업로드
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: '파일이 없습니다.' }); return; }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (rows.length === 0) { res.status(400).json({ success: false, error: '데이터가 없습니다.' }); return; }

    const role = req.user?.role;
    const isStore = role === 'STORE_MANAGER' || role === 'STORE_STAFF';
    const userPartnerCode = req.user?.partnerCode;
    const userId = req.user!.userId;
    const validSaleTypes = ['정상', '할인', '행사'];

    // 1. 행 파싱 및 검증
    const parsedRows: Array<{
      rowNum: number; sale_date: string; partner_code: string;
      sku: string; qty: number; unit_price: number; sale_type: string;
    }> = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel 행번호 (헤더=1)

      const saleDateRaw = row['매출일'];
      let saleDate = '';
      if (saleDateRaw instanceof Date) {
        saleDate = saleDateRaw.toISOString().slice(0, 10);
      } else if (typeof saleDateRaw === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(saleDateRaw);
        saleDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      } else {
        saleDate = String(saleDateRaw || '').trim();
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
        errors.push(`${rowNum}행: 매출일 형식 오류 (${saleDateRaw})`);
        continue;
      }

      const partnerCode = isStore ? userPartnerCode! : String(row['거래처코드'] || '').trim();
      if (!partnerCode) { errors.push(`${rowNum}행: 거래처코드 누락`); continue; }

      const sku = String(row['SKU'] || row['sku'] || '').trim();
      if (!sku) { errors.push(`${rowNum}행: SKU 누락`); continue; }

      const qty = Number(row['수량']);
      if (!qty || qty <= 0) { errors.push(`${rowNum}행: 수량 오류 (${row['수량']})`); continue; }

      const unitPrice = Number(row['단가']);
      if (!unitPrice || unitPrice <= 0) { errors.push(`${rowNum}행: 단가 오류 (${row['단가']})`); continue; }

      const saleType = String(row['매출유형'] || '정상').trim();
      if (!validSaleTypes.includes(saleType)) { errors.push(`${rowNum}행: 매출유형 오류 (${saleType})`); continue; }

      parsedRows.push({ rowNum, sale_date: saleDate, partner_code: partnerCode, sku, qty, unit_price: unitPrice, sale_type: saleType });
    }

    if (parsedRows.length === 0) {
      res.status(400).json({ success: false, error: '유효한 데이터가 없습니다.', data: { total: rows.length, created: 0, errors } });
      return;
    }

    // 2. SKU → variant_id 매핑 (일괄 조회)
    const pool = getPool();
    const uniqueSkus = [...new Set(parsedRows.map(r => r.sku))];
    const skuResult = await pool.query(
      `SELECT variant_id, sku FROM product_variants WHERE sku = ANY($1)`,
      [uniqueSkus],
    );
    const skuMap = new Map<string, number>();
    for (const row of skuResult.rows) {
      skuMap.set(row.sku, row.variant_id);
    }

    // 3. 거래처 코드 유효성 검사
    const uniquePartners = [...new Set(parsedRows.map(r => r.partner_code))];
    const partnerResult = await pool.query(
      `SELECT partner_code FROM partners WHERE partner_code = ANY($1)`,
      [uniquePartners],
    );
    const validPartners = new Set(partnerResult.rows.map((r: any) => r.partner_code));

    // 4. 트랜잭션으로 일괄 등록
    const client = await pool.connect();
    let created = 0;

    try {
      await client.query('BEGIN');

      for (const row of parsedRows) {
        const variantId = skuMap.get(row.sku);
        if (!variantId) {
          errors.push(`${row.rowNum}행: SKU를 찾을 수 없음 (${row.sku})`);
          continue;
        }
        if (!validPartners.has(row.partner_code)) {
          errors.push(`${row.rowNum}행: 거래처코드를 찾을 수 없음 (${row.partner_code})`);
          continue;
        }

        const totalPrice = row.qty * row.unit_price;
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING sale_id`,
          [row.sale_date, row.partner_code, variantId, row.qty, row.unit_price, totalPrice, row.sale_type],
        );

        await inventoryRepository.applyChange(
          row.partner_code, variantId, -row.qty, 'SALE', sale.rows[0].sale_id, userId, client,
        );
        created++;
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      data: {
        total: rows.length,
        created,
        skipped: rows.length - created,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  }),
);

export default router;
