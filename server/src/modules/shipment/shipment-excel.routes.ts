import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { shipmentService } from './shipment.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /excel/template — 출고의뢰 엑셀 템플릿 다운로드
router.get('/excel/template', authMiddleware, (_req, res) => {
  const wb = XLSX.utils.book_new();

  const templateData = [
    { '의뢰유형': '출고', '출발거래처코드': 'P001', '도착거래처코드': 'P002', 'SKU': 'ZS26SS-T001-BK-M', '수량': 5, '메모': '강남점 긴급' },
    { '의뢰유형': '출고', '출발거래처코드': 'P001', '도착거래처코드': 'P002', 'SKU': 'ZS26SS-T001-BK-L', '수량': 3, '메모': '강남점 긴급' },
    { '의뢰유형': '수평이동', '출발거래처코드': 'P002', '도착거래처코드': 'P003', 'SKU': 'ZS26SS-T002-WH-S', '수량': 2, '메모': '' },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 8 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, '출고의뢰');

  const guideData = [
    { '항목': '의뢰유형', '설명': '출고 / 반품 / 수평이동 (필수)', '예시': '출고' },
    { '항목': '출발거래처코드', '설명': '출발 거래처 코드 (필수)', '예시': 'P001' },
    { '항목': '도착거래처코드', '설명': '도착 거래처 코드 (선택)', '예시': 'P002' },
    { '항목': 'SKU', '설명': '상품 변형 SKU 코드 (필수)', '예시': 'ZS26SS-T001-BK-M' },
    { '항목': '수량', '설명': '요청 수량 (필수, 1 이상)', '예시': '5' },
    { '항목': '메모', '설명': '메모 (선택)', '예시': '긴급 출고' },
    { '항목': '', '설명': '', '예시': '' },
    { '항목': '※ 참고', '설명': '같은 유형/출발/도착/메모 조합은 하나의 의뢰로 묶입니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '매장 직원/매니저는 출발거래처코드가 자동 적용됩니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '의뢰 등록 후 출고처리에서 실제 출고수량을 입력합니다.', '예시': '' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideData);
  guideWs['!cols'] = [{ wch: 14 }, { wch: 50 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, guideWs, '작성가이드');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=shipment_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
});

// POST /excel/upload — 출고의뢰 엑셀 업로드
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'),
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
    const validTypes = ['출고', '반품', '수평이동'];

    // 1. 행 파싱 및 검증
    interface ParsedRow {
      rowNum: number; request_type: string; from_partner: string;
      to_partner: string; sku: string; qty: number; memo: string;
    }
    const parsedRows: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const requestType = String(row['의뢰유형'] || '').trim();
      if (!validTypes.includes(requestType)) {
        errors.push(`${rowNum}행: 의뢰유형 오류 (${row['의뢰유형'] || '없음'})`);
        continue;
      }

      const fromPartner = isStore ? userPartnerCode! : String(row['출발거래처코드'] || '').trim();
      if (!fromPartner) { errors.push(`${rowNum}행: 출발거래처코드 누락`); continue; }

      const toPartner = String(row['도착거래처코드'] || '').trim();

      const sku = String(row['SKU'] || row['sku'] || '').trim();
      if (!sku) { errors.push(`${rowNum}행: SKU 누락`); continue; }

      const qty = Number(row['수량']);
      if (!qty || qty <= 0) { errors.push(`${rowNum}행: 수량 오류 (${row['수량']})`); continue; }

      const memo = String(row['메모'] || '').trim();

      parsedRows.push({ rowNum, request_type: requestType, from_partner: fromPartner, to_partner: toPartner, sku, qty, memo });
    }

    if (parsedRows.length === 0) {
      res.status(400).json({ success: false, error: '유효한 데이터가 없습니다.', data: { total: rows.length, created: 0, errors } });
      return;
    }

    // 2. SKU → variant_id 매핑
    const pool = getPool();
    const uniqueSkus = [...new Set(parsedRows.map(r => r.sku))];
    const skuResult = await pool.query(
      `SELECT variant_id, sku FROM product_variants WHERE sku = ANY($1) AND is_active = TRUE`,
      [uniqueSkus],
    );
    const skuMap = new Map<string, number>();
    for (const row of skuResult.rows) skuMap.set(row.sku, row.variant_id);

    // 3. 거래처 코드 유효성 검사
    const allPartners = [...new Set([...parsedRows.map(r => r.from_partner), ...parsedRows.map(r => r.to_partner)].filter(Boolean))];
    const partnerResult = await pool.query(
      `SELECT partner_code FROM partners WHERE partner_code = ANY($1)`,
      [allPartners],
    );
    const validPartners = new Set(partnerResult.rows.map((r: any) => r.partner_code));

    // 4. 같은 (유형 + 출발 + 도착 + 메모) 조합을 하나의 의뢰로 그룹핑
    const groups = new Map<string, { header: { request_type: string; from_partner: string; to_partner: string; memo: string }; items: Array<{ rowNum: number; sku: string; variant_id: number; qty: number }> }>();

    for (const row of parsedRows) {
      const variantId = skuMap.get(row.sku);
      if (!variantId) { errors.push(`${row.rowNum}행: SKU를 찾을 수 없음 (${row.sku})`); continue; }
      if (!validPartners.has(row.from_partner)) { errors.push(`${row.rowNum}행: 출발거래처 찾을 수 없음 (${row.from_partner})`); continue; }
      if (row.to_partner && !validPartners.has(row.to_partner)) { errors.push(`${row.rowNum}행: 도착거래처 찾을 수 없음 (${row.to_partner})`); continue; }

      const key = `${row.request_type}|${row.from_partner}|${row.to_partner}|${row.memo}`;
      if (!groups.has(key)) {
        groups.set(key, {
          header: { request_type: row.request_type, from_partner: row.from_partner, to_partner: row.to_partner, memo: row.memo },
          items: [],
        });
      }
      groups.get(key)!.items.push({ rowNum: row.rowNum, sku: row.sku, variant_id: variantId, qty: row.qty });
    }

    // 5. 의뢰 일괄 생성
    let createdRequests = 0;
    let createdItems = 0;

    for (const [, group] of groups) {
      try {
        await shipmentService.createWithItems(
          {
            request_type: group.header.request_type,
            from_partner: group.header.from_partner,
            to_partner: group.header.to_partner || null,
            memo: group.header.memo || null,
            requested_by: userId,
          },
          group.items.map(i => ({ variant_id: i.variant_id, request_qty: i.qty })),
        );
        createdRequests++;
        createdItems += group.items.length;
      } catch (e: any) {
        const rowNums = group.items.map(i => i.rowNum).join(',');
        errors.push(`${rowNums}행: 의뢰 생성 실패 - ${e.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        total: rows.length,
        createdRequests,
        createdItems,
        skipped: rows.length - createdItems,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  }),
);

export default router;
