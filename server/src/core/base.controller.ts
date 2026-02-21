import { Request, Response, Router } from 'express';
import { BaseService } from './base.service';
import { asyncHandler } from './async-handler';
import { authMiddleware } from '../auth/middleware';
import { requireRole } from '../middleware/role-guard';
import { validateRequired } from '../middleware/validate';
import { audit } from './audit';

export interface RouteConfig {
  readRoles?: string[];       // GET 접근 역할 (비면 인증만)
  writeRoles: string[];       // POST/PUT/DELETE 역할
  requiredFields?: string[];  // POST 필수 필드
  paramName?: string;         // 기본 'id'
  entityName?: string;        // 에러 메시지용 ('거래처', '상품' 등)
  auditTable?: string;        // audit_logs 기록할 테이블 이름
}

export class BaseController<T = any> {
  constructor(protected service: BaseService<T>) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, search, orderBy, orderDir, ...filters } = req.query;
    const result = await this.service.list({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      orderBy: orderBy as string,
      orderDir: orderDir as 'ASC' | 'DESC',
      ...filters,
    });
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = (req.params.id || req.params.code) as string;
    const item = await this.service.getById(id);
    if (!item) {
      res.status(404).json({ success: false, error: '데이터를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: item });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const item = await this.service.create(req.body);
    res.status(201).json({ success: true, data: item });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const id = (req.params.id || req.params.code) as string;
    const item = await this.service.update(id, req.body);
    if (!item) {
      res.status(404).json({ success: false, error: '데이터를 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: item });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = (req.params.id || req.params.code) as string;
    await this.service.remove(id);
    res.json({ success: true });
  });

  /** Register standard CRUD routes on a Router */
  registerCrudRoutes(router: Router, config: RouteConfig): Router {
    const param = config.paramName || 'id';
    const readMiddleware = config.readRoles
      ? [authMiddleware, requireRole(...config.readRoles)]
      : [authMiddleware];
    const writeMiddleware = [authMiddleware, requireRole(...config.writeRoles)];

    // GET list
    router.get('/', ...readMiddleware, this.list);

    // GET by id
    router.get(`/:${param}`, ...readMiddleware, this.getById);

    // POST create
    const createMiddleware = config.requiredFields
      ? [...writeMiddleware, validateRequired(config.requiredFields)]
      : writeMiddleware;
    router.post('/', ...createMiddleware, this.create);

    // PUT update
    router.put(`/:${param}`, ...writeMiddleware, this.update);

    // DELETE
    router.delete(`/:${param}`, ...writeMiddleware, this.remove);

    return router;
  }
}
