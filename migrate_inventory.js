/**
 * YMSoft → ZENSAI ERP 재고 마이그레이션 스크립트
 *
 * 실행: node migrate_inventory.js
 *
 * 기존데이터/0319.2026재고.xls 파일을 파싱하여
 * 거래처(본사) + 상품 + SKU + 재고를 ERP DB에 일괄 등록
 */
require('./server/node_modules/dotenv').config({ path: './.env' });
const fs = require('fs');
const iconv = require('./server/node_modules/iconv-lite');
const { Pool } = require('./server/node_modules/pg');

const VALID_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE']);
const SIZE_MAP = { 'F': 'FREE' };
const PARTNER_CODE = 'HQ';
const BATCH_SIZE = 100;

// ─── 1단계: 엑셀 파싱 ───────────────────────────────────────────

function parseInventoryExcel(filePath) {
  const buf = fs.readFileSync(filePath);
  const html = iconv.decode(buf, 'euc-kr');

  const tableMatch = html.match(/<div id="dngrid"[\s\S]*?<TABLE[^>]*>([\s\S]*)<\/TABLE>/i);
  if (!tableMatch) throw new Error('Table not found in HTML');

  const NUM_COLS = 14;
  const trRegex = /<tr[^>]*class="rmc"[^>]*>([\s\S]*?)<\/tr>/gi;
  const allTrHtmls = [];
  let trMatch;
  while ((trMatch = trRegex.exec(tableMatch[1])) !== null) {
    allTrHtmls.push(trMatch[1]);
  }

  const spanMap = {};
  const grid = [];

  for (const trHtml of allTrHtmls) {
    const row = new Array(NUM_COLS).fill(null);

    // rowspan에서 내려온 값 채우기
    for (let c = 0; c < NUM_COLS; c++) {
      if (spanMap[c] && spanMap[c].rowsLeft > 0) {
        row[c] = spanMap[c].value;
        spanMap[c].rowsLeft--;
        if (spanMap[c].rowsLeft <= 0) delete spanMap[c];
      }
    }

    // td 파싱
    const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    let tdMatch2, colCursor = 0;
    while ((tdMatch2 = tdRegex.exec(trHtml)) !== null) {
      while (colCursor < NUM_COLS && row[colCursor] !== null) colCursor++;
      if (colCursor >= NUM_COLS) break;

      const attrs = tdMatch2[1];
      const value = tdMatch2[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').replace(/,/g, '').trim();
      const rsMatch = attrs.match(/rowspan="(\d+)"/);
      const rowspan = rsMatch ? parseInt(rsMatch[1]) : 1;

      row[colCursor] = value;
      if (rowspan > 1) {
        spanMap[colCursor] = { value, rowsLeft: rowspan - 1 };
      }
      colCursor++;
    }

    for (let c = 0; c < NUM_COLS; c++) {
      if (row[c] === null) row[c] = '';
    }
    grid.push(row);
  }

  // 행 → 아이템 변환
  const items = grid.map(r => ({
    code: r[1],
    color: r[2],
    size: r[3],
    name: r[4],
    qty: Number(r[5]) || 0,
    costPrice: Number(r[7]) || 0,
    tagPrice: Number(r[9]) || 0,
    saleType: r[10],
    salePrice: Number(r[11]) || 0,
  })).filter(i => i.code && i.code.length > 2);

  return items;
}

// ─── 메인 ───────────────────────────────────────────────────────

async function main() {
  console.log('=== YMSoft → ZENSAI ERP 재고 마이그레이션 ===\n');

  // 엑셀 파싱
  console.log('1. 엑셀 파싱 중...');
  const allItems = parseInventoryExcel('기존데이터/0319.2026재고.xls');
  // 이상치 제외 (qty >= 10000)
  const items = allItems.filter(i => i.qty > 0 && i.qty < 10000);
  console.log(`   전체 행: ${allItems.length}, 유효 재고 행: ${items.length}`);

  // 사이즈 매핑 및 유효성 검사
  const skippedSizes = [];
  const validItems = [];
  for (const item of items) {
    const mappedSize = SIZE_MAP[item.size] || item.size;
    if (!VALID_SIZES.has(mappedSize)) {
      skippedSizes.push({ sku: `${item.code}-${item.color}-${item.size}`, name: item.name, size: item.size });
      continue;
    }
    validItems.push({ ...item, mappedSize });
  }

  if (skippedSizes.length > 0) {
    console.log(`   [경고] 유효하지 않은 사이즈로 스킵: ${skippedSizes.length}건`);
    skippedSizes.slice(0, 10).forEach(s => console.log(`     - ${s.sku} (${s.name}) size="${s.size}"`));
    if (skippedSizes.length > 10) console.log(`     ... 외 ${skippedSizes.length - 10}건`);
  }

  // 품번별 그룹핑
  const productMap = new Map();
  for (const item of validItems) {
    if (!productMap.has(item.code)) {
      productMap.set(item.code, {
        code: item.code,
        name: item.name,
        tagPrice: item.tagPrice,
        costPrice: item.costPrice,
        saleType: item.saleType,
        variants: [],
      });
    }
    const product = productMap.get(item.code);
    product.variants.push({
      color: item.color,
      size: item.mappedSize,
      sku: `${item.code}-${item.color}-${item.mappedSize}`,
      price: item.salePrice,
      qty: item.qty,
    });
  }

  console.log(`   상품: ${productMap.size}개, SKU: ${validItems.length}개\n`);

  // DB 연결
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pool.query('SET search_path TO zensai, public');

  try {
    // ─── 2단계: 거래처 등록 ─────────────────────────────────────
    console.log('2. 거래처 등록...');
    await pool.query(
      `INSERT INTO partners (partner_code, partner_name, partner_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (partner_code) DO NOTHING`,
      [PARTNER_CODE, '본사', '본사']
    );
    console.log(`   거래처 '${PARTNER_CODE}' (본사) 등록 완료\n`);

    // ─── 3단계: 상품 등록 ───────────────────────────────────────
    console.log('3. 상품 등록 중...');
    let productCreated = 0;
    let productSkipped = 0;
    const products = [...productMap.values()];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET search_path TO zensai, public');
        for (const p of batch) {
          const result = await client.query(
            `INSERT INTO products (product_code, product_name, base_price, cost_price, sale_status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (product_code) DO NOTHING
             RETURNING product_code`,
            [p.code, p.name, p.tagPrice, p.costPrice, '판매중']
          );
          if (result.rowCount > 0) productCreated++;
          else productSkipped++;
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    console.log(`   등록: ${productCreated}, 스킵(중복): ${productSkipped}\n`);

    // ─── 4단계: SKU(variant) 등록 ───────────────────────────────
    console.log('4. SKU(variant) 등록 중...');
    let variantCreated = 0;
    let variantSkipped = 0;

    // 모든 variant를 플랫하게 모음
    const allVariants = [];
    for (const p of products) {
      for (const v of p.variants) {
        allVariants.push({ productCode: p.code, ...v });
      }
    }

    for (let i = 0; i < allVariants.length; i += BATCH_SIZE) {
      const batch = allVariants.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET search_path TO zensai, public');
        for (const v of batch) {
          const result = await client.query(
            `INSERT INTO product_variants (product_code, color, size, sku, price, barcode)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (sku) DO NOTHING
             RETURNING variant_id`,
            [v.productCode, v.color, v.size, v.sku, v.price, v.sku]
          );
          if (result.rowCount > 0) variantCreated++;
          else variantSkipped++;
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    console.log(`   등록: ${variantCreated}, 스킵(중복): ${variantSkipped}\n`);

    // ─── 5단계: 재고 등록 ───────────────────────────────────────
    console.log('5. 재고 등록 중...');

    // 등록된 variant_id 조회
    const variantRows = await pool.query(
      'SELECT variant_id, sku FROM product_variants WHERE is_active = TRUE'
    );
    const skuToVariantId = new Map();
    for (const r of variantRows.rows) {
      skuToVariantId.set(r.sku, r.variant_id);
    }

    let inventoryCreated = 0;
    let inventorySkipped = 0;

    // 재고 있는 항목만 처리
    const inventoryItems = allVariants.filter(v => v.qty > 0);

    for (let i = 0; i < inventoryItems.length; i += BATCH_SIZE) {
      const batch = inventoryItems.slice(i, i + BATCH_SIZE);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET search_path TO zensai, public');
        for (const v of batch) {
          const variantId = skuToVariantId.get(v.sku);
          if (!variantId) {
            inventorySkipped++;
            continue;
          }

          // 재고 upsert
          await client.query(
            `INSERT INTO inventory (partner_code, variant_id, qty)
             VALUES ($1, $2, $3)
             ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = $3, updated_at = NOW()`,
            [PARTNER_CODE, variantId, v.qty]
          );

          // 재고 트랜잭션 기록
          await client.query(
            `INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by, memo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['INBOUND', PARTNER_CODE, variantId, v.qty, v.qty, 'system', 'YMSoft 마이그레이션 (2026-03-19)']
          );

          inventoryCreated++;
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    console.log(`   등록: ${inventoryCreated}, 스킵: ${inventorySkipped}\n`);

    // ─── 결과 요약 ──────────────────────────────────────────────
    console.log('=== 마이그레이션 완료 ===');
    console.log(`거래처:  1건 (${PARTNER_CODE})`);
    console.log(`상품:    ${productCreated}건`);
    console.log(`SKU:     ${variantCreated}건`);
    console.log(`재고:    ${inventoryCreated}건`);
    if (skippedSizes.length > 0) {
      console.log(`사이즈 스킵: ${skippedSizes.length}건`);
    }

    // 검증 쿼리
    console.log('\n=== 검증 ===');
    const pCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM products WHERE is_active = TRUE');
    const vCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM product_variants WHERE is_active = TRUE');
    const iCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM inventory');
    const iSum = await pool.query('SELECT COALESCE(SUM(qty),0)::int AS total FROM inventory WHERE qty > 0');
    console.log(`DB 상품 수:    ${pCount.rows[0].cnt}`);
    console.log(`DB SKU 수:     ${vCount.rows[0].cnt}`);
    console.log(`DB 재고 레코드: ${iCount.rows[0].cnt}`);
    console.log(`DB 총 재고량:  ${iSum.rows[0].total.toLocaleString()}개`);

  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error('마이그레이션 실패:', e);
  process.exit(1);
});
