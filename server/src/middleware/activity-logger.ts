import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/connection';

const SKIP_PREFIXES = [
  '/api/auth/',
  '/health',
];

const SUMMARY_MAP: Array<{ method: string; pattern: RegExp; summary: string | ((m: RegExpMatchArray) => string) }> = [
  // 매출
  { method: 'POST', pattern: /^\/api\/sales\/batch$/, summary: '매출 배치 등록' },
  { method: 'POST', pattern: /^\/api\/sales\/direct-return$/, summary: '직접 반품 등록' },
  { method: 'POST', pattern: /^\/api\/sales\/excel\/upload$/, summary: '매출 엑셀 업로드' },
  { method: 'POST', pattern: /^\/api\/sales\/(\d+)\/return$/, summary: (m) => `매출 반품 (#${m[1]})` },
  { method: 'POST', pattern: /^\/api\/sales\/(\d+)\/exchange$/, summary: (m) => `매출 교환 (#${m[1]})` },
  { method: 'POST', pattern: /^\/api\/sales$/, summary: '매출 등록' },
  { method: 'PUT', pattern: /^\/api\/sales\/(\d+)$/, summary: (m) => `매출 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/sales\/(\d+)$/, summary: (m) => `매출 삭제 (#${m[1]})` },

  // 상품
  { method: 'POST', pattern: /^\/api\/products\/excel\/upload$/, summary: '상품 엑셀 업로드' },
  { method: 'POST', pattern: /^\/api\/products\/([^/]+)\/image$/, summary: (m) => `상품 이미지 업로드 (${m[1]})` },
  { method: 'POST', pattern: /^\/api\/products\/([^/]+)\/variants$/, summary: (m) => `상품 옵션 추가 (${m[1]})` },
  { method: 'POST', pattern: /^\/api\/products$/, summary: '상품 등록' },
  { method: 'PUT', pattern: /^\/api\/products\/events\/bulk$/, summary: '행사가 일괄 변경' },
  { method: 'PUT', pattern: /^\/api\/products\/([^/]+)\/event-price$/, summary: (m) => `행사가 설정 (${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/products\/([^/]+)\/materials$/, summary: (m) => `상품 부자재 수정 (${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/products\/variants\/(\d+)\/barcode$/, summary: (m) => `바코드 등록 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/products\/variants\/(\d+)\/alert$/, summary: (m) => `부족알림 토글 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/products\/([^/]+)\/variants\/(\d+)$/, summary: (m) => `상품 옵션 수정 (${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/products\/([^/]+)$/, summary: (m) => `상품 수정 (${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/products\/([^/]+)\/variants\/(\d+)$/, summary: (m) => `상품 옵션 삭제 (${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/products\/([^/]+)$/, summary: (m) => `상품 삭제 (${m[1]})` },

  // 거래처
  { method: 'POST', pattern: /^\/api\/partners$/, summary: '거래처 등록' },
  { method: 'PUT', pattern: /^\/api\/partners\/([^/]+)$/, summary: (m) => `거래처 수정 (${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/partners\/([^/]+)$/, summary: (m) => `거래처 삭제 (${m[1]})` },

  // 직원
  { method: 'POST', pattern: /^\/api\/users$/, summary: '직원 등록' },
  { method: 'PUT', pattern: /^\/api\/users\/([^/]+)$/, summary: (m) => `직원 수정 (${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/users\/([^/]+)$/, summary: (m) => `직원 삭제 (${m[1]})` },

  // 출고
  { method: 'POST', pattern: /^\/api\/shipments\/excel\/upload$/, summary: '출고 엑셀 업로드' },
  { method: 'POST', pattern: /^\/api\/shipments$/, summary: '출고의뢰 등록' },
  { method: 'PUT', pattern: /^\/api\/shipments\/(\d+)\/ship-confirm$/, summary: (m) => `출고확인 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/shipments\/(\d+)\/receive$/, summary: (m) => `수령확인 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/shipments\/(\d+)\/shipped-qty$/, summary: (m) => `출고수량 입력 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/shipments\/(\d+)$/, summary: (m) => `출고의뢰 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/shipments\/(\d+)$/, summary: (m) => `출고의뢰 삭제 (#${m[1]})` },

  // 재고
  { method: 'POST', pattern: /^\/api\/inventory\/adjust$/, summary: '재고 수동 조정' },

  // 입고
  { method: 'POST', pattern: /^\/api\/inbounds/, summary: '입고 등록' },
  { method: 'PUT', pattern: /^\/api\/inbounds/, summary: '입고 수정' },
  { method: 'DELETE', pattern: /^\/api\/inbounds/, summary: '입고 삭제' },

  // 재입고
  { method: 'POST', pattern: /^\/api\/restocks$/, summary: '재입고 요청 생성' },
  { method: 'PUT', pattern: /^\/api\/restocks\/(\d+)\/receive$/, summary: (m) => `재입고 수령확인 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/restocks\/(\d+)$/, summary: (m) => `재입고 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/restocks\/(\d+)$/, summary: (m) => `재입고 삭제 (#${m[1]})` },

  // 생산
  { method: 'POST', pattern: /^\/api\/productions\/auto-generate$/, summary: '생산계획 자동생성' },
  { method: 'POST', pattern: /^\/api\/productions$/, summary: '생산계획 생성' },
  { method: 'PUT', pattern: /^\/api\/productions\/(\d+)\/status$/, summary: (m) => `생산상태 변경 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/productions\/(\d+)\/produced-qty$/, summary: (m) => `생산수량 입력 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/productions\/(\d+)\/materials$/, summary: (m) => `자재BOM 수정 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/productions\/(\d+)$/, summary: (m) => `생산계획 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/productions\/(\d+)$/, summary: (m) => `생산계획 삭제 (#${m[1]})` },

  // 자재
  { method: 'POST', pattern: /^\/api\/materials$/, summary: '자재 등록' },
  { method: 'PUT', pattern: /^\/api\/materials\/(\d+)\/adjust-stock$/, summary: (m) => `자재 재고조정 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/materials\/(\d+)$/, summary: (m) => `자재 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/materials\/(\d+)$/, summary: (m) => `자재 삭제 (#${m[1]})` },

  // 자금
  { method: 'POST', pattern: /^\/api\/funds\/batch$/, summary: '자금계획 일괄 저장' },
  { method: 'POST', pattern: /^\/api\/funds\/categories$/, summary: '자금 카테고리 생성' },
  { method: 'POST', pattern: /^\/api\/funds$/, summary: '자금계획 등록' },
  { method: 'PUT', pattern: /^\/api\/funds\/categories\/(\d+)$/, summary: (m) => `자금 카테고리 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/funds\/categories\/(\d+)$/, summary: (m) => `자금 카테고리 삭제 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/funds\/(\d+)$/, summary: (m) => `자금계획 삭제 (#${m[1]})` },

  // 마스터코드
  { method: 'POST', pattern: /^\/api\/codes$/, summary: '마스터코드 등록' },
  { method: 'PUT', pattern: /^\/api\/codes\/(\d+)$/, summary: (m) => `마스터코드 수정 (#${m[1]})` },
  { method: 'DELETE', pattern: /^\/api\/codes\/(\d+)$/, summary: (m) => `마스터코드 삭제 (#${m[1]})` },

  // 알림
  { method: 'POST', pattern: /^\/api\/notifications\/stock-request$/, summary: '재고 요청 알림 발송' },
  { method: 'PUT', pattern: /^\/api\/notifications\/(\d+)\/resolve$/, summary: (m) => `알림 승인 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/notifications\/(\d+)\/process$/, summary: (m) => `알림 처리 (#${m[1]})` },
  { method: 'PUT', pattern: /^\/api\/notifications\/(\d+)\/read$/, summary: (m) => `알림 읽음 (#${m[1]})` },

  // 시스템
  { method: 'POST', pattern: /^\/api\/system\/restore$/, summary: '삭제데이터 복원' },
  { method: 'PUT', pattern: /^\/api\/system\/settings$/, summary: '시스템 설정 변경' },
];

function getSummary(method: string, path: string): string {
  for (const entry of SUMMARY_MAP) {
    if (entry.method !== method) continue;
    const match = path.match(entry.pattern);
    if (match) {
      return typeof entry.summary === 'function' ? entry.summary(match) : entry.summary;
    }
  }
  const label: Record<string, string> = { POST: '등록', PUT: '수정', DELETE: '삭제' };
  return `${label[method] || method} ${path}`;
}

export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  const pathOnly = req.baseUrl + req.path;
  if (SKIP_PREFIXES.some((p) => pathOnly.startsWith(p))) {
    next();
    return;
  }

  res.on('finish', () => {
    const user = (req as any).user;
    if (!user) return;

    const summary = getSummary(req.method, pathOnly);
    const ip = req.ip || req.socket?.remoteAddress || '';

    const pool = getPool();
    pool.query(
      `INSERT INTO activity_logs (user_id, user_name, role, partner_code, method, path, status_code, summary, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.userId, user.userName, user.role, user.partnerCode, req.method, pathOnly, res.statusCode, summary, ip],
    ).catch((err) => {
      console.error('활동 로그 기록 실패:', err.message);
    });
  });

  next();
}
