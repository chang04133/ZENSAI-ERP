import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { markdownRepository } from './markdown.repository';

const router = Router();
const ADMIN_HQ = requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER');

// 목록
router.get('/', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const { season_code, status } = req.query as Record<string, string | undefined>;
  const data = await markdownRepository.list(season_code, status);
  res.json({ success: true, data });
}));

// 대상 상품 조회 (/:id 보다 먼저 등록 — 라우트 충돌 방지)
router.get('/products/list', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const { category, season_code } = req.query as Record<string, string | undefined>;
  const data = await markdownRepository.getProducts(category, season_code);
  res.json({ success: true, data });
}));

// 추천 상품 (재고 多 + 판매 少 우선)
router.get('/products/recommend', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const { season_code, category, exclude } = req.query as Record<string, string | undefined>;
  const excludeCodes = exclude ? exclude.split(',').filter(Boolean) : undefined;
  const data = await markdownRepository.recommendProducts(season_code, category, excludeCodes);
  res.json({ success: true, data });
}));

// 상세
router.get('/:id', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const data = await markdownRepository.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '스케줄을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 생성
router.post('/', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const userName = req.user?.userName || 'system';
  const data = await markdownRepository.create({ ...req.body, created_by: userName });
  res.status(201).json({ success: true, data });
}));

// 수정
router.put('/:id', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const data = await markdownRepository.update(Number(req.params.id), req.body);
  res.json({ success: true, data });
}));

// 삭제
router.delete('/:id', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const data = await markdownRepository.remove(Number(req.params.id));
  res.json({ success: true, data });
}));

// 적용
router.post('/:id/apply', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const data = await markdownRepository.apply(Number(req.params.id));
  res.json({ success: true, data });
}));

// 복원
router.post('/:id/revert', authMiddleware, ADMIN_HQ, asyncHandler(async (req, res) => {
  const data = await markdownRepository.revert(Number(req.params.id));
  res.json({ success: true, data });
}));

export default router;
