import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '인증 토큰이 필요합니다.' });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않거나 만료된 토큰입니다.' });
  }
}
