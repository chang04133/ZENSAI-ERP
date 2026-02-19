import { Request, Response, NextFunction } from 'express';

export function validateRequired(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = fields.filter(f => req.body[f] === undefined || req.body[f] === null || req.body[f] === '');
    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: `필수 항목이 누락되었습니다: ${missing.join(', ')}`,
      });
      return;
    }
    next();
  };
}
