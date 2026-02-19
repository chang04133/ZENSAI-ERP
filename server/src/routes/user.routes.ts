import { Router } from 'express';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { validateRequired } from '../middleware/validate';
import { listUsers, getUser, createUser, updateUser, deactivateUser, getRoleGroups } from '../db/queries/user.queries';

const router = Router();

// GET /api/users/roles
router.get('/roles', authMiddleware, async (_req, res) => {
  try {
    const roles = await getRoleGroups();
    res.json({ success: true, data: roles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users
router.get('/', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), async (req, res) => {
  try {
    const { page, limit, search, role_group, partner_code } = req.query;
    const result = await listUsers({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      role_group: role_group as string,
      partner_code: partner_code as string,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/:id
router.get('/:id', authMiddleware, requireRole('ADMIN', 'HQ_MANAGER'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const user = await getUser(id);
    if (!user) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/users
router.post('/',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  validateRequired(['user_id', 'user_name', 'password', 'role_group']),
  async (req, res) => {
    try {
      const user = await createUser(req.body);
      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 사용자 ID입니다.' });
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// PUT /api/users/:id
router.put('/:id',
  authMiddleware,
  requireRole('ADMIN', 'HQ_MANAGER'),
  async (req, res) => {
    try {
      const id = req.params.id as string;
      const user = await updateUser(id, req.body);
      if (!user) {
        res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
        return;
      }
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/users/:id
router.delete('/:id',
  authMiddleware,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const id = req.params.id as string;
      await deactivateUser(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
