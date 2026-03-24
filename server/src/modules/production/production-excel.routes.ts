import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { productionRepository } from './production.repository';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /excel/template — 생산계획 엑셀 템플릿 다운로드
router.get('/excel/template', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN'), (_req, res) => {
  const wb = XLSX.utils.book_new();

  const templateData = [
    { '계획명': '26SA 상의 1차', '시즌': '2026SA', '목표일': '2026-04-01', '거래처코드': '', '카테고리': 'TOP', '세부카테고리': 'T_SHIRT', '핏': 'REGULAR', '기장': '', '수량': 100, '단가': 15000, '메모': '' },
    { '계획명': '26SA 상의 1차', '시즌': '2026SA', '목표일': '2026-04-01', '거래처코드': '', '카테고리': 'TOP', '세부카테고리': 'BLOUSE', '핏': 'SLIM', '기장': '', '수량': 50, '단가': 20000, '메모': '' },
    { '계획명': '26SA 하의 1차', '시즌': '2026SA', '목표일': '2026-04-15', '거래처코드': 'P001', '카테고리': 'BOTTOM', '세부카테고리': 'PANTS', '핏': 'WIDE', '기장': 'LONG', '수량': 80, '단가': 18000, '메모': '워싱 처리' },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 10 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, '생산계획');

  const guideData = [
    { '항목': '계획명', '설명': '생산계획 이름 (필수). 같은 계획명은 하나의 계획으로 묶입니다.', '예시': '26SA 상의 1차' },
    { '항목': '시즌', '설명': '시즌 코드 (선택). 형식: YYYYSA / YYYYSM / YYYYWN', '예시': '2026SA' },
    { '항목': '목표일', '설명': '생산 목표일 (선택). 형식: YYYY-MM-DD', '예시': '2026-04-01' },
    { '항목': '거래처코드', '설명': '입고 거래처 코드 (선택, 미입력시 본사)', '예시': 'P001' },
    { '항목': '카테고리', '설명': '상품 카테고리 코드 (필수)', '예시': 'TOP / BOTTOM / OUTER / DRESS / ACC' },
    { '항목': '세부카테고리', '설명': '세부 카테고리 코드 (선택)', '예시': 'T_SHIRT / BLOUSE / PANTS' },
    { '항목': '핏', '설명': '핏 코드 (선택)', '예시': 'REGULAR / SLIM / WIDE / OVERSIZED' },
    { '항목': '기장', '설명': '기장 코드 (선택)', '예시': 'SHORT / REGULAR / LONG / CROP' },
    { '항목': '수량', '설명': '생산 계획 수량 (필수, 1 이상)', '예시': '100' },
    { '항목': '단가', '설명': '생산 단가 (선택)', '예시': '15000' },
    { '항목': '메모', '설명': '품목별 메모 (선택)', '예시': '워싱 처리' },
    { '항목': '', '설명': '', '예시': '' },
    { '항목': '※ 참고', '설명': '같은 "계획명"을 가진 행들은 하나의 생산계획으로 묶입니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '시즌/목표일/거래처코드는 같은 계획명 내 첫 행의 값이 적용됩니다.', '예시': '' },
    { '항목': '※ 참고', '설명': '카테고리 코드는 마스터코드 관리에서 확인할 수 있습니다.', '예시': '' },
  ];
  const guideWs = XLSX.utils.json_to_sheet(guideData);
  guideWs['!cols'] = [{ wch: 14 }, { wch: 55 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, guideWs, '작성가이드');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=production_plan_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buffer));
});

// POST /excel/upload — 생산계획 엑셀 업로드
router.post('/excel/upload',
  authMiddleware,
  requireRole('ADMIN', 'SYS_ADMIN'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: '파일이 없습니다.' }); return; }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (rows.length === 0) { res.status(400).json({ success: false, error: '데이터가 없습니다.' }); return; }

    const userId = req.user!.userId;
    const pool = getPool();

    // 유효한 카테고리 코드 조회
    const catResult = await pool.query(
      "SELECT code_value FROM master_codes WHERE code_type = 'CATEGORY' AND parent_code IS NULL AND is_active = TRUE",
    );
    const validCategories = new Set(catResult.rows.map((r: any) => r.code_value));

    // 유효한 거래처 코드 조회
    const partnerResult = await pool.query('SELECT partner_code FROM partners WHERE is_active = TRUE');
    const validPartners = new Set(partnerResult.rows.map((r: any) => r.partner_code));

    // 1. 행 파싱 및 검증
    const errors: string[] = [];
    interface ParsedRow {
      rowNum: number;
      plan_name: string;
      season: string | null;
      target_date: string | null;
      partner_code: string | null;
      category: string;
      sub_category: string | null;
      fit: string | null;
      length: string | null;
      plan_qty: number;
      unit_cost: number | null;
      memo: string | null;
    }
    const parsedRows: ParsedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const planName = String(row['계획명'] || '').trim();
      if (!planName) { errors.push(`${rowNum}행: 계획명 누락`); continue; }

      const season = String(row['시즌'] || '').trim() || null;

      // 목표일 처리: 숫자(엑셀 날짜)이면 변환
      let targetDate: string | null = null;
      const rawDate = row['목표일'];
      if (rawDate) {
        if (typeof rawDate === 'number') {
          const d = XLSX.SSF.parse_date_code(rawDate);
          targetDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        } else {
          targetDate = String(rawDate).trim() || null;
        }
      }

      const partnerCode = String(row['거래처코드'] || '').trim() || null;
      if (partnerCode && !validPartners.has(partnerCode)) {
        errors.push(`${rowNum}행: 거래처코드를 찾을 수 없음 (${partnerCode})`);
        continue;
      }

      const category = String(row['카테고리'] || '').trim();
      if (!category) { errors.push(`${rowNum}행: 카테고리 누락`); continue; }
      if (!validCategories.has(category)) {
        errors.push(`${rowNum}행: 유효하지 않은 카테고리 (${category})`);
        continue;
      }

      const subCategory = String(row['세부카테고리'] || '').trim() || null;
      const fit = String(row['핏'] || '').trim() || null;
      const length = String(row['기장'] || '').trim() || null;

      const planQty = Number(row['수량']);
      if (!planQty || planQty <= 0) { errors.push(`${rowNum}행: 수량 오류 (${row['수량']})`); continue; }

      const unitCost = row['단가'] ? Number(row['단가']) : null;
      if (unitCost !== null && isNaN(unitCost)) { errors.push(`${rowNum}행: 단가 오류 (${row['단가']})`); continue; }

      const memo = String(row['메모'] || '').trim() || null;

      parsedRows.push({
        rowNum, plan_name: planName, season, target_date: targetDate,
        partner_code: partnerCode, category, sub_category: subCategory,
        fit, length, plan_qty: planQty, unit_cost: unitCost, memo,
      });
    }

    if (parsedRows.length === 0) {
      res.status(400).json({
        success: false,
        error: '유효한 데이터가 없습니다.',
        data: { total: rows.length, created: 0, errors },
      });
      return;
    }

    // 2. 같은 계획명으로 그룹핑
    const groups = new Map<string, {
      header: { plan_name: string; season: string | null; target_date: string | null; partner_code: string | null };
      items: Array<{ category: string; sub_category: string | null; fit: string | null; length: string | null; plan_qty: number; unit_cost: number | null; memo: string | null }>;
    }>();

    for (const row of parsedRows) {
      if (!groups.has(row.plan_name)) {
        groups.set(row.plan_name, {
          header: {
            plan_name: row.plan_name,
            season: row.season,
            target_date: row.target_date,
            partner_code: row.partner_code,
          },
          items: [],
        });
      }
      groups.get(row.plan_name)!.items.push({
        category: row.category,
        sub_category: row.sub_category,
        fit: row.fit,
        length: row.length,
        plan_qty: row.plan_qty,
        unit_cost: row.unit_cost,
        memo: row.memo,
      });
    }

    // 3. 생산계획 일괄 생성
    let createdPlans = 0;
    let createdItems = 0;

    for (const [planName, group] of groups) {
      try {
        await productionRepository.createWithItems(
          { ...group.header, created_by: userId },
          group.items,
        );
        createdPlans++;
        createdItems += group.items.length;
      } catch (e: any) {
        errors.push(`"${planName}": 생성 실패 - ${e.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        total: rows.length,
        createdPlans,
        createdItems,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  }),
);

export default router;
