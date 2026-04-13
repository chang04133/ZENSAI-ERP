import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, Table, Tag, Statistic, Row, Col, Badge, Tooltip, Segmented, Collapse, Typography, Spin, Empty, Button, message, Progress } from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, SafetyCertificateOutlined,
  ClockCircleOutlined, FileTextOutlined, ExperimentOutlined,
  UnlockOutlined, EyeOutlined, EyeInvisibleOutlined,
  ReloadOutlined, WarningOutlined, OrderedListOutlined,
  CrownFilled, StarFilled, FireFilled, TrophyFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { systemApi } from '../../modules/system/system.api';
import { apiFetch } from '../../core/api.client';

/* ──────────────────────────────
   Markdown 렌더링 (store-test-checklist.md 표시용)
   ────────────────────────────── */

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  return out;
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableBuffer: string[] = [];
  let inList = false;

  const flushTable = () => {
    if (tableBuffer.length < 2) { tableBuffer = []; inTable = false; return; }
    html.push('<div class="md-table-wrap"><table>');
    for (let i = 0; i < tableBuffer.length; i++) {
      if (i === 1) continue;
      const cells = tableBuffer[i].split('|').filter(c => c.trim() !== '');
      const tag = i === 0 ? 'th' : 'td';
      html.push('<tr>');
      for (const cell of cells) html.push(`<${tag}>${parseInline(cell.trim())}</${tag}>`);
      html.push('</tr>');
    }
    html.push('</table></div>');
    tableBuffer = [];
    inTable = false;
  };

  const flushList = () => { if (inList) { html.push('</ul>'); inList = false; } };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) { if (inTable) flushTable(); flushList(); inCodeBlock = true; codeBuffer = []; }
      else { html.push(`<pre class="md-code-block"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`); inCodeBlock = false; }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }
    if (line.trim().startsWith('|')) { flushList(); inTable = true; tableBuffer.push(line.trim()); continue; }
    if (inTable) flushTable();
    if (line.trim() === '') { flushList(); html.push(''); continue; }
    if (/^---+$/.test(line.trim())) { flushList(); html.push('<hr/>'); continue; }

    const headMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headMatch) {
      flushList();
      const level = headMatch[1].length;
      const text = headMatch[2];
      const id = text.replace(/[^a-zA-Z0-9가-힣\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
      html.push(`<h${level} id="${id}" class="md-h${level}">${parseInline(text)}</h${level}>`);
      continue;
    }
    if (line.trim().startsWith('>')) { flushList(); html.push(`<blockquote class="md-blockquote">${parseInline(line.replace(/^>\s*/, ''))}</blockquote>`); continue; }
    if (line.match(/^\s*[-*]\s+/)) {
      if (!inList) { html.push('<ul class="md-list">'); inList = true; }
      const indent = line.search(/[^\s]/);
      html.push(`<li style="margin-left:${Math.max(0, indent - 2) * 8}px">${parseInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (line.match(/^\s*\d+\.\s+/)) {
      if (!inList) { html.push('<ul class="md-list" style="list-style:decimal">'); inList = true; }
      html.push(`<li>${parseInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      continue;
    }
    flushList();
    html.push(`<p>${parseInline(line)}</p>`);
  }
  if (inTable) flushTable();
  flushList();
  return html.join('\n');
}

/* ── 체크리스트 파서 ── */
interface CheckCategory { code: string; title: string; items: CheckItem[] }
interface CheckItem { id: string; title: string; body: string }

function parseChecklist(md: string): CheckCategory[] {
  const categories: CheckCategory[] = [];
  const lines = md.split('\n');
  let currentCat: CheckCategory | null = null;
  let currentItem: CheckItem | null = null;
  let bodyLines: string[] = [];
  const flushItem = () => {
    if (currentItem && currentCat) {
      currentItem.body = bodyLines.join('\n').trim();
      currentCat.items.push(currentItem);
    }
    currentItem = null;
    bodyLines = [];
  };
  for (const line of lines) {
    const catMatch = line.match(/^## ([A-Z])\.\s+(.+)/);
    if (catMatch) { flushItem(); currentCat = { code: catMatch[1], title: catMatch[2], items: [] }; categories.push(currentCat); continue; }
    const itemMatch = line.match(/^### ([A-Z]-\d+)\.\s+(.+)/);
    if (itemMatch) { flushItem(); currentItem = { id: itemMatch[1], title: itemMatch[2], body: '' }; continue; }
    if (currentItem && line.trim() !== '- ☐ 확인' && !/^---+$/.test(line.trim())) bodyLines.push(line);
  }
  flushItem();
  return categories;
}

const CAT_COLORS: Record<string, string> = {
  A: '#1677ff', B: '#722ed1', C: '#eb2f96', D: '#fa541c', E: '#faad14',
  F: '#13c2c2', G: '#52c41a', H: '#2f54eb', I: '#fa8c16', J: '#f5222d',
  K: '#a0d911', L: '#1890ff', M: '#9254de', N: '#ff7a45', O: '#36cfc9',
  P: '#597ef7', Q: '#ff4d4f', R: '#73d13d', S: '#ffa940',
};

function getRank(pct: number): { title: string; icon: React.ReactNode } {
  if (pct >= 100) return { title: '테스트 마스터', icon: <TrophyFilled style={{ fontSize: 24 }} /> };
  if (pct >= 75) return { title: '전문 테스터', icon: <CrownFilled style={{ fontSize: 24 }} /> };
  if (pct >= 50) return { title: '고급 테스터', icon: <FireFilled style={{ fontSize: 24 }} /> };
  if (pct >= 25) return { title: '중급 테스터', icon: <StarFilled style={{ fontSize: 24 }} /> };
  return { title: '초보 테스터', icon: <StarFilled style={{ fontSize: 24, opacity: 0.5 }} /> };
}

function heroGradient(pct: number) {
  if (pct >= 100) return 'linear-gradient(135deg, #237804 0%, #52c41a 50%, #73d13d 100%)';
  if (pct >= 75) return 'linear-gradient(135deg, #531dab 0%, #722ed1 50%, #9254de 100%)';
  if (pct >= 50) return 'linear-gradient(135deg, #d48806 0%, #faad14 50%, #ffc53d 100%)';
  if (pct >= 25) return 'linear-gradient(135deg, #0958d9 0%, #1677ff 50%, #4096ff 100%)';
  return 'linear-gradient(135deg, #434343 0%, #595959 50%, #8c8c8c 100%)';
}

const CHECKLIST_KEY = 'zensai-test-checklist-v1';

const QUEST_STYLES = `
  .quest-item { border: 1px solid #f0f0f0; border-radius: 8px; margin-bottom: 6px; overflow: hidden; transition: all 0.3s ease; background: #fff; }
  .quest-item:hover { border-color: #d9d9d9; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .quest-done { background: linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%) !important; border-color: #b7eb8f !important; }
  .quest-done:hover { border-color: #95de64 !important; }
  .quest-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; user-select: none; }
  .quest-check {
    width: 22px; height: 22px; border-radius: 50%; border: 2px solid #d9d9d9;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.3s; flex-shrink: 0;
  }
  .quest-done .quest-check { border-color: #52c41a; background: #52c41a; }
  .quest-title { font-weight: 600; flex: 1; font-size: 13px; transition: color 0.3s; }
  .quest-done .quest-title { color: #aaa; text-decoration: line-through; }
  .quest-expand { font-size: 11px; color: #bbb; padding: 2px 8px; border-radius: 4px; transition: all 0.2s; }
  .quest-expand:hover { background: #f5f5f5; color: #666; }
  .quest-detail {
    padding: 8px 16px 14px 48px; font-size: 13px; color: #555; line-height: 1.8;
    border-top: 1px dashed #f0f0f0;
  }
  .quest-detail p { margin: 2px 0; }
  .quest-detail strong { color: #333; }
  .quest-detail .inline-code { background: #f0f0f0; color: #d63384; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: Consolas, Monaco, monospace; }
  .quest-detail .md-list { padding-left: 16px; margin: 4px 0; }
  .quest-detail .md-list li { margin: 1px 0; }
  .quest-detail .md-blockquote { margin: 6px 0; padding: 4px 12px; font-size: 12px; border-left: 3px solid #1677ff; background: #f0f7ff; color: #555; }
  .quest-detail .md-code-block { background: #1e1e2e; color: #cdd6f4; border-radius: 6px; padding: 10px; margin: 6px 0; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 12px; line-height: 1.5; }
  @keyframes catClear { 0%{transform:scale(1)} 50%{transform:scale(1.04)} 100%{transform:scale(1)} }
  .cat-clear { animation: catClear 0.5s ease; }
`;

/* ──────────────────────────────
   Vitest JSON 타입
   ────────────────────────────── */

interface VitestAssertion {
  ancestorTitles: string[];
  title: string;
  status: 'passed' | 'failed';
  duration: number;
  failureMessages: string[];
  fullName: string;
}

interface VitestTestResult {
  name: string;
  status: string;
  startTime: number;
  endTime: number;
  assertionResults: VitestAssertion[];
}

interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestResult[];
}

/* ──────────────────────────────
   Playwright E2E JSON 타입
   ────────────────────────────── */

interface PwAttachment { name: string; contentType: string; path?: string }
interface PwResult { status: string; duration: number; attachments: PwAttachment[] }
interface PwTest { projectName: string; status: string; results: PwResult[] }
interface PwSpec { title: string; tests: PwTest[] }
interface PwSuite { title: string; file: string; suites: PwSuite[]; specs: PwSpec[] }
interface PwStats { startTime: string; duration: number; expected: number; unexpected: number; skipped: number; flaky: number }
interface PwReport { suites: PwSuite[]; stats: PwStats }

interface E2eTestItem {
  key: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshots: string[];  // relative paths from test-results/
}
interface E2eFileGroup {
  key: string;
  file: string;
  title: string;
  tests: E2eTestItem[];
  totalDuration: number;
}

function flattenSuiteSpecs(suite: PwSuite, prefix = ''): PwSpec[] {
  const specs: PwSpec[] = (suite.specs || []).map(s => ({
    ...s,
    title: prefix ? `${prefix} › ${s.title}` : s.title,
  }));
  for (const child of (suite.suites || [])) {
    specs.push(...flattenSuiteSpecs(child, child.title));
  }
  return specs;
}

function parseE2eReport(report: PwReport): E2eFileGroup[] {
  return (report.suites || []).filter(s => (s.suites && s.suites.length > 0) || (s.specs && s.specs.length > 0)).map((fileSuite, fi) => {
    const file = fileSuite.file || `suite-${fi}`;
    const allSpecs = flattenSuiteSpecs(fileSuite);
    const tests: E2eTestItem[] = allSpecs.map((spec, si) => {
      const test = spec.tests[0]; // first project
      const result = test?.results?.[0];
      const status = !result ? 'skipped'
        : result.status === 'passed' ? 'passed'
        : result.status === 'skipped' ? 'skipped' : 'failed';
      const screenshots = (result?.attachments || [])
        .filter(a => a.contentType === 'image/png' && a.path)
        .map(a => {
          // 절대 경로에서 test-results/ 이후의 상대 경로 추출
          const normalized = a.path!.replace(/\\/g, '/');
          const marker = 'test-results/';
          const idx = normalized.indexOf(marker);
          return idx >= 0 ? normalized.slice(idx + marker.length) : normalized.split('/').slice(-2).join('/');
        });
      return {
        key: `${fi}-${si}`,
        title: spec.title,
        status,
        duration: result?.duration || 0,
        screenshots,
      };
    });
    const totalDuration = tests.reduce((s, t) => s + t.duration, 0);
    return { key: `e2e-${fi}`, file, title: fileSuite.title || file, tests, totalDuration };
  });
}

/* ──────────────────────────────
   파싱된 UI 타입
   ────────────────────────────── */

interface ParsedTest {
  key: string;
  method: string;
  endpoint: string;
  role: string;
  expected: string;
  status: 'passed' | 'failed';
  duration: number;
  failureMessage?: string;
  note?: string;
}

interface ParsedFile {
  key: string;
  filename: string;
  title: string;
  tests: ParsedTest[];
  totalDuration: number;
}

/* ──────────────────────────────
   Vitest JSON → UI 데이터 파싱
   ────────────────────────────── */

function parseVitestReport(report: VitestReport): ParsedFile[] {
  return report.testResults.map((file, fi) => {
    const filename = file.name.split('/').pop()?.replace(/\\/g, '/').split('/').pop() || file.name;
    const title = file.assertionResults[0]?.ancestorTitles[0] || filename;

    const tests: ParsedTest[] = file.assertionResults.map((a, ti) => {
      const desc = a.ancestorTitles[1] || '';
      // "GET /api/crm — 고객 목록" → method: GET, endpoint: /api/crm — 고객 목록
      const methodMatch = desc.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)/);
      const method = methodMatch ? methodMatch[1] : '';
      const endpoint = methodMatch ? methodMatch[2] : desc;

      // "ADMIN → 200" or "STORE_STAFF → 403 (매니저만 가능)" or "STORE_MANAGER → 자기 매장 고객만 반환"
      const titleParts = a.title.split('→').map(s => s.trim());
      const role = titleParts[0] || a.title;
      const expected = titleParts[1] || '';

      // 괄호 안 내용을 note로 분리: "403 (매니저만 가능)" → expected: "403", note: "매니저만 가능"
      const noteMatch = expected.match(/^(.+?)\s*\((.+)\)$/);
      const cleanExpected = noteMatch ? noteMatch[1] : expected;
      const note = noteMatch ? noteMatch[2] : '';

      return {
        key: `${fi}-${ti}`,
        method,
        endpoint,
        role,
        expected: cleanExpected,
        status: a.status,
        duration: Math.round(a.duration),
        failureMessage: a.failureMessages?.[0],
        note: note || undefined,
      };
    });

    return {
      key: `file-${fi}`,
      filename,
      title,
      tests,
      totalDuration: file.endTime - file.startTime,
    };
  });
}

/* ──────────────────────────────
   역할별 접근 매트릭스 (정적 — 코드 스펙)
   ────────────────────────────── */

const ROLES = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF'] as const;

interface MatrixRow {
  module: string; action: string;
  ADMIN: string; SYS_ADMIN: string; HQ_MANAGER: string; STORE_MANAGER: string; STORE_STAFF: string;
}

const matrixData: MatrixRow[] = [
  { module: '거래처', action: '조회', ADMIN: '전체', SYS_ADMIN: '전체', HQ_MANAGER: '전체', STORE_MANAGER: '자기 매장', STORE_STAFF: '자기 매장' },
  { module: '거래처', action: '등록', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'O', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '상품', action: '조회', ADMIN: '전체+원가', SYS_ADMIN: '전체+원가', HQ_MANAGER: '전체+원가', STORE_MANAGER: '원가 제외', STORE_STAFF: '원가 제외' },
  { module: '상품', action: '등록', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '재고', action: '조회', ADMIN: '전체', SYS_ADMIN: '전체', HQ_MANAGER: '전체', STORE_MANAGER: '전체', STORE_STAFF: '자기 매장' },
  { module: '재고', action: '조정', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'O', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '재고', action: '변동내역', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '매출', action: '등록', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'O' },
  { module: '매출', action: '수정', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: '당일만', STORE_STAFF: 'X' },
  { module: '매출', action: '반품', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'O', STORE_MANAGER: '30일', STORE_STAFF: 'X' },
  { module: '매출', action: '분석', ADMIN: '전체', SYS_ADMIN: '전체', HQ_MANAGER: '전체', STORE_MANAGER: '자기 매장', STORE_STAFF: '자기 매장' },
  { module: '출고', action: '전체', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'X' },
  { module: 'CRM', action: '고객', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: '자기 매장', STORE_STAFF: 'X' },
  { module: 'CRM', action: '캠페인/A/S', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'X' },
  { module: '자금', action: '전체', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '생산', action: '전체', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '시스템', action: '설정', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '코드', action: '조회', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'O' },
  { module: '코드', action: '등록', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
  { module: '직원', action: '조회', ADMIN: '전체', SYS_ADMIN: '전체', HQ_MANAGER: '전체', STORE_MANAGER: '자기 STAFF', STORE_STAFF: 'X' },
  { module: '대시보드', action: '조회', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'O' },
  { module: '창고', action: '조회', ADMIN: 'O', SYS_ADMIN: 'O', HQ_MANAGER: 'O', STORE_MANAGER: 'O', STORE_STAFF: 'O' },
  { module: '창고', action: '등록', ADMIN: 'O', SYS_ADMIN: 'X', HQ_MANAGER: 'X', STORE_MANAGER: 'X', STORE_STAFF: 'X' },
];

/* ──────────── Helper ──────────── */

function renderAccess(val: string) {
  if (val === 'O') return <Tag color="green" style={{ minWidth: 28, textAlign: 'center' }}>O</Tag>;
  if (val === 'X') return <Tag color="red" style={{ minWidth: 28, textAlign: 'center' }}>X</Tag>;
  if (val.includes('자기')) return <Tag color="blue">{val}</Tag>;
  if (val.includes('원가')) return <Tag color="orange">{val}</Tag>;
  if (val.includes('당일') || val.includes('30일')) return <Tag color="gold">{val}</Tag>;
  if (val.includes('전체')) return <Tag color="green">{val}</Tag>;
  return <Tag>{val}</Tag>;
}

function methodColor(method: string) {
  switch (method) { case 'GET': return '#52c41a'; case 'POST': return '#1677ff'; case 'PUT': return '#fa8c16'; case 'DELETE': return '#ff4d4f'; default: return '#999'; }
}

function roleColor(role: string) {
  switch (role) { case 'ADMIN': return 'red'; case 'SYS_ADMIN': return 'volcano'; case 'HQ_MANAGER': return 'orange'; case 'STORE_MANAGER': return 'blue'; case 'STORE_STAFF': return 'cyan'; default: return 'default'; }
}

/* ──────────── Component ──────────── */

export default function TestReportPage() {
  const [report, setReport] = useState<VitestReport | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<string>('E2E 테스트');

  /* ── E2E 상태 ── */
  const [e2eReport, setE2eReport] = useState<PwReport | null>(null);
  const [e2eUpdatedAt, setE2eUpdatedAt] = useState('');
  const [e2eLoading, setE2eLoading] = useState(false);
  const [e2eNotFound, setE2eNotFound] = useState(false);

  /* ── 체크리스트 상태 ── */
  const [checklistMd, setChecklistMd] = useState('');
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    try { const s = localStorage.getItem(CHECKLIST_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await systemApi.getTestResults();
      if (res.success) {
        setReport(res.data.results);
        setUpdatedAt(res.data.updatedAt);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChecklist = useCallback(async () => {
    setChecklistLoading(true);
    try {
      const res = await apiFetch('/api/system/docs/store-test-checklist.md');
      const data = await res.json();
      if (data.success) setChecklistMd(data.data.content);
    } catch { /* silent */ }
    finally { setChecklistLoading(false); }
  }, []);

  const loadE2eData = useCallback(async () => {
    setE2eLoading(true);
    try {
      const res = await systemApi.getE2eResults();
      if (res.success) {
        setE2eReport(res.data.results);
        setE2eUpdatedAt(res.data.updatedAt);
        setE2eNotFound(false);
      } else {
        setE2eNotFound(true);
      }
    } catch {
      setE2eNotFound(true);
    } finally {
      setE2eLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); loadChecklist(); loadE2eData(); }, [loadData, loadChecklist, loadE2eData]);

  const parsedFiles = useMemo(() => report ? parseVitestReport(report) : [], [report]);
  const e2eFiles = useMemo(() => e2eReport ? parseE2eReport(e2eReport) : [], [e2eReport]);

  /* ── 체크리스트 파싱 + 업적 통계 ── */
  const parsedChecklist = useMemo(() => parseChecklist(checklistMd), [checklistMd]);
  const totalCheckItems = useMemo(() => parsedChecklist.reduce((s, c) => s + c.items.length, 0), [parsedChecklist]);
  const completedCheckItems = useMemo(() => parsedChecklist.reduce((s, c) => s + c.items.filter(i => checkedItems[i.id]).length, 0), [parsedChecklist, checkedItems]);
  const completionPct = totalCheckItems > 0 ? Math.round((completedCheckItems / totalCheckItems) * 100) : 0;
  const rank = useMemo(() => getRank(completionPct), [completionPct]);

  const toggleCheck = useCallback((itemId: string) => {
    setCheckedItems(prev => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId]; else next[itemId] = true;
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const totalTests = report?.numTotalTests ?? 0;
  const passedTests = report?.numPassedTests ?? 0;
  const failedTests = report?.numFailedTests ?? 0;
  const fileCount = parsedFiles.length;

  /* ── 파일 없음 ── */
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  /* notFound는 test-results.json 없음 — 체크리스트 탭은 독립이므로 차단하지 않음 */

  /* ── 테이블 columns ── */
  const testColumns = [
    {
      title: 'Method', dataIndex: 'method', key: 'method', width: 80,
      render: (m: string) => m ? <Tag style={{ color: '#fff', background: methodColor(m), border: 'none', fontWeight: 700, fontSize: 11 }}>{m}</Tag> : null,
    },
    {
      title: '엔드포인트', dataIndex: 'endpoint', key: 'endpoint',
      render: (v: string) => <code style={{ fontSize: 12, color: '#333' }}>{v}</code>,
    },
    {
      title: '역할', dataIndex: 'role', key: 'role', width: 150,
      render: (r: string) => <Tag color={roleColor(r)} style={{ fontSize: 11 }}>{r}</Tag>,
    },
    {
      title: '예상', dataIndex: 'expected', key: 'expected', width: 120,
      render: (v: string) => {
        const num = parseInt(v);
        if (!isNaN(num)) {
          const color = num < 300 ? '#52c41a' : num < 400 ? '#fa8c16' : '#ff4d4f';
          return <Tag style={{ background: `${color}15`, color, border: `1px solid ${color}40`, fontWeight: 600 }}>{v}</Tag>;
        }
        return <span style={{ fontSize: 12, color: '#666' }}>{v}</span>;
      },
    },
    {
      title: '결과', dataIndex: 'status', key: 'status', width: 70, align: 'center' as const,
      render: (s: string) => s === 'passed'
        ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
        : <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />,
    },
    {
      title: '소요', dataIndex: 'duration', key: 'duration', width: 70, align: 'right' as const,
      render: (d: number) => <Typography.Text type="secondary" style={{ fontSize: 11 }}>{d}ms</Typography.Text>,
    },
    {
      title: '비고', dataIndex: 'note', key: 'note', width: 160,
      render: (n?: string, r?: ParsedTest) => {
        if (r?.failureMessage) return <Typography.Text type="danger" style={{ fontSize: 11 }}>{r.failureMessage.slice(0, 80)}</Typography.Text>;
        return n ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{n}</Typography.Text> : null;
      },
    },
  ];

  const matrixColumns = [
    { title: '모듈', dataIndex: 'module', key: 'module', width: 80, render: (v: string) => <strong>{v}</strong> },
    { title: '기능', dataIndex: 'action', key: 'action', width: 80 },
    ...ROLES.map(role => ({
      title: <Tag color={roleColor(role)} style={{ fontSize: 11 }}>{role}</Tag>,
      dataIndex: role, key: role, width: 110, align: 'center' as const,
      render: (v: string) => renderAccess(v),
    })),
  ];

  const collapseItems = parsedFiles.map(f => {
    const passed = f.tests.filter(t => t.status === 'passed').length;
    const total = f.tests.length;
    const allPass = passed === total;

    return {
      key: f.key,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <strong style={{ flex: '0 0 200px' }}>{f.title}</strong>
          <Typography.Text type="secondary" style={{ flex: 1, fontSize: 12 }}>{f.filename}</Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag style={{ fontSize: 11, color: '#999' }}>{Math.round(f.totalDuration / 1000 * 10) / 10}s</Tag>
            <Badge
              count={`${passed}/${total}`}
              style={{ backgroundColor: allPass ? '#52c41a' : '#ff4d4f', fontSize: 11, fontWeight: 700, padding: '0 8px' }}
            />
          </div>
        </div>
      ),
      children: (
        <Table
          dataSource={f.tests}
          columns={testColumns}
          rowKey="key"
          size="small"
          pagination={false}
          style={{ margin: '-8px -8px -16px' }}
        />
      ),
    };
  });

  const runTime = report ? dayjs(report.startTime).format('YYYY-MM-DD HH:mm:ss') : '';

  return (
    <>
      <PageHeader
        title="API 접근 권한 테스트 보고서"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {updatedAt && <Tag icon={<ClockCircleOutlined />} color="default">{dayjs(updatedAt).format('MM-DD HH:mm')} 생성</Tag>}
            {runTime && <Tag icon={<ExperimentOutlined />} color="processing">{runTime} 실행</Tag>}
            <Button size="small" icon={<ReloadOutlined />} onClick={() => { loadData(); message.info('새로고침 중...'); }}>새로고침</Button>
          </div>
        }
      />

      {/* ── Vitest 요약 카드 (체크리스트 외 탭) ── */}
      {view !== '매장 체크리스트' && !notFound && <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1677ff' }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>전체 테스트</span>}
              value={totalTests} suffix="건"
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff', fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>통과</span>}
              value={passedTests} suffix="건"
              prefix={<CheckCircleFilled style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: `3px solid ${failedTests > 0 ? '#ff4d4f' : '#d9d9d9'}` }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>실패</span>}
              value={failedTests} suffix="건"
              prefix={<CloseCircleFilled style={{ color: failedTests > 0 ? '#ff4d4f' : '#d9d9d9' }} />}
              valueStyle={{ color: failedTests > 0 ? '#ff4d4f' : '#999', fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>테스트 파일</span>}
              value={fileCount} suffix="개"
              prefix={<SafetyCertificateOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1', fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 프로그레스 바 ── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, height: 32, borderRadius: 6, overflow: 'hidden' }}>
          {parsedFiles.map(f => {
            const pct = (f.tests.length / totalTests) * 100;
            const allPass = f.tests.every(t => t.status === 'passed');
            return (
              <Tooltip key={f.key} title={`${f.title}: ${f.tests.length}건 ${allPass ? '전체 통과' : '실패 있음'}`}>
                <div
                  style={{
                    width: `${pct}%`, minWidth: 24,
                    background: allPass ? '#52c41a' : '#ff4d4f',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    transition: 'opacity .2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  {f.tests.length}
                </div>
              </Tooltip>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
          {parsedFiles.map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: f.tests.every(t => t.status === 'passed') ? '#52c41a' : '#ff4d4f' }} />
              {f.title}
            </div>
          ))}
        </div>
      </Card>
      </>}

      {/* ── 탭 전환 ── */}
      <Segmented
        options={[
          { label: 'E2E 테스트', value: 'E2E 테스트', icon: <ExperimentOutlined /> },
          { label: '매장 체크리스트', value: '매장 체크리스트', icon: <OrderedListOutlined /> },
          { label: '결과 상세', value: '결과 상세', icon: <FileTextOutlined /> },
          { label: '역할별 매트릭스', value: '역할별 매트릭스', icon: <SafetyCertificateOutlined /> },
          { label: '검증 범위', value: '검증 범위', icon: <EyeOutlined /> },
        ]}
        value={view}
        onChange={v => setView(v as string)}
        style={{ marginBottom: 16 }}
      />

      {view === 'E2E 테스트' && (e2eLoading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : e2eNotFound ? (
        <Empty
          image={<WarningOutlined style={{ fontSize: 48, color: '#faad14' }} />}
          description={
            <div>
              <p style={{ marginBottom: 4 }}>E2E 테스트 결과가 없습니다</p>
              <code style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 4, fontSize: 12 }}>npx playwright test</code>
            </div>
          }
        />
      ) : (() => {
        const stats = e2eReport!.stats;
        const totalE2e = stats.expected + stats.unexpected + stats.skipped;
        const passedE2e = stats.expected;
        const failedE2e = stats.unexpected;
        const skippedE2e = stats.skipped;
        const durationSec = Math.round(stats.duration / 1000);
        const passPct = totalE2e > 0 ? Math.round((passedE2e / totalE2e) * 100) : 0;
        return (
          <>
            {/* ── E2E 히어로 요약 ── */}
            <Card style={{ marginBottom: 16, background: failedE2e > 0 ? 'linear-gradient(135deg, #cf1322 0%, #ff4d4f 50%, #ff7875 100%)' : 'linear-gradient(135deg, #237804 0%, #52c41a 50%, #73d13d 100%)', border: 'none', borderRadius: 12 }}>
              <Row align="middle" gutter={24}>
                <Col>
                  <Progress
                    type="circle" percent={passPct} size={100}
                    strokeColor="#fff" trailColor="rgba(255,255,255,0.2)" strokeWidth={8}
                    format={p => <div style={{ color: '#fff', textAlign: 'center' }}><div style={{ fontSize: 26, fontWeight: 800 }}>{p}%</div><div style={{ fontSize: 10, opacity: 0.8 }}>통과율</div></div>}
                  />
                </Col>
                <Col flex={1}>
                  <div style={{ color: '#fff' }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>Playwright E2E 브라우저 테스트</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                      {failedE2e === 0 ? 'ALL PASSED' : `${failedE2e}건 실패`}
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                      <div><strong style={{ fontSize: 22 }}>{passedE2e}</strong> <span style={{ opacity: 0.8 }}>통과</span></div>
                      <div><strong style={{ fontSize: 22 }}>{failedE2e}</strong> <span style={{ opacity: 0.8 }}>실패</span></div>
                      <div><strong style={{ fontSize: 22 }}>{skippedE2e}</strong> <span style={{ opacity: 0.8 }}>스킵</span></div>
                      <div><strong style={{ fontSize: 22 }}>{e2eFiles.length}</strong> <span style={{ opacity: 0.8 }}>파일</span></div>
                      <div><strong style={{ fontSize: 22 }}>{durationSec}s</strong> <span style={{ opacity: 0.8 }}>소요</span></div>
                    </div>
                  </div>
                </Col>
                <Col>
                  {e2eUpdatedAt && <Tag style={{ color: '#fff', background: 'rgba(255,255,255,0.2)', border: 'none' }} icon={<ClockCircleOutlined />}>{dayjs(e2eUpdatedAt).format('MM-DD HH:mm')}</Tag>}
                  <Button
                    ghost size="small"
                    style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', marginLeft: 8 }}
                    icon={<ReloadOutlined />}
                    onClick={() => { loadE2eData(); message.info('E2E 결과 새로고침...'); }}
                  >새로고침</Button>
                </Col>
              </Row>
            </Card>

            {/* ── 파일별 프로그레스 바 ── */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 4, height: 28, borderRadius: 6, overflow: 'hidden' }}>
                {e2eFiles.map(f => {
                  const pct = (f.tests.length / totalE2e) * 100;
                  const allPass = f.tests.every(t => t.status === 'passed' || t.status === 'skipped');
                  return (
                    <Tooltip key={f.key} title={`${f.title || f.file}: ${f.tests.length}건`}>
                      <div style={{
                        width: `${pct}%`, minWidth: 20,
                        background: allPass ? '#52c41a' : '#ff4d4f',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      }}>
                        {f.tests.length}
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {e2eFiles.map(f => {
                  const allPass = f.tests.every(t => t.status === 'passed' || t.status === 'skipped');
                  return (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: allPass ? '#52c41a' : '#ff4d4f' }} />
                      {f.title || f.file}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ── 섹션별 Collapse ── */}
            <Collapse
              defaultActiveKey={[]}
              items={e2eFiles.map(f => {
                const passed = f.tests.filter(t => t.status === 'passed').length;
                const failed = f.tests.filter(t => t.status === 'failed').length;
                const skipped = f.tests.filter(t => t.status === 'skipped').length;
                const total = f.tests.length;
                const allPass = failed === 0;
                return {
                  key: f.key,
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                      <strong style={{ flex: '0 0 auto', fontSize: 13 }}>{f.title || f.file}</strong>
                      <Typography.Text type="secondary" style={{ flex: 1, fontSize: 11 }}>{f.file}</Typography.Text>
                      <Tag style={{ fontSize: 11, color: '#999' }}>{Math.round(f.totalDuration / 1000 * 10) / 10}s</Tag>
                      {skipped > 0 && <Tag color="orange" style={{ fontSize: 11 }}>{skipped} skip</Tag>}
                      <Badge
                        count={`${passed}/${total}`}
                        style={{ backgroundColor: allPass ? '#52c41a' : '#ff4d4f', fontSize: 11, fontWeight: 700, padding: '0 8px' }}
                      />
                    </div>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {f.tests.map(t => (
                        <div key={t.key} style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {t.status === 'passed' ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
                              : t.status === 'failed' ? <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 16 }} />
                              : <ClockCircleOutlined style={{ color: '#faad14', fontSize: 16 }} />}
                            <span style={{ flex: 1, fontSize: 13 }}>{t.title}</span>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{Math.round(t.duration)}ms</Typography.Text>
                          </div>
                          {t.screenshots.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {t.screenshots.map((ss, i) => {
                                const ssUrl = `/api/system/e2e-screenshots?path=${encodeURIComponent(ss)}`;
                                return (
                                  <a key={i} href={ssUrl} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={ssUrl}
                                      alt={`${t.title} screenshot ${i + 1}`}
                                      style={{
                                        maxWidth: 480, maxHeight: 300, borderRadius: 6,
                                        border: '1px solid #e8e8e8', cursor: 'pointer',
                                        transition: 'box-shadow 0.2s',
                                      }}
                                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)')}
                                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                                    />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ),
                };
              })}
            />
          </>
        );
      })())}

      {view === '매장 체크리스트' && (
        <>
          <style>{QUEST_STYLES}</style>

          {checklistLoading ? (
            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
          ) : !checklistMd ? (
            <Empty description="store-test-checklist.md 파일을 찾을 수 없습니다." />
          ) : (
            <>
              {/* ── 히어로 카드 ── */}
              <Card style={{ marginBottom: 24, background: heroGradient(completionPct), border: 'none', borderRadius: 12 }}>
                <Row align="middle" gutter={24}>
                  <Col>
                    <Progress
                      type="circle" percent={completionPct} size={120}
                      strokeColor="#fff" trailColor="rgba(255,255,255,0.2)" strokeWidth={8}
                      format={p => (
                        <div style={{ color: '#fff', textAlign: 'center' }}>
                          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{p}%</div>
                          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>달성률</div>
                        </div>
                      )}
                    />
                  </Col>
                  <Col flex={1}>
                    <div style={{ color: '#fff' }}>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>매장 테스트 진행 현황</div>
                      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {rank.icon} {rank.title}
                      </div>
                      <div style={{ display: 'flex', gap: 28, fontSize: 14 }}>
                        <div><strong style={{ fontSize: 24 }}>{completedCheckItems}</strong> <span style={{ opacity: 0.8 }}>완료</span></div>
                        <div><strong style={{ fontSize: 24 }}>{totalCheckItems - completedCheckItems}</strong> <span style={{ opacity: 0.8 }}>남음</span></div>
                        <div><strong style={{ fontSize: 24 }}>{totalCheckItems}</strong> <span style={{ opacity: 0.8 }}>전체</span></div>
                      </div>
                      {completionPct >= 100 && (
                        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700 }}>
                          모든 테스트를 완료했습니다!
                        </div>
                      )}
                    </div>
                  </Col>
                  <Col>
                    <Button
                      ghost size="small"
                      style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                      onClick={() => { setCheckedItems({}); localStorage.removeItem(CHECKLIST_KEY); message.success('초기화 완료'); }}
                    >
                      초기화
                    </Button>
                  </Col>
                </Row>
              </Card>

              {/* ── 카테고리 그리드 ── */}
              <Row gutter={[10, 10]} style={{ marginBottom: 24 }}>
                {parsedChecklist.map(cat => {
                  const done = cat.items.filter(i => checkedItems[i.id]).length;
                  const total = cat.items.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const complete = done === total && total > 0;
                  const color = CAT_COLORS[cat.code] || '#999';
                  return (
                    <Col xs={12} sm={8} md={6} lg={4} key={cat.code}>
                      <Card
                        size="small" hoverable
                        className={complete ? 'cat-clear' : ''}
                        style={{
                          borderTop: `3px solid ${color}`,
                          ...(complete ? { boxShadow: `0 0 14px ${color}30`, borderColor: color } : {}),
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setActiveCategory(prev => prev === cat.code ? null : cat.code);
                          setTimeout(() => document.getElementById(`cat-${cat.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: 6, background: complete ? '#52c41a' : color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 12,
                          }}>
                            {complete ? <CheckCircleFilled style={{ fontSize: 14 }} /> : cat.code}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cat.title}
                          </span>
                        </div>
                        <Progress percent={pct} size="small" strokeColor={complete ? '#52c41a' : color} showInfo={false} />
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {done}/{total}{complete && <span style={{ color: '#52c41a', fontWeight: 700 }}> CLEAR!</span>}
                        </div>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              {/* ── 상세 퀘스트 목록 ── */}
              <Collapse
                activeKey={activeCategory ? [activeCategory] : []}
                onChange={keys => setActiveCategory((keys as string[])[0] || null)}
                style={{ background: '#fafafa', borderRadius: 8 }}
                items={parsedChecklist.map(cat => {
                  const done = cat.items.filter(i => checkedItems[i.id]).length;
                  const total = cat.items.length;
                  const complete = done === total && total > 0;
                  const color = CAT_COLORS[cat.code] || '#999';
                  return {
                    key: cat.code,
                    label: (
                      <div id={`cat-${cat.code}`} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: complete ? '#52c41a' : color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: 15,
                        }}>
                          {complete ? <CheckCircleFilled /> : cat.code}
                        </div>
                        <strong style={{ flex: 1, fontSize: 15 }}>{cat.title}</strong>
                        <Progress percent={Math.round((done / total) * 100)} size="small" style={{ width: 100 }} strokeColor={complete ? '#52c41a' : color} />
                        <Badge
                          count={`${done}/${total}`}
                          style={{ backgroundColor: complete ? '#52c41a' : done > 0 ? '#1677ff' : '#d9d9d9', fontWeight: 700, padding: '0 8px' }}
                        />
                      </div>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {cat.items.map(item => {
                          const checked = !!checkedItems[item.id];
                          const expanded = expandedItem === item.id;
                          return (
                            <div key={item.id} className={`quest-item ${checked ? 'quest-done' : ''}`}>
                              <div className="quest-header">
                                <div
                                  className="quest-check"
                                  onClick={e => { e.stopPropagation(); toggleCheck(item.id); }}
                                >
                                  {checked && <CheckCircleFilled style={{ color: '#fff', fontSize: 14 }} />}
                                </div>
                                <Tag style={{ background: color, color: '#fff', border: 'none', fontWeight: 700, fontSize: 11, margin: 0, flexShrink: 0 }}>
                                  {item.id}
                                </Tag>
                                <span
                                  className="quest-title"
                                  onClick={() => setExpandedItem(expanded ? null : item.id)}
                                >
                                  {item.title}
                                </span>
                                <span
                                  className="quest-expand"
                                  onClick={() => setExpandedItem(expanded ? null : item.id)}
                                >
                                  {expanded ? '접기' : '상세'}
                                </span>
                              </div>
                              {expanded && (
                                <div
                                  className="quest-detail"
                                  dangerouslySetInnerHTML={{ __html: markdownToHtml(item.body) }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ),
                  };
                })}
              />
            </>
          )}
        </>
      )}

      {view === '결과 상세' && (notFound ? (
        <Empty
          image={<WarningOutlined style={{ fontSize: 48, color: '#faad14' }} />}
          description={
            <div>
              <p style={{ marginBottom: 4 }}>테스트 결과 파일이 없습니다</p>
              <code style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 4, fontSize: 12 }}>cd server && npm run test:report</code>
            </div>
          }
        />
      ) : <Collapse items={collapseItems} defaultActiveKey={[]} />)}

      {view === '역할별 매트릭스' && (
        <Card size="small" title="역할별 API 접근 매트릭스">
          <Table
            dataSource={matrixData.map((r, i) => ({ ...r, _key: i }))}
            columns={matrixColumns}
            rowKey="_key"
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
          />
        </Card>
      )}

      {view === '검증 범위' && (notFound ? (
        <Empty
          image={<WarningOutlined style={{ fontSize: 48, color: '#faad14' }} />}
          description={
            <div>
              <p style={{ marginBottom: 4 }}>테스트 결과 파일이 없습니다</p>
              <code style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 4, fontSize: 12 }}>cd server && npm run test:report</code>
            </div>
          }
        />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card size="small" title={<><CheckCircleFilled style={{ color: '#52c41a' }} /> 검증 완료 ({passedTests}건 통과)</>}>
              <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2.2 }}>
                {parsedFiles.map(f => (
                  <li key={f.key}>
                    <Tag color={f.tests.every(t => t.status === 'passed') ? 'green' : 'red'}>
                      {f.tests.every(t => t.status === 'passed') ? '통과' : '실패'}
                    </Tag>
                    {f.title} ({f.tests.length}건)
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card size="small" title={<><EyeInvisibleOutlined style={{ color: '#faad14' }} /> 미검증 (향후 추가 필요)</>}>
              <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2.2 }}>
                <li><Tag color="gold">교환</Tag> 교환 API 테스트 3건 스킵 (픽스처 보완 필요)</li>
                <li><Tag color="gold">바코드</Tag> 바코드 조회/인쇄 권한</li>
                <li><Tag color="gold">알림</Tag> 카카오 알림톡 발송 권한</li>
                <li><Tag color="gold">2단계 권한</Tag> DB permissions JSONB 기반 클라이언트 토글</li>
                <li><Tag color="gold">클라이언트</Tag> 프론트엔드 UI 동작 (브라우저 테스트 없음)</li>
              </ul>
            </Card>
          </Col>
          <Col span={24}>
            <Card size="small" title={<><UnlockOutlined style={{ color: '#1677ff' }} /> 테스트 실행 방법</>}>
              <Row gutter={24}>
                <Col xs={24} md={8}>
                  <Typography.Text strong>보고서 생성</Typography.Text>
                  <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 4 }}>cd server{'\n'}npm run test:report</pre>
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text strong>Watch 모드</Typography.Text>
                  <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 4 }}>cd server{'\n'}npm run test:watch</pre>
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text strong>브라우저 UI</Typography.Text>
                  <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 4 }}>cd server{'\n'}npm run test:ui</pre>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      ))}
    </>
  );
}
