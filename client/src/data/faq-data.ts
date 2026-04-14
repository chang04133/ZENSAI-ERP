export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  roles: string[];  // 이 FAQ를 볼 수 있는 역할
}

export const FAQ_CATEGORIES = ['전체', '상품', '재고', '판매', '출고', '생산', 'MD분석', '고객', '시스템'] as const;

/* 역할 그룹 */
const ALL = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF', 'OUTSOURCE_DESIGNER'];
const ADMIN_ONLY = ['ADMIN'];
const ADMIN_SYS = ['ADMIN', 'SYS_ADMIN'];
const ADMIN_HQ = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'];
const ADMIN_HQ_STORE = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

export const faqData: FaqItem[] = [
  // ── 상품관리 (ADMIN_HQ_STORE) ──
  { id: 'p1', category: '상품', question: '상품을 어떻게 등록하나요?',
    answer: '상품관리 > 상품등록 페이지에서 [신규 등록] 버튼을 클릭합니다.\n\n필수 입력: 상품코드, 상품명, 카테고리, 시즌, 기본가격\n선택 입력: 원가, 컬러/사이즈 바리에이션, 이미지\n\n바리에이션(컬러×사이즈) 조합을 설정하면 자동으로 바코드가 생성됩니다.',
    keywords: ['상품', '등록', '신규', '추가', '만들기', '생성'], roles: ADMIN_HQ },
  { id: 'p2', category: '상품', question: '상품 코드 체계는 어떻게 되나요?',
    answer: '상품코드 = 연도(2) + 시즌(2) + 카테고리(2) + 일련번호(3)\n\n예시: 25SS-JK-001\n- 25: 2025년\n- SS: 봄/여름\n- JK: 자켓\n- 001: 일련번호\n\n코드는 수동 입력하거나 자동 채번할 수 있습니다.',
    keywords: ['상품코드', '코드', '체계', '번호', '규칙', '채번'], roles: ADMIN_HQ_STORE },
  { id: 'p3', category: '상품', question: '바코드는 어떻게 생성되나요?',
    answer: '상품의 컬러×사이즈 바리에이션을 설정하면 각 조합마다 고유 바코드(SKU)가 자동 생성됩니다.\n\n바코드 출력: 상품 상세 > [바코드 출력] 버튼\n바코드 형식: EAN-13 또는 내부 코드',
    keywords: ['바코드', '생성', 'SKU', '출력', '스캔', '인쇄'], roles: ALL },
  { id: 'p4', category: '상품', question: '카테고리를 추가/수정하려면?',
    answer: '시스템 > 코드관리 페이지에서 CATEGORY 타입을 선택하면 카테고리를 추가/수정할 수 있습니다.\n\n상위 카테고리(대분류)와 하위 카테고리(소분류) 2단계로 관리됩니다.',
    keywords: ['카테고리', '분류', '추가', '수정', '코드관리'], roles: ADMIN_SYS },
  { id: 'p5', category: '상품', question: '시즌 코드는 뭔가요?',
    answer: '시즌은 상품의 판매 시기를 구분합니다.\n\n- SS: 봄/여름 (Spring/Summer)\n- SM: 여름 (Summer)\n- FW: 가을/겨울 (Fall/Winter)\n- WN: 겨울 (Winter)\n\n시스템 > 코드관리에서 SEASON 타입으로 관리됩니다.',
    keywords: ['시즌', '코드', 'SS', 'FW', 'SM', 'WN', '봄', '여름', '가을', '겨울'], roles: ADMIN_HQ_STORE },
  { id: 'p6', category: '상품', question: '상품 가격을 변경하려면?',
    answer: '상품 상세에서 기본가격(base_price)을 수정할 수 있습니다.\n\n행사가(event_price)는 마크다운 스케줄을 통해 일괄 적용/복원할 수 있습니다.\nMD관리 > 마크다운 스케줄 페이지를 확인하세요.',
    keywords: ['가격', '변경', '수정', '할인', '행사가', '정가'], roles: ADMIN_HQ },
  { id: 'p7', category: '상품', question: '컬러와 사이즈는 어디서 관리하나요?',
    answer: '시스템 > 코드관리에서 COLOR, SIZE 타입으로 관리합니다.\n\n상품 등록/수정 시 해당 상품에 적용할 컬러와 사이즈를 선택하면 바리에이션이 자동 생성됩니다.',
    keywords: ['컬러', '사이즈', '색상', '색깔', '치수', '옵션', '바리에이션'], roles: ADMIN_HQ_STORE },

  // ── 재고관리 (ADMIN_HQ_STORE) ──
  { id: 'i1', category: '재고', question: '재고 현황을 어디서 확인하나요?',
    answer: '재고관리 > 재고현황 페이지에서 확인할 수 있습니다.\n\n매장별, 상품별, 카테고리별 재고를 조회할 수 있으며, 엑셀 다운로드도 가능합니다.',
    keywords: ['재고', '현황', '확인', '조회', '수량'], roles: ADMIN_HQ_STORE },
  { id: 'i2', category: '재고', question: '안전재고란 무엇인가요?',
    answer: '최소한으로 유지해야 하는 재고 수량입니다.\n\n재고가 안전재고 이하로 떨어지면 대시보드에 경고가 표시됩니다.\n기본 임계값은 시스템 설정에서 조정할 수 있습니다.',
    keywords: ['안전재고', '최소', '경고', '알림', '부족', '임계값'], roles: ADMIN_HQ_STORE },
  { id: 'i3', category: '재고', question: '재고 조정은 어떻게 하나요?',
    answer: '재고관리 > 재고조정 페이지에서 실제 재고와 시스템 재고의 차이를 조정할 수 있습니다.\n\n사유를 반드시 입력해야 하며, 모든 조정 이력이 기록됩니다.',
    keywords: ['재고조정', '조정', '차이', '실사', '맞추기', '보정'], roles: ADMIN_HQ },
  { id: 'i4', category: '재고', question: '매장 간 재고 이동은?',
    answer: '재고관리 > 재고이동 또는 출고관리를 통해 매장 간 재고를 이동할 수 있습니다.\n\n출고요청 → 승인 → 출고 → 입고확인 순서로 진행됩니다.',
    keywords: ['이동', '매장간', '이관', '배분', '재분배'], roles: ADMIN_HQ_STORE },
  { id: 'i5', category: '재고', question: '입고 처리는 어떻게 하나요?',
    answer: '재고관리 > 입고관리 페이지에서 입고를 등록합니다.\n\n생산 완료 후 입고, 반품 입고, 매장에서 본사로의 회수 입고 등 다양한 입고 유형을 지원합니다.',
    keywords: ['입고', '처리', '등록', '입하', '수령'], roles: ADMIN_HQ_STORE },
  { id: 'i6', category: '재고', question: '데드스톡이 뭔가요?',
    answer: '오랫동안 판매되지 않고 쌓여 있는 재고입니다.\n\n시스템 설정의 DEAD_STOCK_DEFAULT_MIN_AGE_YEARS 값(기본 2년)보다 오래된 재고가 데드스톡으로 분류됩니다.\n\nMD분석의 완판율 분석에서 데드스톡 현황을 확인할 수 있습니다.',
    keywords: ['데드스톡', '장기재고', '미판매', '체류', '사장'], roles: ADMIN_HQ },

  // ── 판매관리 (ALL) ──
  { id: 's1', category: '판매', question: '매출을 등록하려면?',
    answer: '판매관리 > 매출등록 페이지에서 바코드 스캔 또는 상품 검색으로 매출을 등록합니다.\n\n결제수단(현금/카드/기타)을 선택하고, 할인이 있으면 할인금액을 입력합니다.',
    keywords: ['매출', '등록', '판매', '결제', '거래'], roles: ALL },
  { id: 's2', category: '판매', question: '반품 처리는 어떻게?',
    answer: '판매관리 > 매출등록에서 반품을 처리할 수 있습니다.\n\n원래 매출 건을 찾아 반품 처리하면 재고가 자동으로 복원됩니다.\n반품 처리는 매장관리자(STORE_MANAGER) 이상 권한이 필요합니다.',
    keywords: ['반품', '환불', '취소', '교환', '되돌리기'], roles: ADMIN_HQ_STORE },
  { id: 's3', category: '판매', question: '매출 통계를 보려면?',
    answer: '판매분석 페이지에서 기간별, 매장별, 카테고리별 매출 통계를 확인할 수 있습니다.\n\n일별/주별/월별 추이 차트와 상세 데이터 테이블을 제공합니다.',
    keywords: ['매출', '통계', '분석', '조회', '리포트', '보고서'], roles: ADMIN_HQ_STORE },
  { id: 's4', category: '판매', question: '할인/행사가는 어떻게 적용하나요?',
    answer: 'MD관리 > 마크다운 스케줄에서 할인 스케줄을 생성하고 적용합니다.\n\n1. 스케줄 생성 (시즌, 할인율, 기간 설정)\n2. 대상 상품 선택\n3. [적용] 버튼 → 상품에 행사가 반영\n4. 행사 종료 시 [복원] → 원래 가격 복원',
    keywords: ['할인', '행사', '세일', '프로모션', '마크다운', '적용'], roles: ADMIN_HQ },
  { id: 's5', category: '판매', question: '매장직원(STORE_STAFF)이 할 수 있는 건?',
    answer: '매장직원은 다음 기능을 사용할 수 있습니다:\n\n- 매출 등록 (바코드 스캔)\n- 재고 조회 (읽기 전용)\n- 고객 조회\n\n반품, 매출 수정, 재고 조정 등은 매장관리자 이상 권한이 필요합니다.',
    keywords: ['직원', '권한', 'STAFF', '할수있는', '기능', '제한'], roles: ALL },

  // ── 출고관리 (ADMIN_HQ_STORE) ──
  { id: 'sh1', category: '출고', question: '출고 프로세스가 어떻게 되나요?',
    answer: '본사 → 매장 상품 배송 프로세스:\n\n1. 출고요청: 매장이 필요 상품 요청\n2. 승인: 본사에서 요청 확인 후 승인\n3. 출고: 본사 창고에서 출고 처리\n4. 입고확인: 매장에서 수령 후 입고 확인\n\n각 단계에서 재고가 자동으로 조정됩니다.',
    keywords: ['출고', '프로세스', '배송', '절차', '흐름'], roles: ADMIN_HQ_STORE },
  { id: 'sh2', category: '출고', question: '출고 요청은 어디서?',
    answer: '출고관리 > 출고요청 페이지에서 요청합니다.\n\n매장관리자가 필요한 상품과 수량을 선택하여 요청하면, 본사에서 승인/반려합니다.',
    keywords: ['출고요청', '요청', '신청', '주문'], roles: ADMIN_HQ_STORE },
  { id: 'sh3', category: '출고', question: '입고 확인은 어떻게?',
    answer: '출고관리 > 입고확인 페이지에서 본사로부터 받은 상품을 확인합니다.\n\n바코드 스캔으로 수량을 확인하고, [입고확인] 버튼을 누르면 매장 재고에 반영됩니다.',
    keywords: ['입고확인', '수령', '확인', '도착'], roles: ADMIN_HQ_STORE },

  // ── 생산관리 (ADMIN_ONLY) ──
  { id: 'pr1', category: '생산', question: '생산의뢰는 어떻게 하나요?',
    answer: '생산관리 > 생산의뢰 페이지에서 의뢰를 등록합니다.\n\n거래처(생산처), 상품, 수량, 납기일을 입력하고 의뢰를 생성합니다.\n의뢰 상태: 작성 → 진행중 → 완료',
    keywords: ['생산', '의뢰', '발주', '주문', '오더'], roles: ADMIN_ONLY },
  { id: 'pr2', category: '생산', question: '생산 진행 상태를 확인하려면?',
    answer: '생산관리 > 생산현황 페이지에서 전체 생산 현황을 모니터링할 수 있습니다.\n\n거래처별, 상품별 진행률과 납기 준수 현황을 확인합니다.',
    keywords: ['생산현황', '진행', '상태', '모니터링', '추적'], roles: ADMIN_ONLY },
  { id: 'pr3', category: '생산', question: '외주(디자인) 관리는?',
    answer: '외주관리 페이지에서 디자인 외주 업무를 관리합니다.\n\n- 브리프 등록: 디자인 요청사항 작성\n- 디자인 리뷰: 제출된 시안 검토/승인\n- 결제 관리: 외주비 관리\n\n외주 담당자(OUTSOURCE) 권한으로 접근합니다.',
    keywords: ['외주', '디자인', '브리프', '시안', '아웃소싱'], roles: [...ADMIN_HQ, 'OUTSOURCE_DESIGNER'] },

  // ── MD분석 (ADMIN_HQ) ──
  { id: 'md1', category: 'MD분석', question: 'ABC 분석이 뭔가요?',
    answer: 'ABC 분석은 상품을 매출 기여도에 따라 3등급으로 분류합니다.\n\n- A등급: 매출 상위 70% 차지 (소수 핵심 상품)\n- B등급: 매출 70~90% 구간\n- C등급: 매출 하위 10% (다수의 비주력 상품)\n\n파레토 법칙: 소수의 상품(보통 20~30%)이 전체 매출의 70%를 만듭니다.\n\n기준값은 설정에서 조정할 수 있습니다.',
    keywords: ['ABC', '분석', '등급', '파레토', '기여도', '핵심상품'], roles: ADMIN_HQ },
  { id: 'md2', category: 'MD분석', question: '시즌 성과 분석은?',
    answer: '시즌별(SS/SM/FW/WN) 판매 실적을 분석합니다.\n\n- 목표 대비 달성률 (스타일수, 수량, 매출)\n- 전년 동기 대비 성장률\n- 잔여 재고 현황\n- 시즌 소진율\n\n시스템 > 시즌 관리에서 시즌별 목표를 설정할 수 있습니다.',
    keywords: ['시즌', '성과', '목표', '달성률', '계절'], roles: ADMIN_HQ },
  { id: 'md3', category: 'MD분석', question: '마크다운 효과는 뭘 보여주나요?',
    answer: '할인(마크다운) 적용 전후의 판매 변화를 분석합니다.\n\n- 할인 후 판매속도 변화: 할인 전/후 일일 판매량 비교\n- 비할인 상품과 비교: 시장 추세를 보정한 순수 할인 효과\n- 재고 소진율: 할인으로 인한 재고 소진 속도\n\n비할인 상품 대비 판매가 더 늘었다면 할인 효과가 있는 것입니다.',
    keywords: ['마크다운', '효과', '할인효과', '비교', '대조군'], roles: ADMIN_HQ },
  { id: 'md4', category: 'MD분석', question: '완판율(Sell-Through)이 뭔가요?',
    answer: '입고 수량 대비 판매된 비율입니다.\n\n완판율 = 판매수량 ÷ (판매수량 + 잔여재고) × 100\n\n- 80% 이상: 우수 (추가 생산 검토)\n- 50~80%: 보통\n- 50% 미만: 저조 (할인/이동 검토)\n\n완판율 분석 페이지에서 상품별, 카테고리별로 확인할 수 있습니다.',
    keywords: ['완판율', '판매율', '소진율', 'sell-through', '소화율'], roles: ADMIN_HQ },
  { id: 'md5', category: 'MD분석', question: '마진 분석은 어떻게 보나요?',
    answer: 'MD분석 > 마진분석 탭에서 확인합니다.\n\n- 마진율 = (판매가 - 원가) ÷ 판매가 × 100\n- 카테고리별 평균 마진율\n- 할인 적용 시 마진 영향도\n\n원가(cost_price)가 등록된 상품만 분석 대상입니다.',
    keywords: ['마진', '이익', '수익률', '원가', '마진율'], roles: ADMIN_HQ },
  { id: 'md6', category: 'MD분석', question: '사이즈/컬러 트렌드 분석은?',
    answer: 'MD분석 > 사이즈·컬러 트렌드 탭에서 확인합니다.\n\n- 사이즈별 판매 비중과 추이\n- 컬러별 판매 비중과 추이\n- 카테고리×사이즈, 카테고리×컬러 크로스 분석\n\n최적의 사이즈 비율과 인기 컬러를 파악하여 생산 계획에 반영할 수 있습니다.',
    keywords: ['사이즈', '컬러', '트렌드', '비중', '인기'], roles: ADMIN_HQ },
  { id: 'md7', category: 'MD분석', question: '마크다운 스케줄은 어떻게 관리하나요?',
    answer: 'MD관리 > 마크다운 스케줄 페이지에서 관리합니다.\n\n1. [새 스케줄] → 스케줄명, 시즌, 할인율 설정\n2. 대상 상품 선택 (추천 기능 활용 가능)\n3. DRAFT 상태에서 수정/삭제 가능\n4. [적용] → 상품에 행사가 반영\n5. [복원] → 행사 종료 시 원래 가격 복원\n\n추천 기능: 재고 많고 판매 적은 상품을 자동 추천합니다.',
    keywords: ['마크다운', '스케줄', '행사', '관리', '적용', '복원'], roles: ADMIN_HQ },

  // ── 고객관리 (ADMIN_HQ_STORE) ──
  { id: 'c1', category: '고객', question: '고객을 어떻게 등록하나요?',
    answer: '고객관리 > 고객등록 페이지에서 등록합니다.\n\n필수: 이름, 연락처\n선택: 이메일, 생년월일, 주소, 메모\n\n매출 등록 시에도 신규 고객을 바로 등록할 수 있습니다.',
    keywords: ['고객', '등록', '회원', '신규', '추가'], roles: ADMIN_HQ_STORE },
  { id: 'c2', category: '고객', question: '고객 등급은 어떻게 매겨지나요?',
    answer: '고객 등급은 구매 금액 기준으로 자동 분류됩니다.\n\n- VIP: 누적 구매 100만원 이상\n- GOLD: 50만원 이상\n- SILVER: 20만원 이상\n- NORMAL: 기본\n\n등급 기준은 시스템 설정에서 조정할 수 있습니다.',
    keywords: ['등급', '회원등급', 'VIP', 'GOLD', '기준', '분류'], roles: ADMIN_HQ_STORE },
  { id: 'c3', category: '고객', question: '포인트 시스템은?',
    answer: '구매 금액의 일정 비율이 포인트로 적립됩니다.\n\n- 적립률은 고객 등급별로 다르게 설정 가능\n- 포인트 사용 시 결제금액에서 차감\n- 유효기간 관리\n\n고객관리 > 포인트 내역에서 적립/사용 이력을 확인합니다.',
    keywords: ['포인트', '적립', '사용', '마일리지', '혜택'], roles: ADMIN_HQ_STORE },
  { id: 'c4', category: '고객', question: '고객 데이터를 분석하려면?',
    answer: '고객관리(본사: 고객 데이터) 페이지에서 분석할 수 있습니다.\n\n- 등급별 고객 분포\n- 구매 빈도 분석\n- 매장별 고객 현황\n- 최근 방문/구매 이력',
    keywords: ['고객분석', '데이터', 'CRM', '구매패턴', '분석'], roles: ADMIN_HQ },

  // ── 시스템 ──
  { id: 'sys1', category: '시스템', question: '비밀번호를 변경하려면?',
    answer: '상단 우측의 사용자 이름을 클릭 → [내 정보 수정]에서 비밀번호를 변경할 수 있습니다.\n\n비밀번호는 8자 이상이어야 합니다.',
    keywords: ['비밀번호', '변경', '수정', '패스워드', '암호'], roles: ALL },
  { id: 'sys2', category: '시스템', question: '사용자 권한은 어떻게 관리하나요?',
    answer: '시스템 > 사용자 관리(관리자 전용)에서 관리합니다.\n\n역할 종류:\n- ADMIN: 전체 시스템 관리\n- SYS_ADMIN: 시스템 설정 관리\n- HQ_MANAGER: 본사 업무\n- STORE_MANAGER: 매장 운영\n- STORE_STAFF: 매출등록/조회\n\n메뉴별 접근 권한을 세밀하게 설정할 수 있습니다.',
    keywords: ['권한', '역할', '사용자', '관리자', 'ADMIN', '접근'], roles: ADMIN_SYS },
  { id: 'sys3', category: '시스템', question: '코드관리가 뭔가요?',
    answer: '시스템 > 코드관리에서 ERP 전반에서 사용되는 코드를 관리합니다.\n\n관리 가능한 코드:\n- CATEGORY: 상품 카테고리\n- BRAND: 브랜드\n- COLOR: 컬러\n- SIZE: 사이즈\n- SEASON: 시즌\n- YEAR: 연도\n- SHIPMENT_TYPE: 출고유형 등\n\n코드를 추가/수정하면 해당 코드를 사용하는 모든 페이지에 즉시 반영됩니다.',
    keywords: ['코드', '관리', '마스터코드', '공통코드', '설정'], roles: ADMIN_SYS },
  { id: 'sys4', category: '시스템', question: '거래처를 등록하려면?',
    answer: '시스템 > 거래처관리에서 등록합니다.\n\n거래처 유형: 생산처, 원단처, 매장 등\n필수: 거래처코드, 거래처명, 유형\n선택: 연락처, 주소, 담당자, 메모\n\n매장으로 등록된 거래처는 재고/출고/판매 관리에 연결됩니다.',
    keywords: ['거래처', '파트너', '등록', '업체', '매장등록'], roles: ADMIN_HQ },
  { id: 'sys5', category: '시스템', question: '시스템 설정에서 뭘 바꿀 수 있나요?',
    answer: '시스템 > 시스템 설정에서 ERP 전반의 설정값을 조정합니다.\n\n주요 설정:\n- 재고 경고 임계값 (안전재고 기준)\n- 데드스톡 판정 기간\n- ABC 분석 기준 (A/B 등급 비율)\n- 시즌 가중치\n- 매출 분석 기간\n\n관리자(ADMIN, SYS_ADMIN)만 접근 가능합니다.',
    keywords: ['설정', '시스템설정', '환경설정', '임계값', '기준값'], roles: ADMIN_SYS },
  { id: 'sys6', category: '시스템', question: '대시보드에는 뭐가 있나요?',
    answer: '로그인 후 첫 화면인 대시보드에서 주요 현황을 한눈에 확인합니다.\n\n- 오늘/이번 주/이번 달 매출 요약\n- 재고 경고 (부족/과잉)\n- 미처리 건수 (출고요청, 생산의뢰 등)\n- 매장별 매출 순위\n\n역할에 따라 표시되는 정보가 다릅니다.',
    keywords: ['대시보드', '홈', '메인', '요약', '현황'], roles: ALL },
  { id: 'sys7', category: '시스템', question: '데이터를 엑셀로 내려받으려면?',
    answer: '대부분의 목록 페이지에서 우측 상단의 [엑셀 다운로드] 또는 [내보내기] 버튼을 사용합니다.\n\n현재 필터링된 데이터가 엑셀 파일로 다운로드됩니다.',
    keywords: ['엑셀', '다운로드', '내보내기', '출력', 'Excel', 'CSV'], roles: ALL },
  { id: 'sys8', category: '시스템', question: '여러 매장을 관리하려면?',
    answer: '본사 계정(HQ_MANAGER 이상)으로 모든 매장의 데이터를 조회할 수 있습니다.\n\n- 재고현황: 매장 필터로 특정 매장 재고 확인\n- 판매분석: 매장별 매출 비교\n- 출고관리: 매장별 출고/입고 관리\n\n매장 계정은 자기 매장 데이터만 접근 가능합니다.',
    keywords: ['매장', '다매장', '본사', '지점', '관리'], roles: ADMIN_HQ },
];

/** FAQ 인기 질문 ID (역할 필터 후 표시) */
export const popularFaqIds = ['s1', 'i1', 'p3', 'sys1', 'sys6'];

/** 역할 기반 FAQ 필터 */
export function getFilteredFaqs(role: string): FaqItem[] {
  return faqData.filter(f => f.roles.includes(role));
}

/** 역할 기반 카테고리 목록 */
export function getFilteredCategories(role: string): string[] {
  const cats = new Set(getFilteredFaqs(role).map(f => f.category));
  return ['전체', ...FAQ_CATEGORIES.filter(c => c !== '전체' && cats.has(c))];
}

/** 키워드 매칭 검색 (역할 필터 적용) */
export function searchFaq(query: string, role: string, category?: string): FaqItem[] {
  const q = query.trim().toLowerCase();
  const pool = getFilteredFaqs(role).filter(f => !category || category === '전체' || f.category === category);
  if (!q) return category && category !== '전체' ? pool : [];

  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = pool.map(faq => {
    let score = 0;
    const haystack = [...faq.keywords, ...faq.question.toLowerCase().split(/\s+/)];
    for (const tok of tokens) {
      if (haystack.some(k => k === tok)) { score += 3; continue; }
      if (haystack.some(k => k.includes(tok) || tok.includes(k))) { score += 1; continue; }
      if (faq.question.toLowerCase().includes(tok)) { score += 1; continue; }
      if (faq.answer.toLowerCase().includes(tok)) { score += 0.5; }
    }
    return { faq, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.faq);
}
