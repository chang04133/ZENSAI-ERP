import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('서버 오류:', err.message);
  res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
}
