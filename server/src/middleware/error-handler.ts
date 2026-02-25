import { Request, Response, NextFunction } from 'express';

/** 비즈니스 로직 에러 — throw new BusinessError('메시지') 로 사용 */
export class BusinessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('서버 오류:', err.message);

  // BusinessError 인스턴스는 명시적 비즈니스 에러
  if (err instanceof BusinessError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  // 기존 호환: 한글 메시지 포함 에러도 비즈니스 에러로 처리 (점진적 마이그레이션)
  const isBusinessError = /[가-힣]/.test(err.message);
  if (isBusinessError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
}
