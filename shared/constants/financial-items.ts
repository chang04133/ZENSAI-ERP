/**
 * 재무제표 항목 상수 정의
 * IS = Income Statement (손익계산서)
 * BS = Balance Sheet (재무상태표)
 */

export interface FinancialItem {
  code: string;
  name: string;
  indent: number;        // 0=대분류, 1=소분류
  isCalc: boolean;       // true=자동계산 행 (입력 불가)
  children?: string[];   // 합산 대상 자식 코드 (isCalc=false인 부모)
  formula?: string;      // 특수 공식 (예: 'REVENUE - COGS')
  section?: string;      // BS용 구분 ('ASSET', 'LIABILITY', 'EQUITY')
  isBold?: boolean;      // 굵게 표시
}

// ────────────────────────────────────────
// 손익계산서 (Income Statement) 항목
// ────────────────────────────────────────
export const IS_ITEMS: FinancialItem[] = [
  // I. 매출액
  { code: 'REVENUE', name: 'I. 매출액', indent: 0, isCalc: false, children: ['REVENUE_PRODUCT', 'REVENUE_OTHER'], isBold: true },
  { code: 'REVENUE_PRODUCT', name: '1. 상품매출', indent: 1, isCalc: false },
  { code: 'REVENUE_OTHER', name: '2. 기타매출', indent: 1, isCalc: false },

  // II. 매출원가
  { code: 'COGS', name: 'II. 매출원가', indent: 0, isCalc: false, children: ['COGS_PRODUCT', 'COGS_OTHER'], isBold: true },
  { code: 'COGS_PRODUCT', name: '1. 상품매출원가', indent: 1, isCalc: false },
  { code: 'COGS_OTHER', name: '2. 기타원가', indent: 1, isCalc: false },

  // III. 매출총이익 (자동)
  { code: 'GROSS_PROFIT', name: 'III. 매출총이익', indent: 0, isCalc: true, formula: 'REVENUE - COGS', isBold: true },

  // IV. 판매비와관리비
  { code: 'SGA', name: 'IV. 판매비와관리비', indent: 0, isCalc: false, children: ['SGA_LABOR', 'SGA_RENT', 'SGA_LOGISTICS', 'SGA_MARKETING', 'SGA_ADMIN', 'SGA_OTHER'], isBold: true },
  { code: 'SGA_LABOR', name: '1. 인건비', indent: 1, isCalc: false },
  { code: 'SGA_RENT', name: '2. 임대료', indent: 1, isCalc: false },
  { code: 'SGA_LOGISTICS', name: '3. 물류비', indent: 1, isCalc: false },
  { code: 'SGA_MARKETING', name: '4. 마케팅비', indent: 1, isCalc: false },
  { code: 'SGA_ADMIN', name: '5. 관리비', indent: 1, isCalc: false },
  { code: 'SGA_OTHER', name: '6. 기타판관비', indent: 1, isCalc: false },

  // V. 영업이익 (자동)
  { code: 'OPERATING_INCOME', name: 'V. 영업이익', indent: 0, isCalc: true, formula: 'GROSS_PROFIT - SGA', isBold: true },

  // VI. 영업외수익
  { code: 'NON_OP_INCOME', name: 'VI. 영업외수익', indent: 0, isCalc: false, children: ['NON_OP_INC_INTEREST', 'NON_OP_INC_OTHER'], isBold: true },
  { code: 'NON_OP_INC_INTEREST', name: '1. 이자수익', indent: 1, isCalc: false },
  { code: 'NON_OP_INC_OTHER', name: '2. 기타영업외수익', indent: 1, isCalc: false },

  // VII. 영업외비용
  { code: 'NON_OP_EXPENSE', name: 'VII. 영업외비용', indent: 0, isCalc: false, children: ['NON_OP_EXP_INTEREST', 'NON_OP_EXP_OTHER'], isBold: true },
  { code: 'NON_OP_EXP_INTEREST', name: '1. 이자비용', indent: 1, isCalc: false },
  { code: 'NON_OP_EXP_OTHER', name: '2. 기타영업외비용', indent: 1, isCalc: false },

  // VIII. 법인세차감전순이익 (자동)
  { code: 'EBT', name: 'VIII. 법인세차감전순이익', indent: 0, isCalc: true, formula: 'OPERATING_INCOME + NON_OP_INCOME - NON_OP_EXPENSE', isBold: true },

  // IX. 법인세비용
  { code: 'INCOME_TAX', name: 'IX. 법인세비용', indent: 0, isCalc: false, isBold: true },

  // X. 당기순이익 (자동)
  { code: 'NET_INCOME', name: 'X. 당기순이익', indent: 0, isCalc: true, formula: 'EBT - INCOME_TAX', isBold: true },
];

// ────────────────────────────────────────
// 재무상태표 (Balance Sheet) 항목
// ────────────────────────────────────────
export const BS_ITEMS: FinancialItem[] = [
  // ── 자산 ──
  // I. 유동자산
  { code: 'CURRENT_ASSETS', name: 'I. 유동자산', indent: 0, isCalc: false, children: ['CA_CASH', 'CA_RECEIVABLE', 'CA_INVENTORY', 'CA_OTHER'], section: 'ASSET', isBold: true },
  { code: 'CA_CASH', name: '1. 현금및현금성자산', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'CA_RECEIVABLE', name: '2. 매출채권', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'CA_INVENTORY', name: '3. 재고자산', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'CA_OTHER', name: '4. 기타유동자산', indent: 1, isCalc: false, section: 'ASSET' },

  // II. 비유동자산
  { code: 'NON_CURRENT_ASSETS', name: 'II. 비유동자산', indent: 0, isCalc: false, children: ['NCA_TANGIBLE', 'NCA_INTANGIBLE', 'NCA_INVESTMENT', 'NCA_OTHER'], section: 'ASSET', isBold: true },
  { code: 'NCA_TANGIBLE', name: '1. 유형자산', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'NCA_INTANGIBLE', name: '2. 무형자산', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'NCA_INVESTMENT', name: '3. 투자자산', indent: 1, isCalc: false, section: 'ASSET' },
  { code: 'NCA_OTHER', name: '4. 기타비유동자산', indent: 1, isCalc: false, section: 'ASSET' },

  // III. 자산총계
  { code: 'TOTAL_ASSETS', name: 'III. 자산총계', indent: 0, isCalc: true, formula: 'CURRENT_ASSETS + NON_CURRENT_ASSETS', section: 'ASSET', isBold: true },

  // ── 부채 ──
  // IV. 유동부채
  { code: 'CURRENT_LIABILITIES', name: 'IV. 유동부채', indent: 0, isCalc: false, children: ['CL_PAYABLE', 'CL_SHORT_DEBT', 'CL_ACCRUED', 'CL_OTHER'], section: 'LIABILITY', isBold: true },
  { code: 'CL_PAYABLE', name: '1. 매입채무', indent: 1, isCalc: false, section: 'LIABILITY' },
  { code: 'CL_SHORT_DEBT', name: '2. 단기차입금', indent: 1, isCalc: false, section: 'LIABILITY' },
  { code: 'CL_ACCRUED', name: '3. 미지급금', indent: 1, isCalc: false, section: 'LIABILITY' },
  { code: 'CL_OTHER', name: '4. 기타유동부채', indent: 1, isCalc: false, section: 'LIABILITY' },

  // V. 비유동부채
  { code: 'NON_CURRENT_LIABILITIES', name: 'V. 비유동부채', indent: 0, isCalc: false, children: ['NCL_LONG_DEBT', 'NCL_OTHER'], section: 'LIABILITY', isBold: true },
  { code: 'NCL_LONG_DEBT', name: '1. 장기차입금', indent: 1, isCalc: false, section: 'LIABILITY' },
  { code: 'NCL_OTHER', name: '2. 기타비유동부채', indent: 1, isCalc: false, section: 'LIABILITY' },

  // VI. 부채총계
  { code: 'TOTAL_LIABILITIES', name: 'VI. 부채총계', indent: 0, isCalc: true, formula: 'CURRENT_LIABILITIES + NON_CURRENT_LIABILITIES', section: 'LIABILITY', isBold: true },

  // ── 자본 ──
  // VII. 자본금
  { code: 'EQUITY_CAPITAL', name: 'VII. 자본금', indent: 0, isCalc: false, section: 'EQUITY', isBold: true },
  // VIII. 이익잉여금
  { code: 'EQUITY_RETAINED', name: 'VIII. 이익잉여금', indent: 0, isCalc: false, section: 'EQUITY', isBold: true },
  // IX. 기타자본
  { code: 'EQUITY_OTHER', name: 'IX. 기타자본', indent: 0, isCalc: false, section: 'EQUITY', isBold: true },

  // X. 자본총계
  { code: 'TOTAL_EQUITY', name: 'X. 자본총계', indent: 0, isCalc: true, formula: 'EQUITY_CAPITAL + EQUITY_RETAINED + EQUITY_OTHER', section: 'EQUITY', isBold: true },

  // XI. 부채와자본총계
  { code: 'TOTAL_LIAB_EQUITY', name: 'XI. 부채와자본총계', indent: 0, isCalc: true, formula: 'TOTAL_LIABILITIES + TOTAL_EQUITY', section: 'EQUITY', isBold: true },
];

/**
 * 자동계산 수행: items 정의 + 입력값 맵 → 모든 항목의 계산된 값 맵 반환
 */
export function computeValues(
  items: FinancialItem[],
  inputValues: Record<string, number>,
): Record<string, number> {
  const values: Record<string, number> = { ...inputValues };

  // 1단계: children 합산 (부모 항목)
  for (const item of items) {
    if (item.children && !item.isCalc) {
      values[item.code] = item.children.reduce((sum, childCode) => sum + (values[childCode] || 0), 0);
    }
  }

  // 2단계: formula 기반 자동계산 (isCalc=true)
  for (const item of items) {
    if (item.isCalc && item.formula) {
      values[item.code] = evalFormula(item.formula, values);
    }
  }

  return values;
}

function evalFormula(formula: string, values: Record<string, number>): number {
  // "A + B - C" 형태의 간단한 수식 파싱
  const tokens = formula.split(/\s+/);
  let result = 0;
  let op = '+';
  for (const token of tokens) {
    if (token === '+' || token === '-') {
      op = token;
    } else {
      const val = values[token] || 0;
      result = op === '+' ? result + val : result - val;
    }
  }
  return result;
}

/** 입력 가능한 항목 코드만 추출 */
export function getInputCodes(items: FinancialItem[]): string[] {
  return items
    .filter(i => !i.isCalc && !i.children)
    .map(i => i.code);
}
