const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  const schema = process.env.DB_SCHEMA || 'zensai';
  await pool.query(`SET search_path TO ${schema}`);

  console.log('=== 본사 거래처별 재고 현황 ===');
  const inv = await pool.query(`
    SELECT p.partner_code, p.partner_name, p.is_active,
           COALESCE(SUM(i.qty), 0)::int AS total_qty,
           COUNT(i.inventory_id)::int AS rows
    FROM partners p
    LEFT JOIN inventory i ON p.partner_code = i.partner_code
    WHERE p.partner_type = '본사'
    GROUP BY p.partner_code, p.partner_name, p.is_active
    ORDER BY COALESCE(SUM(i.qty), 0) DESC
  `);
  for (const r of inv.rows) {
    console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} 재고:${String(r.total_qty).padStart(6)} (${r.rows}행) ${r.is_active ? '' : '[비활성]'}`);
  }

  console.log('\n=== 출고요청 참조 ===');
  const ship = await pool.query(`
    SELECT p.partner_code, p.partner_name,
           (SELECT COUNT(*) FROM shipment_requests WHERE from_partner = p.partner_code)::int AS as_from,
           (SELECT COUNT(*) FROM shipment_requests WHERE to_partner = p.partner_code)::int AS as_to
    FROM partners p WHERE p.partner_type = '본사' ORDER BY p.partner_code
  `);
  for (const r of ship.rows) {
    if (r.as_from > 0 || r.as_to > 0)
      console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} 출발:${r.as_from} 도착:${r.as_to}`);
  }

  console.log('\n=== 입고기록 참조 ===');
  const inb = await pool.query(`
    SELECT p.partner_code, p.partner_name, COUNT(ir.record_id)::int AS cnt
    FROM partners p LEFT JOIN inbound_records ir ON p.partner_code = ir.partner_code
    WHERE p.partner_type = '본사' GROUP BY p.partner_code, p.partner_name HAVING COUNT(ir.record_id) > 0 ORDER BY cnt DESC
  `);
  for (const r of inb.rows) console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} ${r.cnt}건`);

  console.log('\n=== 재고변동 참조 ===');
  const tx = await pool.query(`
    SELECT p.partner_code, p.partner_name, COUNT(it.tx_id)::int AS cnt
    FROM partners p LEFT JOIN inventory_transactions it ON p.partner_code = it.partner_code
    WHERE p.partner_type = '본사' GROUP BY p.partner_code, p.partner_name HAVING COUNT(it.tx_id) > 0 ORDER BY cnt DESC
  `);
  for (const r of tx.rows) console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} ${r.cnt}건`);

  console.log('\n=== 판매 참조 ===');
  const sales = await pool.query(`
    SELECT p.partner_code, p.partner_name, COUNT(s.sale_id)::int AS cnt
    FROM partners p LEFT JOIN sales s ON p.partner_code = s.partner_code
    WHERE p.partner_type = '본사' GROUP BY p.partner_code, p.partner_name HAVING COUNT(s.sale_id) > 0 ORDER BY cnt DESC
  `);
  for (const r of sales.rows) console.log(`  ${r.partner_code.padEnd(10)} ${r.partner_name.padEnd(20)} ${r.cnt}건`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
