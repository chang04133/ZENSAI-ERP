import { Router } from 'express';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { validateRequired } from '../middleware/validate';
import { listPartners, getPartner, createPartner, updatePartner, deactivatePartner } from '../db/queries/partner.queries';

const router = Router();

// GET /api/partners
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page, limit, search, partner_type, is_active } = req.query;

    // STORE_MANAGER can only see their own partner
    if (req.user!.role === 'STORE_MANAGER' && req.user!.partnerCode) {
      const partner = await getPartner(req.user!.partnerCode);
      res.json({ success: true, data: { data: partner ? [partner] : [], total: partner ? 1 : 0, page: 1, limit: 1, totalPages: 1 } });
      return;
    }

    const result = await listPartners({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      partner_type: partner_type as string,
      is_active: is_active !== undefined ? is_active === 'true' : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/partners/:code
router.get('/:code', authMiddleware, async (req, res) => {
  try {
    const code = req.params.code as string;
    const partner = await getPartner(code);
    if (!partner) {
      res.status(404).json({ success: false, error: '거래처를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: partner });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/partners
router.post('/',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  validateRequired(['partner_code', 'partner_name', 'partner_type']),
  async (req, res) => {
    try {
      const existing = await getPartner(req.body.partner_code);
      if (existing) {
        res.status(409).json({ success: false, error: '이미 존재하는 거래처 코드입니다.' });
        return;
      }
      const partner = await createPartner(req.body);
      res.status(201).json({ success: true, data: partner });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/partners/:code
router.put('/:code',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const code = req.params.code as string;
      const partner = await updatePartner(code, req.body);
      if (!partner) {
        res.status(404).json({ success: false, error: '거래처를 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: partner });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/partners/:code
router.delete('/:code',
  authMiddleware,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const code = req.params.code as string;
      await deactivatePartner(code);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
