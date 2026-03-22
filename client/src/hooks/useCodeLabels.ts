import { useState, useEffect, useCallback } from 'react';
import { codeApi } from '../modules/code/code.api';

// 모듈 레벨 캐시 (한 번 로드 후 모든 컴포넌트 공유)
let codeCache: Record<string, Record<string, string>> = {};
let loaded = false;
let loading = false;
let listeners: Array<() => void> = [];

function loadCodes() {
  if (loaded || loading) return;
  loading = true;
  codeApi.getAll().then((grouped: Record<string, any[]>) => {
    for (const [type, codes] of Object.entries(grouped)) {
      codeCache[type] = {};
      for (const c of codes) {
        if (c.is_active) codeCache[type][c.code_value] = c.code_label;
      }
    }
    loaded = true;
    loading = false;
    listeners.forEach((fn) => fn());
    listeners = [];
  }).catch(() => { loading = false; });
}

/**
 * 코드값 → "코드명(코드값)" 포맷 유틸 훅
 * - label과 value가 같으면 그냥 label 반환
 * - label과 value가 다르면 "label(value)" 반환
 * - value가 없으면 fallback (기본 '미지정') 반환
 */
export function useCodeLabels() {
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    if (loaded) { setReady(true); return; }
    listeners.push(() => setReady(true));
    loadCodes();
  }, []);

  const formatCode = useCallback((type: string, value: string | null | undefined, fallback = '미지정'): string => {
    if (!value) return fallback;
    const label = codeCache[type]?.[value];
    if (!label || label === value) return value;
    return `${label}(${value})`;
  }, [ready]);

  return { formatCode, ready };
}
