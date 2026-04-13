import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { outsourceController as c } from './outsource.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';

const router = Router();

const hqAuth = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'OUTSOURCE_DESIGNER')];
const adminAuth = [authMiddleware, requireRole('ADMIN')];

// ── 파일 업로드 (multer) ──
const uploadsDir = path.join(__dirname, '../../../../uploads/outsource');
fs.mkdirSync(uploadsDir, { recursive: true });

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const prefix = req.baseUrl?.includes('submissions') || req.path?.includes('submissions')
      ? `ds${req.params.id || 'unknown'}`
      : `wo${req.params.id || 'unknown'}`;
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9가-힣_\-]/g, '_')
      .substring(0, 50);
    cb(null, `${prefix}_${Date.now()}_${baseName}${ext}`);
  },
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.xlsx', '.xls', '.doc', '.docx', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('허용되지 않는 파일 형식입니다 (이미지, PDF, 문서, ZIP 가능)'));
  },
});

// 대시보드
router.get('/dashboard', ...hqAuth, c.dashboard);

// 브리프 (갑 전용 생성, 을 조회)
router.get('/briefs', ...hqAuth, c.listBriefs);
router.get('/briefs/:id', ...hqAuth, c.getBrief);
router.post('/briefs', ...adminAuth, c.createBrief);
router.put('/briefs/:id', ...adminAuth, c.updateBrief);
router.put('/briefs/:id/distribute', ...adminAuth, c.distributeBrief);

// 디자인 시안 (을 제출, 갑 심사)
router.get('/submissions', ...hqAuth, c.listSubmissions);
router.post('/submissions', ...hqAuth, c.createSubmission);
router.put('/submissions/:id/review', ...adminAuth, c.reviewSubmission);

// 디자인 시안 파일 업로드
router.post('/submissions/:id/files', ...hqAuth, fileUpload.array('files', 10), asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ success: false, error: '파일이 첨부되지 않았습니다.' });
    return;
  }
  const result = files.map(f => ({
    filename: f.filename,
    originalName: f.originalname,
    size: f.size,
    url: `/uploads/outsource/${f.filename}`,
  }));
  res.json({ success: true, data: result });
}));

// 디자인 시안 파일 목록
router.get('/submissions/:id/files', ...hqAuth, asyncHandler(async (req: Request, res: Response) => {
  const dsId = req.params.id;
  const prefix = `ds${dsId}_`;
  try {
    const allFiles = fs.readdirSync(uploadsDir);
    const dsFiles = allFiles
      .filter(f => f.startsWith(prefix))
      .map(f => {
        const stat = fs.statSync(path.join(uploadsDir, f));
        const ext = path.extname(f).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
        return {
          filename: f,
          url: `/uploads/outsource/${f}`,
          size: stat.size,
          isImage,
          uploadedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    res.json({ success: true, data: dsFiles });
  } catch {
    res.json({ success: true, data: [] });
  }
}));

// 작업지시서
router.get('/work-orders', ...hqAuth, c.listWorkOrders);
router.post('/work-orders', ...hqAuth, c.createWorkOrder);
router.get('/work-orders/:id/versions', ...hqAuth, c.listWorkOrderVersions);
router.get('/work-orders/:id/versions/:no', ...hqAuth, c.getWorkOrderVersion);
router.get('/work-orders/:id', ...hqAuth, c.getWorkOrder);
router.put('/work-orders/:id', ...hqAuth, c.updateWorkOrder);

// 작업지시서 파일 업로드
router.post('/work-orders/:id/files', ...hqAuth, fileUpload.array('files', 10), asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ success: false, error: '파일이 첨부되지 않았습니다.' });
    return;
  }
  const result = files.map(f => ({
    filename: f.filename,
    originalName: f.originalname,
    size: f.size,
    url: `/uploads/outsource/${f.filename}`,
  }));
  res.json({ success: true, data: result });
}));

// 작업지시서 파일 목록
router.get('/work-orders/:id/files', ...hqAuth, asyncHandler(async (req: Request, res: Response) => {
  const woId = req.params.id;
  const prefix = `wo${woId}_`;
  try {
    const allFiles = fs.readdirSync(uploadsDir);
    const woFiles = allFiles
      .filter(f => f.startsWith(prefix))
      .map(f => {
        const stat = fs.statSync(path.join(uploadsDir, f));
        const ext = path.extname(f).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
        return {
          filename: f,
          url: `/uploads/outsource/${f}`,
          size: stat.size,
          isImage,
          uploadedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    res.json({ success: true, data: woFiles });
  } catch {
    res.json({ success: true, data: [] });
  }
}));

// 파일 삭제
router.delete('/files/:filename', ...hqAuth, asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.params;
  // 보안: 경로 traversal 방지
  const safeName = path.basename(filename as string);
  const filePath = path.join(uploadsDir, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
}));

// 샘플 + 업체 로그
router.post('/work-orders/:woId/samples', ...hqAuth, c.createSample);
router.put('/samples/:id', ...hqAuth, c.updateSample);
router.get('/work-orders/:woId/vendor-logs', ...hqAuth, c.listVendorLogs);
router.post('/work-orders/:woId/vendor-logs', ...hqAuth, c.createVendorLog);

// QC 검수
router.get('/qc', ...hqAuth, c.listQc);
router.post('/qc', ...hqAuth, c.createQc);
router.put('/qc/:id/result', ...hqAuth, c.submitQcResult);

// 결제
router.get('/payments', ...hqAuth, c.listPayments);
router.get('/payments/summary', ...hqAuth, c.paymentSummary);
router.put('/payments/:id/approve', ...adminAuth, c.approvePayment);
router.put('/payments/:id/pay', ...adminAuth, c.payPayment);

// 베스트셀러 + 사이즈팩
router.get('/best-sellers', ...hqAuth, c.getBestSellers);
router.post('/size-packs', ...hqAuth, c.saveSizePack);
router.put('/size-packs/:id', ...hqAuth, c.updateSizePack);
router.delete('/size-packs/:id', ...adminAuth, c.deleteSizePack);
router.post('/size-packs/:id/create-brief', ...adminAuth, c.createBriefFromSizePack);

// 브랜드 프로필
router.get('/brand-profile', ...hqAuth, c.getBrandProfile);
router.put('/brand-profile', ...hqAuth, c.saveBrandProfile);

export default router;
