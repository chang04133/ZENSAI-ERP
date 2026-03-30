const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MAIN = '1'; // 본사물류 — 유일한 본사 창고로 유지

async function main() {
  const schema = process.env.DB_SCHEMA || 'zensai';
  const client = await pool.connect();

  try {
    await client.query(`SET search_path TO ${schema}`);

    // 통합 대상: 본사 타입 거래처 중 MAIN이 아닌 것
    const targets = await client.query(
      `SELECT partner_code, partner_name FROM partners WHERE partner_type = '본사' AND partner_code != $1`,
      [MAIN],
    );
    const codes = targets.rows.map(r => r.partner_code);
    console.log(`메인 창고: ${MAIN}`);
    console.log(`통합 대상 (${codes.length}개):`, codes.join(', '));

    await client.query('BEGIN');

    // 1. inventory: 재고 합산 (이미 모두 0이지만 안전하게)
    // 같은 variant가 양쪽에 있으면 qty 합산, 없으면 partner_code만 변경
    for (const code of codes) {
      // 겹치는 variant: qty 합산 후 삭제
      const overlap = await client.query(`
        UPDATE inventory SET qty = inventory.qty + sub.qty
        FROM (SELECT variant_id, qty FROM inventory WHERE partner_code = $1) sub
        WHERE inventory.partner_code = $2 AND inventory.variant_id = sub.variant_id
      `, [code, MAIN]);
      if (overlap.rowCount > 0) console.log(`  ${code}: ${overlap.rowCount}개 겹치는 variant qty 합산`);

      await client.query(`DELETE FROM inventory WHERE partner_code = $1 AND variant_id IN (SELECT variant_id FROM inventory WHERE partner_code = $2)`, [code, MAIN]);

      // 안 겹치는 variant: partner_code 변경
      const moved = await client.query(`UPDATE inventory SET partner_code = $2 WHERE partner_code = $1`, [code, MAIN]);
      if (moved.rowCount > 0) console.log(`  ${code}: ${moved.rowCount}개 재고 이동`);
    }

    // 2. shipment_requests: from_partner, to_partner 변경
    for (const code of codes) {
      const r1 = await client.query(`UPDATE shipment_requests SET from_partner = $2 WHERE from_partner = $1`, [code, MAIN]);
      const r2 = await client.query(`UPDATE shipment_requests SET to_partner = $2 WHERE to_partner = $1`, [code, MAIN]);
      if (r1.rowCount > 0) console.log(`  출고요청 from_partner ${code} → ${MAIN}: ${r1.rowCount}건`);
      if (r2.rowCount > 0) console.log(`  출고요청 to_partner ${code} → ${MAIN}: ${r2.rowCount}건`);
    }

    // 3. inbound_records: partner_code 변경
    for (const code of codes) {
      const r = await client.query(`UPDATE inbound_records SET partner_code = $2 WHERE partner_code = $1`, [code, MAIN]);
      if (r.rowCount > 0) console.log(`  입고기록 ${code} → ${MAIN}: ${r.rowCount}건`);
    }

    // 4. inventory_transactions: partner_code 변경
    for (const code of codes) {
      const r = await client.query(`UPDATE inventory_transactions SET partner_code = $2 WHERE partner_code = $1`, [code, MAIN]);
      if (r.rowCount > 0) console.log(`  재고변동 ${code} → ${MAIN}: ${r.rowCount}건`);
    }

    // 5. sales: partner_code 변경 (있다면)
    for (const code of codes) {
      const r = await client.query(`UPDATE sales SET partner_code = $2 WHERE partner_code = $1`, [code, MAIN]);
      if (r.rowCount > 0) console.log(`  판매 ${code} → ${MAIN}: ${r.rowCount}건`);
    }

    // 6. warehouses: 통합 대상 삭제, MAIN만 남기고 기본으로
    await client.query(`DELETE FROM warehouses WHERE warehouse_code != $1`, [MAIN]);
    await client.query(`UPDATE warehouses SET is_default = TRUE, warehouse_name = '본사창고' WHERE warehouse_code = $1`, [MAIN]);
    console.log(`\n  warehouses 테이블: ${MAIN}만 남김 (기본 창고)`);

    // 7. users: partner_code가 본사 코드인 사용자 → NULL(본사 사용자는 partner_code NULL)
    for (const code of codes) {
      const r = await client.query(`UPDATE users SET partner_code = NULL WHERE partner_code = $1`, [code]);
      if (r.rowCount > 0) console.log(`  사용자 partner_code ${code} → NULL: ${r.rowCount}명`);
    }

    // 8. 나머지 본사 거래처 비활성화
    const deactivated = await client.query(
      `UPDATE partners SET is_active = FALSE WHERE partner_type = '본사' AND partner_code != $1`,
      [MAIN],
    );
    console.log(`\n  ${deactivated.rowCount}개 본사 거래처 비활성화`);

    // 9. 메인 거래처명 변경
    await client.query(`UPDATE partners SET partner_name = '본사창고' WHERE partner_code = $1`, [MAIN]);
    console.log(`  메인 거래처(${MAIN}) 이름 → '본사창고'`);

    await client.query('COMMIT');
    console.log('\n=== 통합 완료 ===');

    // 검증
    const verify = await client.query(`
      SELECT partner_code, partner_name, is_active FROM partners WHERE partner_type = '본사' ORDER BY is_active DESC, partner_code
    `);
    console.log('\n최종 본사 거래처:');
    for (const r of verify.rows) {
      console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} ${r.is_active ? '활성' : '비활성'}`);
    }

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('롤백됨:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
