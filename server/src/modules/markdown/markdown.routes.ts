import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { markdownService } from './markdown.service';

const router = Router();
const adminHq = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

// 스케줄 목록
router.get('/', ...adminHq, asyncHandler(async (req, res) => {
  const season_code = req.query.season_code as string | undefined;
  const data = await markdownService.list(season_code);
  res.json({ success: true, data });
}));

// 스케줄 상세
router.get('/:id', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '스케줄을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 스케줄 생성
router.post('/', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.create({ ...req.body, created_by: req.user!.userId });
  res.status(201).json({ success: true, data });
}));

// 스케줄 수정
router.put('/:id', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.update(Number(req.params.id), req.body);
  res.json({ success: true, data });
}));

// 마크다운 적용
router.post('/:id/apply', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.apply(Number(req.params.id));
  res.json({ success: true, data });
}));

// 마크다운 복원
router.post('/:id/revert', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.revert(Number(req.params.id));
  res.json({ success: true, data });
}));

// 임팩트 분석
router.get('/:id/impact', ...adminHq, asyncHandler(async (req, res) => {
  const data = await markdownService.impact(Number(req.params.id));
  res.json({ success: true, data });
}));

export default router;
