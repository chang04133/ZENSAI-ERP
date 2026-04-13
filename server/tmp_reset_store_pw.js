const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://zensai_erp_database_user:aFWKCqJ6CIqYpNw9n7LbWUkX6tPLYuJv@dpg-d6t97ai4d50c73c5jr50-a.singapore-postgres.render.com/zensai_erp_database',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    // 1) STORE_MANAGER role의 group_id 확인
    const roleRes = await client.query(
      `SELECT group_id FROM zensai.role_groups WHERE group_name = 'STORE_MANAGER'`
    );
    const smGroupId = roleRes.rows[0].group_id;
    console.log(`STORE_MANAGER group_id = ${smGroupId}`);

    // 2) 현재 STORE_MANAGER 목록 확인
    const usersRes = await client.query(
      `SELECT user_id, user_name FROM zensai.users WHERE role_group = $1 AND is_active = true`,
      [smGroupId]
    );
    console.log(`\n매장매니저 ${usersRes.rows.length}명:`);
    usersRes.rows.forEach(u => console.log(`  - ${u.user_id} (${u.user_name})`));

    // 3) 비밀번호 1234 해시 생성
    const hash = await bcrypt.hash('1234', 12);
    console.log(`\n해시 생성 완료: ${hash.substring(0, 20)}...`);

    // 4) 전체 STORE_MANAGER 비밀번호 업데이트
    const updateRes = await client.query(
      `UPDATE zensai.users SET password_hash = $1, updated_at = NOW()
       WHERE role_group = $2 AND is_active = true`,
      [hash, smGroupId]
    );
    console.log(`\n비밀번호 업데이트: ${updateRes.rowCount}명 완료`);

    // 5) qty = 0인 재고 레코드 수 확인
    const zeroRes = await client.query(
      `SELECT COUNT(*) as cnt FROM zensai.inventory WHERE qty = 0`
    );
    console.log(`\nqty=0 재고 레코드: ${zeroRes.rows[0].cnt}건`);

    // 6) qty = 0인 재고 삭제 (있는 재고만 남기기)
    const delRes = await client.query(
      `DELETE FROM zensai.inventory WHERE qty = 0`
    );
    console.log(`삭제 완료: ${delRes.rowCount}건`);

    // 7) 남은 재고 현황
    const remainRes = await client.query(
      `SELECT COUNT(*) as cnt, SUM(qty) as total_qty FROM zensai.inventory`
    );
    console.log(`\n남은 재고 레코드: ${remainRes.rows[0].cnt}건, 총 수량: ${remainRes.rows[0].total_qty}`);

    console.log('\n✅ 완료!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
