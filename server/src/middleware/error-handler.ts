import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('서버 오류:', err.message);

  // 비즈니스 로직 에러 (한글 메시지)는 원본 메시지 전달
  const isBusinessError = /[가-힣]/.test(err.message);
  if (isBusinessError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
}
