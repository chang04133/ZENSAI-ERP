import { getPool } from '../connection';

interface PartnerFilters {
  page?: number;
  limit?: number;
  search?: string;
  partner_type?: string;
  is_active?: boolean;
}

export async function listPartners(filters: PartnerFilters) {
  const pool = getPool();
  const { page = 1, limit = 20, search, partner_type, is_active } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(partner_code ILIKE $${idx} OR partner_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (partner_type) {
    conditions.push(`partner_type = $${idx}`);
    params.push(partner_type);
    idx++;
  }
  if (is_active !== undefined) {
    conditions.push(`is_active = $${idx}`);
    params.push(is_active);
    idx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(`SELECT COUNT(*) FROM partners ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await pool.query(
    `SELECT * FROM partners ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPartner(code: string) {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM partners WHERE partner_code = $1', [code]);
  return result.rows[0] || null;
}

export async function createPartner(data: any) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO partners (partner_code, partner_name, business_number, representative, address, contact, partner_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.partner_code, data.partner_name, data.business_number, data.representative, data.address, data.contact, data.partner_type]
  );
  return result.rows[0];
}

export async function updatePartner(code: string, data: any) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE partners SET partner_name=$1, business_number=$2, representative=$3, address=$4, contact=$5, partner_type=$6, is_active=$7, updated_at=NOW()
     WHERE partner_code=$8 RETURNING *`,
    [data.partner_name, data.business_number, data.representative, data.address, data.contact, data.partner_type, data.is_active, code]
  );
  return result.rows[0] || null;
}

export async function deactivatePartner(code: string) {
  const pool = getPool();
  await pool.query('UPDATE partners SET is_active = FALSE, updated_at = NOW() WHERE partner_code = $1', [code]);
}
