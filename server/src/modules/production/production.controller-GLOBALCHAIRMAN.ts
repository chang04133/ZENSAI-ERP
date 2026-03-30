import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { ProductionPlan } from '../../../../shared/types/production';
import { productionService } from './production.service';
import { asyncHandler } from '../../core/async-handler';
import XLSX from 'xlsx';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

class ProductionController extends BaseController<ProductionPlan> {
  constructor() {
    super(productionService);
  }

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await productionService.list(req.query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await productionService.getWithItems(id);
    if (!item) { res.status(404).json({ success: false, error: '생산계획을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...header } = req.body;
    if (!items || items.length === 0) {
      res.status(400).json({ success: false, error: '품목을 1개 이상 추가해주세요.' }); return;
    }
    for (const item of items) {
      if (!item.category) {
        res.status(400).json({ success: false, error: '각 품목의 카테고리는 필수입니다.' }); return;
      }
      if (!item.plan_qty || item.plan_qty <= 0) {
        res.status(400).json({ success: false, error: '수량은 1 이상이어야 합니다.' }); return;
      }
    }
    const result = await productionService.createWithItems(
      { ...header, created_by: req.user!.userId }, items,
    );
    res.status(201).json({ success: true, data: result });
  });

  generateNo = asyncHandler(async (_req: Request, res: Response) => {
    const no = await productionService.generateNo();
    res.json({ success: true, data: no });
  });

  dashboard = asyncHandler(async (_req: Request, res: Response) => {
    const data = await productionService.dashboardStats();
    res.json({ success: true, data });
  });

  recommendations = asyncHandler(async (req: Request, res: Response) => {
    const { limit, category } = req.query;
    const data = await productionService.recommendations({
      limit: limit ? parseInt(limit as string, 10) : undefined,
      category: category as string | undefined,
    });
    res.json({ success: true, data });
  });

  categoryStats = asyncHandler(async (_req: Request, res: Response) => {
    const data = await productionService.categorySummary();
    res.json({ success: true, data });
  });

  categorySubStats = asyncHandler(async (req: Request, res: Response) => {
    const category = req.params.category as string;
    if (!category) { res.status(400).json({ success: false, error: '카테고리가 필요합니다.' }); return; }
    const data = await productionService.categorySubStats(category);
    res.json({ success: true, data });
  });

  categoryDetailedStats = asyncHandler(async (req: Request, res: Response) => {
    const category = req.params.category as string;
    if (!category) { res.status(400).json({ success: false, error: '카테고리가 필요합니다.' }); return; }
    const data = await productionService.categoryDetailedStats(category);
    res.json({ success: true, data });
  });

  productVariantDetail = asyncHandler(async (req: Request, res: Response) => {
    const productCode = req.params.productCode as string;
    if (!productCode) { res.status(400).json({ success: false, error: '상품코드가 필요합니다.' }); return; }
    const data = await productionService.productVariantDetail(productCode);
    res.json({ success: true, data });
  });

  autoGeneratePreview = asyncHandler(async (_req: Request, res: Response) => {
    const data = await productionService.autoGeneratePreview();
    res.json({ success: true, data });
  });

  autoGenerate = asyncHandler(async (req: Request, res: Response) => {
    const { season } = req.body;
    const data = await productionService.autoGeneratePlans(req.user!.userId, season);
    if (data.length === 0) {
      res.json({ success: true, data: [], message: '생산이 권장되는 품목이 없습니다.' });
      return;
    }
    res.status(201).json({ success: true, data });
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const { status } = req.body;
    const validStatuses = ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: '유효하지 않은 상태값입니다.' }); return;
    }
    const result = await productionService.updateStatus(id, status, req.user!.userId);
    res.json({ success: true, data: result });
  });

  updateProducedQty = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '품목 데이터가 필요합니다.' }); return;
    }
    await productionService.updateProducedQty(id, items);
    const result = await productionService.getWithItems(id);
    res.json({ success: true, data: result });
  });

  saveMaterials = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const { materials } = req.body;
    if (!Array.isArray(materials)) {
      res.status(400).json({ success: false, error: '자재 데이터가 필요합니다.' }); return;
    }
    await productionService.saveMaterials(id, materials);
    const result = await productionService.getWithItems(id);
    res.json({ success: true, data: result });
  });
  seasonPlanData = asyncHandler(async (req: Request, res: Response) => {
    const season = req.query.season as string | undefined;
    const data = await productionService.getSeasonPlanData(season);
    res.json({ success: true, data });
  });

  seasonPlanExcel = asyncHandler(async (req: Request, res: Response) => {
    const season = req.query.season as string;
    if (!season) { res.status(400).json({ success: false, error: '시즌을 선택해주세요.' }); return; }
    const rows = await productionService.generateSeasonPlanExcel(season);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 열 너비 설정
    ws['!cols'] = [
      { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '기획시트');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${season}_기획시트`)}.xlsx"`);
    res.send(buf);
  });

  /** 엑셀 업로드 → 기획시트 데이터 파싱 */
  seasonPlanExcelUpload = [
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) { res.status(400).json({ success: false, error: '파일을 업로드해주세요.' }); return; }

      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // 카테고리/세부카테고리 코드 매핑 (label → code)
      const codeData = await productionService.getSeasonPlanData();
      const labelToCategory: Record<string, string> = {};
      const labelToSubCategory: Record<string, { category: string; sub_category: string }> = {};
      for (const cat of codeData.categories) {
        labelToCategory[cat.category_label] = cat.category;
        for (const sub of cat.subCategories) {
          labelToSubCategory[sub.sub_category_label] = { category: cat.category, sub_category: sub.sub_category };
        }
      }

      // 헤더 행 찾기 (카테고리 열이 있는 행)
      let headerIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && (row[0] === '카테고리' || String(row[0]).includes('카테고리'))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        res.status(400).json({ success: false, error: '엑셀 형식이 올바르지 않습니다. "카테고리" 헤더를 찾을 수 없습니다.' });
        return;
      }

      // 데이터 행 파싱
      const parsed: Array<{
        category: string; categoryLabel: string;
        subCategory: string; subCategoryLabel: string;
        styles: number; colors: number; sizesPerStyle: number;
        lot: number; totalQty: number; unitCost: number;
        sellingPrice: number;
      }> = [];

      for (let i = headerIdx + 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row || !row[0]) continue;
        const catLabel = String(row[0]).trim();
        const subLabel = row[1] ? String(row[1]).trim() : '';

        // 소계/총합계 행 건너뛰기
        if (catLabel.includes('소계') || catLabel === '총합계' || catLabel.startsWith('[')) break;

        // 카테고리/세부카테고리 코드 매핑
        let category = '';
        let subCategory = '';

        if (subLabel && labelToSubCategory[subLabel]) {
          category = labelToSubCategory[subLabel].category;
          subCategory = labelToSubCategory[subLabel].sub_category;
        } else if (labelToCategory[catLabel]) {
          category = labelToCategory[catLabel];
        } else {
          continue; // 매핑 안 되면 건너뛰기
        }

        const styles = Number(row[2]) || 0;
        const colors = Number(row[3]) || 0;
        const sizesPerStyle = Number(row[4]) || 0;
        const lot = Number(row[5]) || 0;
        const totalQty = Number(row[6]) || (styles * colors * sizesPerStyle * lot);
        const unitCost = Number(row[7]) || 0;
        const sellingPrice = Number(row[8]) || 0;

        if (styles === 0 && colors === 0 && lot === 0 && totalQty === 0) continue;

        parsed.push({
          category,
          categoryLabel: catLabel,
          subCategory,
          subCategoryLabel: subLabel || '-',
          styles, colors, sizesPerStyle, lot, totalQty, unitCost, sellingPrice,
        });
      }

      res.json({ success: true, data: parsed });
    }),
  ];

  /** 생산계획 엑셀 템플릿 다운로드 */
  excelTemplate = asyncHandler(async (_req: Request, res: Response) => {
    // 카테고리/세부카테고리/핏 코드 목록 가져오기
    const codeData = await productionService.getSeasonPlanData();
    const rows: any[][] = [];

    rows.push(['생산계획 엑셀 등록 양식']);
    rows.push(['* 계획명, 시즌은 시트 하단에 입력해주세요.']);
    rows.push([]);

    // 헤더
    rows.push(['카테고리', '세부카테고리', '핏', '수량', '단가(원)', '메모']);

    // 카테고리별 빈 행 미리 생성 (가이드)
    for (const cat of codeData.categories) {
      if (cat.subCategories.length === 0) {
        rows.push([cat.category_label, '', '', '', '', '']);
      } else {
        for (const sub of cat.subCategories) {
          rows.push([cat.category_label, sub.sub_category_label, '', '', '', '']);
        }
      }
    }

    // 여유 빈 행
    for (let i = 0; i < 10; i++) rows.push(['', '', '', '', '', '']);

    rows.push([]);
    rows.push(['[계획 정보]']);
    rows.push(['계획명', '']);
    rows.push(['시즌', '']);
    rows.push(['목표일', '']);
    rows.push(['메모', '']);

    rows.push([]);
    rows.push(['[카테고리 코드 참조]']);
    rows.push(['카테고리명', '코드']);
    for (const cat of codeData.categories) {
      rows.push([cat.category_label, cat.category]);
      for (const sub of cat.subCategories) {
        rows.push([`  └ ${sub.sub_category_label}`, sub.sub_category]);
      }
    }

    rows.push([]);
    rows.push(['[핏 코드 참조]']);
    rows.push(['핏명', '코드']);
    for (const f of codeData.fits) {
      rows.push([f.code_label, f.code_value]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, '생산계획');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent('생산계획_양식')}.xlsx"`);
    res.send(buf);
  });

  /** 엑셀 업로드 → 생산계획 일괄 생성 */
  excelImport = [
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) { res.status(400).json({ success: false, error: '파일을 업로드해주세요.' }); return; }

      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // 코드 매핑 (label → code)
      const codeData = await productionService.getSeasonPlanData();
      const labelToCategory: Record<string, string> = {};
      const labelToSubCategory: Record<string, { category: string; sub_category: string }> = {};
      const labelToFit: Record<string, string> = {};
      for (const cat of codeData.categories) {
        labelToCategory[cat.category_label] = cat.category;
        labelToCategory[cat.category] = cat.category; // 코드 직접 입력도 허용
        for (const sub of cat.subCategories) {
          labelToSubCategory[sub.sub_category_label] = { category: cat.category, sub_category: sub.sub_category };
          labelToSubCategory[sub.sub_category] = { category: cat.category, sub_category: sub.sub_category };
        }
      }
      for (const f of codeData.fits) {
        labelToFit[f.code_label] = f.code_value;
        labelToFit[f.code_value] = f.code_value;
      }

      // 헤더 행 찾기
      let headerIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && String(row[0]).includes('카테고리')) { headerIdx = i; break; }
      }
      if (headerIdx === -1) {
        res.status(400).json({ success: false, error: '"카테고리" 헤더 행을 찾을 수 없습니다.' }); return;
      }

      // 품목 행 파싱
      const items: Array<{ category: string; sub_category: string | null; fit: string | null; plan_qty: number; unit_cost: number | null; memo: string | null }> = [];
      const skipped: string[] = [];

      for (let i = headerIdx + 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row || !row[0]) continue;
        const cellVal = String(row[0]).trim();
        // 계획정보 영역이면 중단
        if (cellVal.startsWith('[') || cellVal === '계획명' || cellVal === '시즌') break;

        const qty = Number(row[3]) || 0;
        if (qty <= 0) continue;

        // 카테고리 결정
        let category = '';
        let sub_category: string | null = null;

        const subLabel = row[1] ? String(row[1]).trim() : '';
        if (subLabel && labelToSubCategory[subLabel]) {
          category = labelToSubCategory[subLabel].category;
          sub_category = labelToSubCategory[subLabel].sub_category;
        } else if (labelToCategory[cellVal]) {
          category = labelToCategory[cellVal];
        } else {
          skipped.push(`${i + 1}행: "${cellVal}" 카테고리 매핑 실패`);
          continue;
        }

        const fitLabel = row[2] ? String(row[2]).trim() : '';
        const fit = fitLabel ? (labelToFit[fitLabel] || null) : null;
        const unit_cost = Number(row[4]) || null;
        const memo = row[5] ? String(row[5]).trim() : null;

        items.push({ category, sub_category, fit, plan_qty: qty, unit_cost, memo });
      }

      if (items.length === 0) {
        res.status(400).json({ success: false, error: '수량이 입력된 유효 품목이 없습니다.', skipped }); return;
      }

      // 계획 정보 파싱
      let planName = '';
      let season = '';
      let targetDate = '';
      let planMemo = '';
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row) continue;
        const label = String(row[0]).trim();
        if (label === '계획명' && row[1]) planName = String(row[1]).trim();
        if (label === '시즌' && row[1]) season = String(row[1]).trim();
        if (label === '목표일' && row[1]) {
          // 엑셀 날짜 변환
          const v = row[1];
          if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v);
            targetDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else {
            targetDate = String(v).trim();
          }
        }
        if (label === '메모' && row[1]) planMemo = String(row[1]).trim();
      }

      if (!planName) {
        const totalQty = items.reduce((s, i) => s + i.plan_qty, 0);
        planName = `[엑셀 업로드] ${season || '미지정'} 생산계획 (${items.length}건/${totalQty}개)`;
      }

      // 생산계획 생성
      const plan = await productionService.createWithItems(
        {
          plan_name: planName,
          season: season || null,
          target_date: targetDate || null,
          memo: planMemo || `엑셀 업로드로 생성. ${items.length}개 품목`,
          created_by: req.user!.userId,
        },
        items,
      );

      res.status(201).json({
        success: true,
        data: plan,
        summary: { itemCount: items.length, totalQty: items.reduce((s, i) => s + i.plan_qty, 0), skipped },
      });
    }),
  ];

  /** 기획시트 → 생산계획 일괄 생성 */
  seasonPlanApply = asyncHandler(async (req: Request, res: Response) => {
    const { season, rows } = req.body;
    if (!season) { res.status(400).json({ success: false, error: '시즌을 선택해주세요.' }); return; }
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ success: false, error: '기획 데이터가 없습니다.' }); return;
    }

    // 카테고리별로 그룹핑
    const catGroups = new Map<string, Array<{ sub_category: string | null; plan_qty: number; unit_cost: number | null }>>();
    for (const row of rows) {
      if (!row.category || !row.totalQty || row.totalQty <= 0) continue;
      if (!catGroups.has(row.category)) catGroups.set(row.category, []);
      catGroups.get(row.category)!.push({
        sub_category: row.subCategory && row.subCategory !== '-' ? row.subCategory : null,
        plan_qty: row.totalQty,
        unit_cost: row.unitCost || null,
      });
    }

    if (catGroups.size === 0) {
      res.status(400).json({ success: false, error: '수량이 입력된 항목이 없습니다.' }); return;
    }

    // 카테고리별 생산계획 생성
    const created: any[] = [];
    for (const [category, items] of catGroups) {
      const totalQty = items.reduce((s, i) => s + i.plan_qty, 0);
      const plan = await productionService.createWithItems(
        {
          plan_name: `[기획시트] ${season} ${category}`,
          season,
          memo: `시즌 기획시트에서 일괄 생성. ${items.length}건, 총 ${totalQty}개`,
          created_by: req.user!.userId,
        },
        items.map(item => ({
          category,
          sub_category: item.sub_category,
          plan_qty: item.plan_qty,
          unit_cost: item.unit_cost,
        })),
      );
      created.push(plan);
    }

    res.status(201).json({ success: true, data: created, message: `${created.length}개 생산계획이 생성되었습니다.` });
  });
}

export const productionController = new ProductionController();
