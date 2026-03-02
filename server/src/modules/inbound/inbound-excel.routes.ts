import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { getPool } from '../../db/connection';
import { asyncHandler } from '../../core/async-handler';
import { inboundRepository } from './inbound.repository';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /excel/template — 입고 엑셀 템플릿 다운로드
router.get('/excel/template', authMiddleware, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const templateData = [
    { 'SKU': 'TS-001-BK-M', '수량': 50, '단가': 20000, '메모': '' },
    { 'SKU': 'TS-001-BK-L', '수량': 30, '단가': 20000, '메모': '' },
    { 'SKU': 'TS-002-WH-FREE', '수량': 20, '단가': 30000, '메모': '추가 입고' },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, '입고등록');

  const guideData = [
    { '항목': 'SKU', '설명': '상품 SKU 코드 (필수) — 상품코드-컬러-사이즈', '예시': 'TS-001-BK-M' },
    { '항목': '수량', '설명': '입고 수량 (필수, 1 이상)', '예시': '50' },
    { '항목': '단가', '설명': '매입 단가 (선택)', '예시': '20000' },
    { '항목': '메모', '설명': '품목별 메모 (선택)', '예시': '추가 입고분' },
    { '항목': '', '설명': '', '예시': '' },
    { '항목': '※ 참고', '설명': 'SKU는 상품 상세에서 확인 가능합니다. 존재하지 않는 SKU는 건너뜁니다.', '예시': '' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideData);
  guideWs['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, guideWs, '작성가이드');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=inbound_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
});

// POST /excel/upload — 엑셀 입고 일괄 등록
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: '파일이 없습니다.' }); return; }

    const partnerCode = (req.body?.partner_code || '').trim();
    const inboundDate = (req.body?.inbound_date || '').trim() || new Date().toISOString().slice(0, 10);
    const memo = (req.body?.memo || '').trim() || null;

    if (!partnerCode) {
      res.status(400).json({ success: false, error: '거래처를 선택해주세요.' });
      return;
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (rows.length === 0) { res.status(400).json({ success: false, error: '데이터가 없습니다.' }); return; }

    // SKU 목록 수집
    const pool = getPool();
    const skuSet = new Set<string>();
    for (const row of rows) {
      const sku = String(row['SKU'] || '').trim();
      if (sku) skuSet.add(sku);
    }

    if (skuSet.size === 0) {
      res.status(400).json({ success: false, error: 'SKU 데이터가 없습니다.' });
      return;
    }

    // SKU → variant_id 매핑 조회
    const skuArray = Array.from(skuSet);
    const placeholders = skuArray.map((_, i) => `$${i + 1}`).join(',');
    const variantResult = await pool.query(
      `SELECT variant_id, sku FROM product_variants WHERE sku IN (${placeholders}) AND is_active = TRUE`,
      skuArray,
    );
    const skuToVariant = new Map<string, number>();
    for (const r of variantResult.rows) skuToVariant.set(r.sku, r.variant_id);

    // 행 파싱
    const items: Array<{ variant_id: number; qty: number; unit_price?: number; memo?: string }> = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 엑셀 행 번호 (헤더=1)
      const sku = String(row['SKU'] || '').trim();
      const qty = Number(row['수량']);
      const unitPrice = row['단가'] ? Number(row['단가']) : undefined;
      const itemMemo = row['메모'] ? String(row['메모']).trim() : undefined;

      if (!sku) { skipped++; continue; }
      if (!qty || qty < 1) { errors.push(`${rowNum}행: 수량이 올바르지 않습니다 (${sku})`); continue; }

      const variantId = skuToVariant.get(sku);
      if (!variantId) { errors.push(`${rowNum}행: SKU를 찾을 수 없습니다 (${sku})`); continue; }

      items.push({ variant_id: variantId, qty, unit_price: unitPrice, memo: itemMemo });
    }

    if (items.length === 0) {
      res.status(400).json({
        success: false,
        error: '유효한 입고 데이터가 없습니다.',
        data: { total: rows.length, created: 0, skipped, errors },
      });
      return;
    }

    // 입고 등록 (기존 createWithItems 재사용)
    const userId = req.user!.userId;
    await inboundRepository.createWithItems(
      { partner_code: partnerCode, inbound_date: inboundDate, memo, created_by: userId },
      items,
    );

    res.json({
      success: true,
      data: {
        total: rows.length,
        created: items.length,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  }),
);

export default router;
