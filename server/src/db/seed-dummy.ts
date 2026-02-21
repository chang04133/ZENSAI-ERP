import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

/**
 * 더미 데이터 시드 - 개발/테스트용
 * 거래처, 사용자, 상품, 상품변형, 출고의뢰, 재고, 판매(4개년) 데이터를 삽입
 */
export async function seedDummyData(pool: Pool): Promise<void> {
  // 이미 충분한 판매 데이터가 있으면 스킵
  const check = await pool.query("SELECT COUNT(*) FROM sales");
  if (parseInt(check.rows[0].count, 10) >= 500) {
    console.log('더미 데이터 이미 존재 - 스킵');
    return;
  }

  console.log('더미 데이터 삽입 시작 (기존 데이터 초기화)...');

  // 기존 데이터 정리 (역순 - FK 제약 고려)
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM inventory_transactions');
  await pool.query('DELETE FROM sales');
  await pool.query('DELETE FROM shipment_request_items');
  await pool.query('DELETE FROM shipment_requests');
  await pool.query('DELETE FROM inventory');
  await pool.query('DELETE FROM product_variants');
  await pool.query('DELETE FROM products WHERE product_code != \'ZS-DEL01\'');
  await pool.query('DELETE FROM refresh_tokens');
  await pool.query('DELETE FROM users WHERE user_id NOT IN (\'admin\')');
  await pool.query('DELETE FROM partners WHERE partner_code NOT IN (SELECT DISTINCT partner_code FROM users WHERE partner_code IS NOT NULL)');
  console.log('  기존 더미 데이터 정리 완료');

  // ──────────────── 1. 거래처 (10개) ────────────────
  await pool.query(`
    INSERT INTO partners (partner_code, partner_name, business_number, representative, address, contact, partner_type) VALUES
      ('P001', '젠사이 본사', '110-81-00001', '김대표', '서울시 강남구 테헤란로 123', '02-1234-5678', '직영'),
      ('P002', '강남 직영점', '110-81-00002', '이점장', '서울시 강남구 압구정로 45', '02-2345-6789', '직영'),
      ('P003', '홍대 직영점', '110-81-00003', '박점장', '서울시 마포구 와우산로 78', '02-3456-7890', '직영'),
      ('P004', '부산 가맹점', '602-81-00004', '최사장', '부산시 해운대구 센텀로 56', '051-456-7890', '가맹'),
      ('P005', '대구 가맹점', '503-81-00005', '정사장', '대구시 동구 동대구로 34', '053-567-8901', '가맹'),
      ('P006', '대전 가맹점', '305-81-00006', '한사장', '대전시 서구 둔산로 67', '042-678-9012', '가맹'),
      ('P007', '인천 가맹점', '131-81-00007', '윤사장', '인천시 연수구 센트럴로 89', '032-789-0123', '가맹'),
      ('P008', '젠사이 공식몰', '110-81-00008', '김대표', '서울시 강남구 테헤란로 123', '02-1234-5679', '온라인'),
      ('P009', '무신사 입점', '110-81-00009', '김대표', '서울시 강남구 테헤란로 123', '02-1234-5680', '온라인'),
      ('P010', '29CM 입점', '110-81-00010', '김대표', '서울시 강남구 테헤란로 123', '02-1234-5681', '온라인')
    ON CONFLICT (partner_code) DO NOTHING;
  `);
  console.log('  거래처 10개 삽입');

  // ──────────────── 2. 사용자 (6개) ────────────────
  const hash = await bcrypt.hash('test1234!', 12);
  const roles = await pool.query('SELECT group_id, group_name FROM role_groups');
  const roleMap: Record<string, number> = {};
  roles.rows.forEach((r: any) => { roleMap[r.group_name] = r.group_id; });

  const users: [string, string, string, string][] = [
    ['hq_mgr', '본사매니저', 'P001', 'HQ_MANAGER'],
    ['gangnam', '강남점장', 'P002', 'STORE_MANAGER'],
    ['hongdae', '홍대점장', 'P003', 'STORE_MANAGER'],
    ['busan', '부산점장', 'P004', 'STORE_MANAGER'],
    ['daegu', '대구직원', 'P005', 'STORE_STAFF'],
    ['online', '온라인담당', 'P008', 'HQ_MANAGER'],
  ];
  for (const [uid, uname, pcode, roleName] of users) {
    await pool.query(
      `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING`,
      [uid, uname, pcode, roleMap[roleName], hash],
    );
  }
  console.log('  사용자 6개 삽입 (비밀번호: test1234!)');

  // ──────────────── 3. 상품 (25개 + 가격/세부카테고리 포함) ────────────────
  await pool.query(`
    INSERT INTO products (product_code, product_name, category, sub_category, brand, season, base_price, discount_price, event_price, cost_price, fit, length) VALUES
      ('ZS26SS-T001', '오버핏 코튼 티셔츠', 'TOP', 'SHORT_SLEEVE', 'ZENSAI', '2026SA', 49000, 39000, 29000, 18000, '오버핏', '레귤러'),
      ('ZS26SS-T002', '슬림핏 스트라이프 셔츠', 'TOP', 'LONG_SLEEVE', 'ZENSAI', '2026SA', 69000, 55000, 45000, 25000, '슬림핏', '레귤러'),
      ('ZS26SS-T003', '크롭 니트 탑', 'TOP', 'KNIT', 'ZENSAI', '2026SM', 59000, 47000, 35000, 22000, '레귤러핏', '크롭'),
      ('ZS26SA-T004', '오버사이즈 후디', 'TOP', 'HOODIE', 'ZENSAI', '2026SA', 79000, 63000, 49000, 29000, '오버사이즈핏', '레귤러'),
      ('ZS26SA-T005', '크루넥 맨투맨', 'TOP', 'SWEATSHIRT', 'ZENSAI', '2026SA', 59000, 47000, 35000, 21000, '세미오버핏', '레귤러'),
      ('ZS26SS-B001', '와이드 데님 팬츠', 'BOTTOM', 'JEANS', 'ZENSAI', '2026SA', 89000, 71000, 59000, 32000, '와이드핏', '롱'),
      ('ZS26SS-B002', '테이퍼드 슬랙스', 'BOTTOM', 'SLACKS', 'ZENSAI', '2026SA', 79000, 63000, 49000, 28000, '테이퍼드핏', '레귤러'),
      ('ZS26SS-B003', '플리츠 미디스커트', 'BOTTOM', 'SKIRT', 'ZENSAI', '2026SM', 65000, 52000, 39000, 24000, '레귤러핏', '레귤러'),
      ('ZS26SA-B004', '부츠컷 데님 팬츠', 'BOTTOM', 'JEANS', 'ZENSAI', '2026SA', 95000, 76000, 62000, 34000, '부츠컷핏', '롱'),
      ('ZS26SS-O001', '린넨 블렌드 재킷', 'OUTER', 'JACKET', 'ZENSAI', '2026SM', 159000, 127000, 99000, 58000, '레귤러핏', '숏'),
      ('ZS26SS-O002', '라이트 트렌치코트', 'OUTER', 'COAT', 'ZENSAI', '2026SA', 189000, 151000, 119000, 68000, '오버핏', '롱'),
      ('ZS26SS-D001', '플라워 프린트 원피스', 'DRESS', 'LONG_DRESS', 'ZENSAI', '2026SM', 119000, 95000, 79000, 42000, '레귤러핏', '롱'),
      ('ZS26SS-D002', '리넨 셔츠 원피스', 'DRESS', 'LONG_DRESS', 'ZENSAI', '2026SM', 99000, 79000, 59000, 36000, '오버사이즈핏', '롱'),
      ('ZS26SM-D003', '미니 플레어 원피스', 'DRESS', 'MINI_DRESS', 'ZENSAI', '2026SM', 89000, 71000, 55000, 32000, '레귤러핏', '숏'),
      ('ZS25FW-T001', '캐시미어 블렌드 니트', 'TOP', 'KNIT', 'ZENSAI', '2025WN', 89000, 71000, 55000, 32000, '세미오버핏', '레귤러'),
      ('ZS25FW-T002', '터틀넥 울 니트', 'TOP', 'KNIT', 'ZENSAI', '2025WN', 99000, 79000, 59000, 36000, '레귤러핏', '레귤러'),
      ('ZS25FW-O001', '울 더블 코트', 'OUTER', 'COAT', 'ZENSAI', '2025WN', 289000, 231000, 189000, 105000, '레귤러핏', '롱'),
      ('ZS25FW-O002', '패딩 점퍼', 'OUTER', 'PADDING', 'ZENSAI', '2025WN', 239000, 191000, 149000, 88000, '오버핏', '숏'),
      ('ZS25WN-O003', '레더 바이커 자켓', 'OUTER', 'JACKET', 'ZENSAI', '2025WN', 199000, 159000, 129000, 72000, '슬림핏', '숏'),
      ('ZS25FW-B001', '기모 스트레이트 팬츠', 'BOTTOM', 'SLACKS', 'ZENSAI', '2025WN', 79000, 63000, 49000, 28000, '스트레이트핏', '레귤러'),
      ('ZS25SA-T003', '스트라이프 반팔 티', 'TOP', 'SHORT_SLEEVE', 'ZENSAI', '2025SA', 45000, 36000, 27000, 16000, '레귤러핏', '레귤러'),
      ('ZS25SA-B002', '와이드 코튼 팬츠', 'BOTTOM', 'SLACKS', 'ZENSAI', '2025SA', 75000, 60000, 45000, 27000, '와이드핏', '레귤러'),
      ('ZS25SA-D001', '셔링 미디 원피스', 'DRESS', 'LONG_DRESS', 'ZENSAI', '2025SA', 109000, 87000, 69000, 39000, '레귤러핏', '롱'),
      ('ZS26SS-A001', '레더 미니 백', 'ACC', 'BAG', 'ZENSAI', '2026SA', 129000, 103000, 79000, 45000, NULL, NULL),
      ('ZS26SA-A002', '코튼 버킷햇', 'ACC', 'HAT', 'ZENSAI', '2026SA', 35000, 28000, 22000, 12000, NULL, NULL),
      ('ZS26SA-A003', '레더 스퀘어 벨트', 'ACC', 'BELT', 'ZENSAI', '2026SA', 49000, 39000, 29000, 17000, NULL, NULL)
    ON CONFLICT (product_code) DO UPDATE SET
      discount_price = EXCLUDED.discount_price,
      event_price = EXCLUDED.event_price,
      cost_price = EXCLUDED.cost_price,
      fit = EXCLUDED.fit,
      length = EXCLUDED.length,
      sub_category = EXCLUDED.sub_category;
  `);
  console.log('  상품 26개 삽입 (할인가/행사가/세부카테고리 포함)');

  // ──────────────── 4. 상품 변형 (SKU) ────────────────
  const variants: [string, string, string, string, number][] = [
    // T001 - 오버핏 코튼 티셔츠 (3색 x 4사이즈)
    ['ZS26SS-T001', '블랙', 'S', 'ZS26SS-T001-BK-S', 49000],
    ['ZS26SS-T001', '블랙', 'M', 'ZS26SS-T001-BK-M', 49000],
    ['ZS26SS-T001', '블랙', 'L', 'ZS26SS-T001-BK-L', 49000],
    ['ZS26SS-T001', '블랙', 'XL', 'ZS26SS-T001-BK-XL', 49000],
    ['ZS26SS-T001', '화이트', 'S', 'ZS26SS-T001-WH-S', 49000],
    ['ZS26SS-T001', '화이트', 'M', 'ZS26SS-T001-WH-M', 49000],
    ['ZS26SS-T001', '화이트', 'L', 'ZS26SS-T001-WH-L', 49000],
    ['ZS26SS-T001', '화이트', 'XL', 'ZS26SS-T001-WH-XL', 49000],
    ['ZS26SS-T001', '네이비', 'S', 'ZS26SS-T001-NV-S', 49000],
    ['ZS26SS-T001', '네이비', 'M', 'ZS26SS-T001-NV-M', 49000],
    ['ZS26SS-T001', '네이비', 'L', 'ZS26SS-T001-NV-L', 49000],
    ['ZS26SS-T001', '네이비', 'XL', 'ZS26SS-T001-NV-XL', 49000],
    // T002
    ['ZS26SS-T002', '화이트', 'S', 'ZS26SS-T002-WH-S', 69000],
    ['ZS26SS-T002', '화이트', 'M', 'ZS26SS-T002-WH-M', 69000],
    ['ZS26SS-T002', '화이트', 'L', 'ZS26SS-T002-WH-L', 69000],
    ['ZS26SS-T002', '블루', 'S', 'ZS26SS-T002-BL-S', 69000],
    ['ZS26SS-T002', '블루', 'M', 'ZS26SS-T002-BL-M', 69000],
    ['ZS26SS-T002', '블루', 'L', 'ZS26SS-T002-BL-L', 69000],
    // T003
    ['ZS26SS-T003', '베이지', 'S', 'ZS26SS-T003-BG-S', 59000],
    ['ZS26SS-T003', '베이지', 'M', 'ZS26SS-T003-BG-M', 59000],
    ['ZS26SS-T003', '블랙', 'S', 'ZS26SS-T003-BK-S', 59000],
    ['ZS26SS-T003', '블랙', 'M', 'ZS26SS-T003-BK-M', 59000],
    // B001
    ['ZS26SS-B001', '블루', 'S', 'ZS26SS-B001-BL-S', 89000],
    ['ZS26SS-B001', '블루', 'M', 'ZS26SS-B001-BL-M', 89000],
    ['ZS26SS-B001', '블루', 'L', 'ZS26SS-B001-BL-L', 89000],
    ['ZS26SS-B001', '블랙', 'S', 'ZS26SS-B001-BK-S', 89000],
    ['ZS26SS-B001', '블랙', 'M', 'ZS26SS-B001-BK-M', 89000],
    ['ZS26SS-B001', '블랙', 'L', 'ZS26SS-B001-BK-L', 89000],
    // B002
    ['ZS26SS-B002', '블랙', 'S', 'ZS26SS-B002-BK-S', 79000],
    ['ZS26SS-B002', '블랙', 'M', 'ZS26SS-B002-BK-M', 79000],
    ['ZS26SS-B002', '블랙', 'L', 'ZS26SS-B002-BK-L', 79000],
    ['ZS26SS-B002', '그레이', 'S', 'ZS26SS-B002-GR-S', 79000],
    ['ZS26SS-B002', '그레이', 'M', 'ZS26SS-B002-GR-M', 79000],
    ['ZS26SS-B002', '그레이', 'L', 'ZS26SS-B002-GR-L', 79000],
    // B003
    ['ZS26SS-B003', '베이지', 'S', 'ZS26SS-B003-BG-S', 65000],
    ['ZS26SS-B003', '베이지', 'M', 'ZS26SS-B003-BG-M', 65000],
    ['ZS26SS-B003', '블랙', 'S', 'ZS26SS-B003-BK-S', 65000],
    ['ZS26SS-B003', '블랙', 'M', 'ZS26SS-B003-BK-M', 65000],
    // O001
    ['ZS26SS-O001', '베이지', 'S', 'ZS26SS-O001-BG-S', 159000],
    ['ZS26SS-O001', '베이지', 'M', 'ZS26SS-O001-BG-M', 159000],
    ['ZS26SS-O001', '베이지', 'L', 'ZS26SS-O001-BG-L', 159000],
    ['ZS26SS-O001', '네이비', 'S', 'ZS26SS-O001-NV-S', 159000],
    ['ZS26SS-O001', '네이비', 'M', 'ZS26SS-O001-NV-M', 159000],
    ['ZS26SS-O001', '네이비', 'L', 'ZS26SS-O001-NV-L', 159000],
    // O002
    ['ZS26SS-O002', '베이지', 'S', 'ZS26SS-O002-BG-S', 189000],
    ['ZS26SS-O002', '베이지', 'M', 'ZS26SS-O002-BG-M', 189000],
    ['ZS26SS-O002', '블랙', 'S', 'ZS26SS-O002-BK-S', 189000],
    ['ZS26SS-O002', '블랙', 'M', 'ZS26SS-O002-BK-M', 189000],
    // D001
    ['ZS26SS-D001', '블루', 'S', 'ZS26SS-D001-BL-S', 119000],
    ['ZS26SS-D001', '블루', 'M', 'ZS26SS-D001-BL-M', 119000],
    ['ZS26SS-D001', '레드', 'S', 'ZS26SS-D001-RD-S', 119000],
    ['ZS26SS-D001', '레드', 'M', 'ZS26SS-D001-RD-M', 119000],
    // D002
    ['ZS26SS-D002', '화이트', 'S', 'ZS26SS-D002-WH-S', 99000],
    ['ZS26SS-D002', '화이트', 'M', 'ZS26SS-D002-WH-M', 99000],
    ['ZS26SS-D002', '베이지', 'S', 'ZS26SS-D002-BG-S', 99000],
    ['ZS26SS-D002', '베이지', 'M', 'ZS26SS-D002-BG-M', 99000],
    // FW 시즌
    ['ZS25FW-T001', '블랙', 'M', 'ZS25FW-T001-BK-M', 89000],
    ['ZS25FW-T001', '블랙', 'L', 'ZS25FW-T001-BK-L', 89000],
    ['ZS25FW-T001', '그레이', 'M', 'ZS25FW-T001-GR-M', 89000],
    ['ZS25FW-T001', '그레이', 'L', 'ZS25FW-T001-GR-L', 89000],
    ['ZS25FW-O001', '블랙', 'M', 'ZS25FW-O001-BK-M', 289000],
    ['ZS25FW-O001', '블랙', 'L', 'ZS25FW-O001-BK-L', 289000],
    ['ZS25FW-O001', '네이비', 'M', 'ZS25FW-O001-NV-M', 289000],
    ['ZS25FW-O001', '네이비', 'L', 'ZS25FW-O001-NV-L', 289000],
    ['ZS25FW-O002', '블랙', 'M', 'ZS25FW-O002-BK-M', 239000],
    ['ZS25FW-O002', '블랙', 'L', 'ZS25FW-O002-BK-L', 239000],
    ['ZS25FW-B001', '블랙', 'M', 'ZS25FW-B001-BK-M', 79000],
    ['ZS25FW-B001', '블랙', 'L', 'ZS25FW-B001-BK-L', 79000],
    ['ZS25FW-B001', '네이비', 'M', 'ZS25FW-B001-NV-M', 79000],
    ['ZS25FW-B001', '네이비', 'L', 'ZS25FW-B001-NV-L', 79000],
    // A001
    ['ZS26SS-A001', '블랙', 'FREE', 'ZS26SS-A001-BK-FREE', 129000],
    ['ZS26SS-A001', '베이지', 'FREE', 'ZS26SS-A001-BG-FREE', 129000],
    ['ZS26SS-A001', '레드', 'FREE', 'ZS26SS-A001-RD-FREE', 129000],
    // ── 추가 상품 변형 ──
    // T004 - 오버사이즈 후디
    ['ZS26SA-T004', '블랙', 'M', 'ZS26SA-T004-BK-M', 79000],
    ['ZS26SA-T004', '블랙', 'L', 'ZS26SA-T004-BK-L', 79000],
    ['ZS26SA-T004', '그레이', 'M', 'ZS26SA-T004-GR-M', 79000],
    ['ZS26SA-T004', '그레이', 'L', 'ZS26SA-T004-GR-L', 79000],
    ['ZS26SA-T004', '네이비', 'M', 'ZS26SA-T004-NV-M', 79000],
    ['ZS26SA-T004', '네이비', 'L', 'ZS26SA-T004-NV-L', 79000],
    // T005 - 크루넥 맨투맨
    ['ZS26SA-T005', '블랙', 'M', 'ZS26SA-T005-BK-M', 59000],
    ['ZS26SA-T005', '블랙', 'L', 'ZS26SA-T005-BK-L', 59000],
    ['ZS26SA-T005', '화이트', 'M', 'ZS26SA-T005-WH-M', 59000],
    ['ZS26SA-T005', '화이트', 'L', 'ZS26SA-T005-WH-L', 59000],
    // B004 - 부츠컷 데님 팬츠
    ['ZS26SA-B004', '블루', 'S', 'ZS26SA-B004-BL-S', 95000],
    ['ZS26SA-B004', '블루', 'M', 'ZS26SA-B004-BL-M', 95000],
    ['ZS26SA-B004', '블루', 'L', 'ZS26SA-B004-BL-L', 95000],
    ['ZS26SA-B004', '블랙', 'S', 'ZS26SA-B004-BK-S', 95000],
    ['ZS26SA-B004', '블랙', 'M', 'ZS26SA-B004-BK-M', 95000],
    ['ZS26SA-B004', '블랙', 'L', 'ZS26SA-B004-BK-L', 95000],
    // D003 - 미니 플레어 원피스
    ['ZS26SM-D003', '화이트', 'S', 'ZS26SM-D003-WH-S', 89000],
    ['ZS26SM-D003', '화이트', 'M', 'ZS26SM-D003-WH-M', 89000],
    ['ZS26SM-D003', '블랙', 'S', 'ZS26SM-D003-BK-S', 89000],
    ['ZS26SM-D003', '블랙', 'M', 'ZS26SM-D003-BK-M', 89000],
    // FW T002 - 터틀넥 울 니트
    ['ZS25FW-T002', '블랙', 'M', 'ZS25FW-T002-BK-M', 99000],
    ['ZS25FW-T002', '블랙', 'L', 'ZS25FW-T002-BK-L', 99000],
    ['ZS25FW-T002', '베이지', 'M', 'ZS25FW-T002-BG-M', 99000],
    ['ZS25FW-T002', '베이지', 'L', 'ZS25FW-T002-BG-L', 99000],
    // WN O003 - 레더 바이커 자켓
    ['ZS25WN-O003', '블랙', 'S', 'ZS25WN-O003-BK-S', 199000],
    ['ZS25WN-O003', '블랙', 'M', 'ZS25WN-O003-BK-M', 199000],
    ['ZS25WN-O003', '블랙', 'L', 'ZS25WN-O003-BK-L', 199000],
    ['ZS25WN-O003', '브라운', 'M', 'ZS25WN-O003-BR-M', 199000],
    ['ZS25WN-O003', '브라운', 'L', 'ZS25WN-O003-BR-L', 199000],
    // 25SA T003 - 스트라이프 반팔 티
    ['ZS25SA-T003', '화이트', 'S', 'ZS25SA-T003-WH-S', 45000],
    ['ZS25SA-T003', '화이트', 'M', 'ZS25SA-T003-WH-M', 45000],
    ['ZS25SA-T003', '화이트', 'L', 'ZS25SA-T003-WH-L', 45000],
    ['ZS25SA-T003', '네이비', 'S', 'ZS25SA-T003-NV-S', 45000],
    ['ZS25SA-T003', '네이비', 'M', 'ZS25SA-T003-NV-M', 45000],
    ['ZS25SA-T003', '네이비', 'L', 'ZS25SA-T003-NV-L', 45000],
    // 25SA B002 - 와이드 코튼 팬츠
    ['ZS25SA-B002', '베이지', 'S', 'ZS25SA-B002-BG-S', 75000],
    ['ZS25SA-B002', '베이지', 'M', 'ZS25SA-B002-BG-M', 75000],
    ['ZS25SA-B002', '베이지', 'L', 'ZS25SA-B002-BG-L', 75000],
    ['ZS25SA-B002', '블랙', 'M', 'ZS25SA-B002-BK-M', 75000],
    ['ZS25SA-B002', '블랙', 'L', 'ZS25SA-B002-BK-L', 75000],
    // 25SA D001 - 셔링 미디 원피스
    ['ZS25SA-D001', '블루', 'S', 'ZS25SA-D001-BL-S', 109000],
    ['ZS25SA-D001', '블루', 'M', 'ZS25SA-D001-BL-M', 109000],
    ['ZS25SA-D001', '베이지', 'S', 'ZS25SA-D001-BG-S', 109000],
    ['ZS25SA-D001', '베이지', 'M', 'ZS25SA-D001-BG-M', 109000],
    // A002 - 코튼 버킷햇
    ['ZS26SA-A002', '블랙', 'FREE', 'ZS26SA-A002-BK-FREE', 35000],
    ['ZS26SA-A002', '베이지', 'FREE', 'ZS26SA-A002-BG-FREE', 35000],
    ['ZS26SA-A002', '네이비', 'FREE', 'ZS26SA-A002-NV-FREE', 35000],
    // A003 - 레더 스퀘어 벨트
    ['ZS26SA-A003', '블랙', 'FREE', 'ZS26SA-A003-BK-FREE', 49000],
    ['ZS26SA-A003', '브라운', 'FREE', 'ZS26SA-A003-BR-FREE', 49000],
  ];

  for (const [product_code, color, size, sku, price] of variants) {
    await pool.query(
      `INSERT INTO product_variants (product_code, color, size, sku, price)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sku) DO NOTHING`,
      [product_code, color, size, sku, price],
    );
  }
  console.log(`  상품변형(SKU) ${variants.length}개 삽입`);

  // variant_id 조회용 맵 생성
  const variantRows = await pool.query('SELECT variant_id, sku, product_code FROM product_variants');
  const skuMap: Record<string, number> = {};
  variantRows.rows.forEach((r: any) => { skuMap[r.sku] = r.variant_id; });

  // ──────────────── 5. 재고 데이터 ────────────────
  const inventoryData: [string, string, number][] = [
    // 본사 창고 (P001) - 대량 재고
    ['P001', 'ZS26SS-T001-BK-S', 50], ['P001', 'ZS26SS-T001-BK-M', 80], ['P001', 'ZS26SS-T001-BK-L', 60], ['P001', 'ZS26SS-T001-BK-XL', 30],
    ['P001', 'ZS26SS-T001-WH-S', 45], ['P001', 'ZS26SS-T001-WH-M', 70], ['P001', 'ZS26SS-T001-WH-L', 55], ['P001', 'ZS26SS-T001-WH-XL', 25],
    ['P001', 'ZS26SS-T001-NV-S', 40], ['P001', 'ZS26SS-T001-NV-M', 65], ['P001', 'ZS26SS-T001-NV-L', 50], ['P001', 'ZS26SS-T001-NV-XL', 20],
    ['P001', 'ZS26SS-T002-WH-S', 30], ['P001', 'ZS26SS-T002-WH-M', 50], ['P001', 'ZS26SS-T002-WH-L', 35],
    ['P001', 'ZS26SS-T002-BL-S', 25], ['P001', 'ZS26SS-T002-BL-M', 45], ['P001', 'ZS26SS-T002-BL-L', 30],
    ['P001', 'ZS26SS-B001-BL-S', 35], ['P001', 'ZS26SS-B001-BL-M', 55], ['P001', 'ZS26SS-B001-BL-L', 40],
    ['P001', 'ZS26SS-B001-BK-S', 30], ['P001', 'ZS26SS-B001-BK-M', 50], ['P001', 'ZS26SS-B001-BK-L', 35],
    ['P001', 'ZS26SS-O001-BG-S', 20], ['P001', 'ZS26SS-O001-BG-M', 30], ['P001', 'ZS26SS-O001-BG-L', 15],
    ['P001', 'ZS26SS-O001-NV-S', 15], ['P001', 'ZS26SS-O001-NV-M', 25], ['P001', 'ZS26SS-O001-NV-L', 10],
    ['P001', 'ZS26SS-D001-BL-S', 20], ['P001', 'ZS26SS-D001-BL-M', 25], ['P001', 'ZS26SS-D001-RD-S', 15], ['P001', 'ZS26SS-D001-RD-M', 20],
    ['P001', 'ZS26SS-A001-BK-FREE', 40], ['P001', 'ZS26SS-A001-BG-FREE', 35], ['P001', 'ZS26SS-A001-RD-FREE', 25],
    // 강남 직영점 (P002)
    ['P002', 'ZS26SS-T001-BK-S', 8], ['P002', 'ZS26SS-T001-BK-M', 12], ['P002', 'ZS26SS-T001-BK-L', 10], ['P002', 'ZS26SS-T001-BK-XL', 5],
    ['P002', 'ZS26SS-T001-WH-M', 10], ['P002', 'ZS26SS-T001-WH-L', 8],
    ['P002', 'ZS26SS-T002-WH-M', 6], ['P002', 'ZS26SS-T002-BL-M', 5],
    ['P002', 'ZS26SS-B001-BL-M', 8], ['P002', 'ZS26SS-B001-BK-M', 7],
    ['P002', 'ZS26SS-O001-BG-M', 4], ['P002', 'ZS26SS-O001-NV-M', 3],
    ['P002', 'ZS26SS-D001-BL-S', 3], ['P002', 'ZS26SS-D001-BL-M', 4],
    ['P002', 'ZS26SS-A001-BK-FREE', 6], ['P002', 'ZS26SS-A001-BG-FREE', 5],
    // 홍대 직영점 (P003)
    ['P003', 'ZS26SS-T001-BK-S', 10], ['P003', 'ZS26SS-T001-BK-M', 15], ['P003', 'ZS26SS-T001-WH-S', 8], ['P003', 'ZS26SS-T001-WH-M', 12],
    ['P003', 'ZS26SS-T003-BG-S', 5], ['P003', 'ZS26SS-T003-BG-M', 7], ['P003', 'ZS26SS-T003-BK-S', 6], ['P003', 'ZS26SS-T003-BK-M', 8],
    ['P003', 'ZS26SS-B003-BG-S', 4], ['P003', 'ZS26SS-B003-BG-M', 5], ['P003', 'ZS26SS-B003-BK-S', 4], ['P003', 'ZS26SS-B003-BK-M', 6],
    ['P003', 'ZS26SS-A001-BK-FREE', 5], ['P003', 'ZS26SS-A001-RD-FREE', 4],
    // 부산 가맹점 (P004)
    ['P004', 'ZS26SS-T001-BK-M', 10], ['P004', 'ZS26SS-T001-BK-L', 8],
    ['P004', 'ZS26SS-T001-WH-M', 8], ['P004', 'ZS26SS-T001-WH-L', 6],
    ['P004', 'ZS26SS-B001-BL-M', 6], ['P004', 'ZS26SS-B001-BL-L', 5],
    ['P004', 'ZS26SS-B002-BK-M', 5], ['P004', 'ZS26SS-B002-BK-L', 4],
    ['P004', 'ZS26SS-O002-BG-M', 3], ['P004', 'ZS26SS-O002-BK-M', 2],
    // 대구 가맹점 (P005)
    ['P005', 'ZS26SS-T001-BK-M', 7], ['P005', 'ZS26SS-T001-NV-M', 5],
    ['P005', 'ZS26SS-B001-BL-M', 4], ['P005', 'ZS26SS-B002-GR-M', 3],
    ['P005', 'ZS26SS-D002-WH-M', 3], ['P005', 'ZS26SS-D002-BG-M', 2],
    // ── 추가 상품 재고 ──
    // 본사 (P001)
    ['P001', 'ZS26SA-T004-BK-M', 60], ['P001', 'ZS26SA-T004-BK-L', 45], ['P001', 'ZS26SA-T004-GR-M', 50], ['P001', 'ZS26SA-T004-NV-M', 40],
    ['P001', 'ZS26SA-T005-BK-M', 55], ['P001', 'ZS26SA-T005-WH-M', 50],
    ['P001', 'ZS26SA-B004-BL-M', 40], ['P001', 'ZS26SA-B004-BL-L', 30], ['P001', 'ZS26SA-B004-BK-M', 35],
    ['P001', 'ZS26SM-D003-WH-M', 25], ['P001', 'ZS26SM-D003-BK-M', 20],
    ['P001', 'ZS25FW-T002-BK-M', 30], ['P001', 'ZS25FW-T002-BG-M', 25],
    ['P001', 'ZS25WN-O003-BK-M', 20], ['P001', 'ZS25WN-O003-BR-M', 15],
    ['P001', 'ZS26SA-A002-BK-FREE', 50], ['P001', 'ZS26SA-A002-BG-FREE', 45],
    ['P001', 'ZS26SA-A003-BK-FREE', 35], ['P001', 'ZS26SA-A003-BR-FREE', 30],
    // 강남점 (P002)
    ['P002', 'ZS26SA-T004-BK-M', 8], ['P002', 'ZS26SA-T005-BK-M', 6],
    ['P002', 'ZS26SA-B004-BL-M', 5], ['P002', 'ZS26SM-D003-WH-M', 3],
    ['P002', 'ZS26SA-A002-BK-FREE', 8], ['P002', 'ZS26SA-A003-BK-FREE', 5],
    // 홍대점 (P003)
    ['P003', 'ZS26SA-T004-GR-M', 7], ['P003', 'ZS26SA-T005-WH-M', 5],
    ['P003', 'ZS26SM-D003-BK-M', 3], ['P003', 'ZS26SA-A002-BG-FREE', 6],
  ];

  for (const [partner_code, sku, qty] of inventoryData) {
    const vid = skuMap[sku];
    if (vid) {
      await pool.query(
        `INSERT INTO inventory (partner_code, variant_id, qty)
         VALUES ($1, $2, $3) ON CONFLICT (partner_code, variant_id) DO NOTHING`,
        [partner_code, vid, qty],
      );
    }
  }
  console.log(`  재고 데이터 ${inventoryData.length}건 삽입`);

  // ──────────────── 6. 출고의뢰 데이터 ────────────────
  const shipments: [string, string, string | null, string, string, string | null][] = [
    ['SR260201001', 'P001', 'P002', '출고', 'SHIPPED', '2월 초 강남점 물량'],
    ['SR260201002', 'P001', 'P003', '출고', 'SHIPPED', '2월 초 홍대점 물량'],
    ['SR260205001', 'P001', 'P004', '출고', 'SHIPPED', '부산점 초도물량'],
    ['SR260205002', 'P001', 'P005', '출고', 'RECEIVED', '대구점 초도물량'],
    ['SR260210001', 'P001', 'P002', '출고', 'PROCESSING', '강남점 추가 물량 요청'],
    ['SR260210002', 'P001', 'P008', '출고', 'APPROVED', '공식몰 재고 보충'],
    ['SR260215001', 'P001', 'P003', '출고', 'APPROVED', '홍대점 SS시즌 보충'],
    ['SR260218001', 'P001', 'P006', '출고', 'DRAFT', '대전점 신규 오픈 물량'],
    ['SR260218002', 'P001', 'P007', '출고', 'DRAFT', '인천점 신규 오픈 물량'],
    ['SR260208001', 'P002', 'P001', '반품', 'SHIPPED', 'FW시즌 반품 - 강남점'],
    ['SR260208002', 'P003', 'P001', '반품', 'APPROVED', 'FW시즌 반품 - 홍대점'],
    ['SR260212001', 'P004', 'P001', '반품', 'DRAFT', '불량품 반품'],
    ['SR260209001', 'P002', 'P003', '수평이동', 'SHIPPED', '강남→홍대 재고이동'],
    ['SR260213001', 'P003', 'P004', '수평이동', 'APPROVED', '홍대→부산 재고이동'],
    ['SR260217001', 'P004', 'P005', '수평이동', 'DRAFT', '부산→대구 재고이동'],
  ];

  for (const [no, from_p, to_p, type, status, memo] of shipments) {
    const yr = '20' + no.substring(2, 4);
    const mn = no.substring(4, 6);
    const dy = no.substring(6, 8);
    const date = `${yr}-${mn}-${dy}`;
    await pool.query(
      `INSERT INTO shipment_requests (request_no, request_date, from_partner, to_partner, request_type, status, memo, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin')
       ON CONFLICT (request_no) DO NOTHING`,
      [no, date, from_p, to_p, type, status, memo],
    );
  }
  console.log(`  출고의뢰 ${shipments.length}건 삽입`);

  // 출고의뢰 아이템
  const reqRows = await pool.query('SELECT request_id, request_no FROM shipment_requests');
  const reqMap: Record<string, number> = {};
  reqRows.rows.forEach((r: any) => { reqMap[r.request_no] = r.request_id; });

  const shipItems: [string, string, number, number, number][] = [
    ['SR260201001', 'ZS26SS-T001-BK-M', 15, 15, 15],
    ['SR260201001', 'ZS26SS-T001-WH-M', 10, 10, 10],
    ['SR260201001', 'ZS26SS-B001-BL-M', 8, 8, 8],
    ['SR260201002', 'ZS26SS-T001-BK-S', 10, 10, 10],
    ['SR260201002', 'ZS26SS-T003-BG-M', 7, 7, 7],
    ['SR260205001', 'ZS26SS-T001-BK-M', 10, 10, 10],
    ['SR260205001', 'ZS26SS-B001-BL-M', 6, 6, 6],
    ['SR260205002', 'ZS26SS-T001-BK-M', 7, 7, 7],
    ['SR260205002', 'ZS26SS-D002-WH-M', 3, 3, 3],
    ['SR260210001', 'ZS26SS-T001-BK-M', 10, 5, 0],
    ['SR260210001', 'ZS26SS-O001-BG-M', 5, 3, 0],
    ['SR260210002', 'ZS26SS-A001-BK-FREE', 10, 0, 0],
    ['SR260210002', 'ZS26SS-A001-BG-FREE', 8, 0, 0],
    ['SR260215001', 'ZS26SS-T001-NV-M', 10, 0, 0],
    ['SR260215001', 'ZS26SS-B003-BG-M', 5, 0, 0],
    ['SR260209001', 'ZS26SS-T001-BK-L', 3, 3, 3],
    ['SR260209001', 'ZS26SS-T002-WH-M', 2, 2, 2],
  ];

  for (const [rno, sku, rq, sq, rcv] of shipItems) {
    const rid = reqMap[rno];
    const vid = skuMap[sku];
    if (rid && vid) {
      await pool.query(
        `INSERT INTO shipment_request_items (request_id, variant_id, request_qty, shipped_qty, received_qty)
         VALUES ($1, $2, $3, $4, $5)`,
        [rid, vid, rq, sq, rcv],
      );
    }
  }
  console.log(`  출고의뢰 아이템 ${shipItems.length}건 삽입`);

  // ──────────────── 7. 판매 데이터 (4개년: 2023~2026) ────────────────
  const hotSkus = [
    // TOP - 반팔
    'ZS26SS-T001-BK-M', 'ZS26SS-T001-BK-L', 'ZS26SS-T001-WH-M', 'ZS26SS-T001-WH-L',
    'ZS26SS-T001-NV-M', 'ZS25SA-T003-WH-M', 'ZS25SA-T003-NV-M',
    // TOP - 긴팔
    'ZS26SS-T002-WH-M', 'ZS26SS-T002-BL-M',
    // TOP - 니트
    'ZS26SS-T003-BG-M', 'ZS26SS-T003-BK-M', 'ZS25FW-T001-BK-M', 'ZS25FW-T001-GR-M',
    'ZS25FW-T002-BK-M', 'ZS25FW-T002-BG-M',
    // TOP - 후디
    'ZS26SA-T004-BK-M', 'ZS26SA-T004-GR-M', 'ZS26SA-T004-NV-M',
    // TOP - 맨투맨
    'ZS26SA-T005-BK-M', 'ZS26SA-T005-WH-M',
    // BOTTOM - 청바지
    'ZS26SS-B001-BL-M', 'ZS26SS-B001-BK-M', 'ZS26SA-B004-BL-M', 'ZS26SA-B004-BK-M',
    // BOTTOM - 슬랙스
    'ZS26SS-B002-BK-M', 'ZS26SS-B002-GR-M', 'ZS25FW-B001-BK-M', 'ZS25FW-B001-NV-M',
    'ZS25SA-B002-BG-M', 'ZS25SA-B002-BK-M',
    // BOTTOM - 스커트
    'ZS26SS-B003-BG-M', 'ZS26SS-B003-BK-M',
    // OUTER - 자켓
    'ZS26SS-O001-BG-M', 'ZS26SS-O001-NV-M', 'ZS25WN-O003-BK-M', 'ZS25WN-O003-BR-M',
    // OUTER - 코트
    'ZS26SS-O002-BG-M', 'ZS25FW-O001-BK-M', 'ZS25FW-O001-NV-M',
    // OUTER - 패딩
    'ZS25FW-O002-BK-M',
    // DRESS - 롱원피스
    'ZS26SS-D001-BL-M', 'ZS26SS-D001-RD-M', 'ZS26SS-D002-WH-M', 'ZS26SS-D002-BG-M',
    'ZS25SA-D001-BL-M', 'ZS25SA-D001-BG-M',
    // DRESS - 미니원피스
    'ZS26SM-D003-WH-M', 'ZS26SM-D003-BK-M',
    // ACC - 가방
    'ZS26SS-A001-BK-FREE', 'ZS26SS-A001-BG-FREE', 'ZS26SS-A001-RD-FREE',
    // ACC - 모자
    'ZS26SA-A002-BK-FREE', 'ZS26SA-A002-BG-FREE',
    // ACC - 벨트
    'ZS26SA-A003-BK-FREE', 'ZS26SA-A003-BR-FREE',
  ];
  const salesPartners = ['P002', 'P003', 'P004', 'P005', 'P006', 'P007', 'P008', 'P009', 'P010'];
  const saleTypes = ['정상', '정상', '정상', '정상', '정상', '할인', '할인', '행사']; // 정상 비중 높게
  const priceMap: Record<string, number> = {};
  variants.forEach(([, , , sku, price]) => { priceMap[sku] = price; });

  // 할인/행사 가격 맵
  const productPrices: Record<string, { base: number; discount: number; event: number }> = {
    'ZS26SS-T001': { base: 49000, discount: 39000, event: 29000 },
    'ZS26SS-T002': { base: 69000, discount: 55000, event: 45000 },
    'ZS26SS-T003': { base: 59000, discount: 47000, event: 35000 },
    'ZS26SA-T004': { base: 79000, discount: 63000, event: 49000 },
    'ZS26SA-T005': { base: 59000, discount: 47000, event: 35000 },
    'ZS26SS-B001': { base: 89000, discount: 71000, event: 59000 },
    'ZS26SS-B002': { base: 79000, discount: 63000, event: 49000 },
    'ZS26SS-B003': { base: 65000, discount: 52000, event: 39000 },
    'ZS26SA-B004': { base: 95000, discount: 76000, event: 62000 },
    'ZS26SS-O001': { base: 159000, discount: 127000, event: 99000 },
    'ZS26SS-O002': { base: 189000, discount: 151000, event: 119000 },
    'ZS26SS-D001': { base: 119000, discount: 95000, event: 79000 },
    'ZS26SS-D002': { base: 99000, discount: 79000, event: 59000 },
    'ZS26SM-D003': { base: 89000, discount: 71000, event: 55000 },
    'ZS25FW-T001': { base: 89000, discount: 71000, event: 55000 },
    'ZS25FW-T002': { base: 99000, discount: 79000, event: 59000 },
    'ZS25FW-O001': { base: 289000, discount: 231000, event: 189000 },
    'ZS25FW-O002': { base: 239000, discount: 191000, event: 149000 },
    'ZS25WN-O003': { base: 199000, discount: 159000, event: 129000 },
    'ZS25FW-B001': { base: 79000, discount: 63000, event: 49000 },
    'ZS25SA-T003': { base: 45000, discount: 36000, event: 27000 },
    'ZS25SA-B002': { base: 75000, discount: 60000, event: 45000 },
    'ZS25SA-D001': { base: 109000, discount: 87000, event: 69000 },
    'ZS26SS-A001': { base: 129000, discount: 103000, event: 79000 },
    'ZS26SA-A002': { base: 35000, discount: 28000, event: 22000 },
    'ZS26SA-A003': { base: 49000, discount: 39000, event: 29000 },
  };

  const randomDate = (year: number, month: number) => {
    const maxDay = new Date(year, month, 0).getDate(); // 해당월 마지막 날
    const day = Math.floor(Math.random() * maxDay) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // seeded random for reproducibility
  let seed = 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

  // 연도별 월별 판매 건수 (연도가 올라갈수록 매출 증가 트렌드)
  const yearlyMultiplier: Record<number, number> = { 2023: 0.6, 2024: 0.8, 2025: 1.0, 2026: 1.2 };
  // 월별 시즌 가중치 (SS시즌: 3~8월 높음, FW시즌: 9~2월 높음)
  const monthWeight = [0.7, 0.8, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 1.1, 1.0];

  let totalSales = 0;
  const salesBatch: string[] = [];

  for (let year = 2023; year <= 2026; year++) {
    const maxMonth = year === 2026 ? 2 : 12; // 2026년은 2월까지
    const mult = yearlyMultiplier[year] || 1.0;

    for (let month = 1; month <= maxMonth; month++) {
      const baseCount = Math.round(40 * mult * monthWeight[month - 1]);
      const count = baseCount + Math.round(rand() * 15);

      for (let i = 0; i < count; i++) {
        const date = randomDate(year, month);
        const sku = hotSkus[Math.floor(rand() * hotSkus.length)];
        const partner = salesPartners[Math.floor(rand() * salesPartners.length)];
        const qty = Math.floor(rand() * 5) + 1;
        const saleType = saleTypes[Math.floor(rand() * saleTypes.length)];

        // 상품코드 추출 (SKU에서 마지막 color-size 부분 제거)
        const productCode = sku.replace(/-[A-Z]{2,3}-[A-Z0-9]+$/, '');
        const pp = productPrices[productCode];
        let unitPrice: number;
        if (pp) {
          unitPrice = saleType === '할인' ? pp.discount : saleType === '행사' ? pp.event : pp.base;
        } else {
          unitPrice = priceMap[sku] || 49000;
        }

        const vid = skuMap[sku];
        if (vid) {
          const totalPrice = qty * unitPrice;
          salesBatch.push(
            `('${date}', '${partner}', ${vid}, ${qty}, ${unitPrice}, ${totalPrice}, '${saleType}')`,
          );
          totalSales++;
        }
      }
    }
  }

  // 배치 INSERT (100건씩)
  for (let i = 0; i < salesBatch.length; i += 100) {
    const batch = salesBatch.slice(i, i + 100);
    await pool.query(
      `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type) VALUES ${batch.join(',\n')}`,
    );
  }
  console.log(`  판매 데이터 ${totalSales}건 삽입 (2023~2026, 정상/할인/행사 포함)`);

  // ──────────────── 8. 재고 트랜잭션 이력 ────────────────
  const txSamples: [string, string, string, number, number][] = [
    ['SHIPMENT', 'P002', 'ZS26SS-T001-BK-M', 15, 12],
    ['SHIPMENT', 'P003', 'ZS26SS-T001-BK-S', 10, 10],
    ['SALE', 'P002', 'ZS26SS-T001-BK-M', -3, 9],
    ['SALE', 'P003', 'ZS26SS-T001-BK-S', -2, 8],
    ['ADJUST', 'P001', 'ZS26SS-T001-BK-M', -5, 75],
    ['RETURN', 'P002', 'ZS26SS-T001-WH-M', -2, 8],
    ['TRANSFER', 'P002', 'ZS26SS-T001-BK-L', -3, 7],
    ['TRANSFER', 'P003', 'ZS26SS-T001-BK-L', 3, 13],
  ];

  for (const [txType, partner, sku, change, after] of txSamples) {
    const vid = skuMap[sku];
    if (vid) {
      await pool.query(
        `INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by)
         VALUES ($1, $2, $3, $4, $5, 'admin')`,
        [txType, partner, vid, change, after],
      );
    }
  }
  console.log(`  재고 트랜잭션 ${txSamples.length}건 삽입`);

  // ──────────────── 9. 감사 로그 ────────────────
  await pool.query(`
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by) VALUES
      ('partners', 'P002', 'INSERT', NULL, '{"partner_name":"강남 직영점"}'::jsonb, 'admin'),
      ('partners', 'P003', 'INSERT', NULL, '{"partner_name":"홍대 직영점"}'::jsonb, 'admin'),
      ('products', 'ZS26SS-T001', 'INSERT', NULL, '{"product_name":"오버핏 코튼 티셔츠","base_price":49000}'::jsonb, 'admin'),
      ('products', 'ZS26SS-T001', 'UPDATE', '{"base_price":45000}'::jsonb, '{"base_price":49000}'::jsonb, 'admin'),
      ('users', 'gangnam', 'INSERT', NULL, '{"user_name":"강남점장"}'::jsonb, 'admin'),
      ('partners', 'P004', 'INSERT', NULL, '{"partner_name":"부산 가맹점"}'::jsonb, 'admin'),
      ('products', 'ZS26SS-O001', 'UPDATE', '{"base_price":149000}'::jsonb, '{"base_price":159000}'::jsonb, 'hq_mgr'),
      ('users', 'busan', 'INSERT', NULL, '{"user_name":"부산점장"}'::jsonb, 'admin'),
      ('partners', 'P008', 'INSERT', NULL, '{"partner_name":"젠사이 공식몰"}'::jsonb, 'admin'),
      ('products', 'ZS25FW-O002', 'UPDATE', '{"base_price":229000}'::jsonb, '{"base_price":239000}'::jsonb, 'hq_mgr')
    ON CONFLICT DO NOTHING;
  `);
  console.log('  감사 로그 10건 삽입');

  // ──────────────── 10. 소프트 삭제 테스트 데이터 ────────────────
  await pool.query(`
    INSERT INTO partners (partner_code, partner_name, business_number, representative, address, contact, partner_type, is_active)
    VALUES ('P099', '폐점 테스트매장', '999-99-99999', '테스트', '서울시 테스트구', '000-0000', '가맹', FALSE)
    ON CONFLICT (partner_code) DO NOTHING;
  `);
  await pool.query(`
    INSERT INTO products (product_code, product_name, category, brand, season, base_price, is_active)
    VALUES ('ZS-DEL01', '삭제 테스트 상품', 'TOP', 'ZENSAI', '2025FW', 39000, FALSE)
    ON CONFLICT (product_code) DO NOTHING;
  `);
  console.log('  소프트 삭제 테스트 데이터 삽입');

  console.log('더미 데이터 삽입 완료!');
}
