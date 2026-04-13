import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Spin, Anchor, message, Input, Empty, Typography, Tabs, Tag } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import DOMPurify from 'dompurify';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

/* ── 문서 메타 ── */
const DOC_LABELS: Record<string, string> = {
  'zensai-erp-system.md': '시스템 현황',
  'testing-guide.md': '테스팅 가이드',
  'access-test-report.md': '접근권한 테스트',
  'test-execution-report.md': '테스트 실행 보고서',
  'change-report.md': '변경 내역 보고서',
  'shipment-system.md': '출고 시스템',
  'store-test-checklist.md': '매장 테스트 체크리스트',
};

function docLabel(filename: string) {
  return DOC_LABELS[filename] || filename.replace(/\.md$/, '');
}

/* ── Markdown → HTML 변환 ── */

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
    flushList();
    html.push(`<p>${parseInline(line)}</p>`);
  }
  if (inTable) flushTable();
  flushList();
  return html.join('\n');
}

/* ── TOC 추출 ── */
interface TocItem { id: string; title: string; level: number }

function extractToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const title = m[2].replace(/\*\*/g, '').replace(/`/g, '');
      const id = title.replace(/[^a-zA-Z0-9가-힣\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
      items.push({ id, title, level: m[1].length });
    }
  }
  return items;
}

/* ── 검색 하이라이트 ── */
function highlightSearch(htmlStr: string, query: string): string {
  if (!query.trim()) return htmlStr;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return htmlStr.replace(/>([^<]+)</g, (_match, text: string) => {
    return '>' + text.replace(re, '<mark class="md-highlight">$1</mark>') + '<';
  });
}

/* ── Styles ── */
const STYLES = `
  .md-doc-container { display: flex; gap: 24px; max-width: 100%; }
  .md-doc-content {
    flex: 1; min-width: 0; overflow-x: auto;
    background: #fff; border-radius: 8px; padding: 32px;
    border: 1px solid #f0f0f0;
    font-size: 14px; line-height: 1.8; color: #333;
  }
  .md-doc-toc {
    width: 240px; flex-shrink: 0; position: sticky; top: 80px; align-self: flex-start;
    max-height: calc(100vh - 120px); overflow-y: auto;
  }
  .md-h1 { font-size: 24px; font-weight: 700; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #1677ff; color: #1677ff; }
  .md-h2 { font-size: 20px; font-weight: 700; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e8e8e8; color: #222; }
  .md-h3 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; color: #333; }
  .md-h4 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; color: #555; }
  .md-h5, .md-h6 { font-size: 13px; font-weight: 600; margin: 12px 0 4px; color: #666; }
  .md-code-block {
    background: #1e1e2e; color: #cdd6f4; border-radius: 6px;
    padding: 16px; margin: 12px 0; overflow-x: auto;
    font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.6;
  }
  .inline-code {
    background: #f5f5f5; color: #d63384; padding: 2px 6px; border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace; font-size: 13px;
  }
  .md-table-wrap { overflow-x: auto; margin: 12px 0; }
  .md-table-wrap table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .md-table-wrap th { background: #fafafa; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e8e8e8; white-space: nowrap; }
  .md-table-wrap td { padding: 6px 12px; border: 1px solid #e8e8e8; vertical-align: top; }
  .md-table-wrap tr:hover td { background: #f0f7ff; }
  .md-blockquote { border-left: 3px solid #1677ff; padding: 8px 16px; margin: 12px 0; background: #f0f7ff; color: #555; font-size: 13px; }
  .md-list { padding-left: 20px; margin: 6px 0; }
  .md-list li { margin: 2px 0; }
  .md-highlight { background: #ffe58f; padding: 1px 2px; border-radius: 2px; }
  hr { border: none; border-top: 1px solid #e8e8e8; margin: 24px 0; }
  .md-doc-content p { margin: 4px 0; }
  @media (max-width: 1200px) { .md-doc-toc { display: none; } }
`;

/* ── 자동 갱신 간격 (ms) ── */
const POLL_INTERVAL = 30_000;

/* ── Component ── */

interface DocMeta { filename: string; updatedAt: string }

export default function SystemDocPage() {
  const [docList, setDocList] = useState<DocMeta[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const lastUpdatedRef = useRef<Record<string, string>>({});

  // 문서 목록 로드
  const loadDocList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/docs');
      const data = await res.json();
      if (data.success) {
        setDocList(data.data);
        if (!activeFile && data.data.length > 0) setActiveFile(data.data[0].filename);
      }
    } catch { /* silent */ }
  }, [activeFile]);

  // 개별 문서 로드
  const loadDoc = useCallback(async (filename: string, silent = false) => {
    if (!filename) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/api/system/docs/${filename}`);
      const data = await res.json();
      if (data.success) {
        // silent 모드(폴링)에서는 변경된 경우에만 업데이트
        if (silent && lastUpdatedRef.current[filename] === data.data.updatedAt) return;
        setMarkdown(data.data.content);
        setUpdatedAt(data.data.updatedAt);
        lastUpdatedRef.current[filename] = data.data.updatedAt;
      } else if (!silent) {
        message.error(data.error || '문서를 불러올 수 없습니다.');
      }
    } catch (err: any) {
      if (!silent) message.error('문서 로딩 실패: ' + (err?.message || '서버 연결 오류'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => { loadDocList(); }, [loadDocList]);

  // 탭 변경 시 문서 로드
  useEffect(() => { if (activeFile) loadDoc(activeFile); }, [activeFile, loadDoc]);

  // 30초 폴링으로 자동 갱신
  useEffect(() => {
    if (!activeFile) return;
    const timer = setInterval(() => loadDoc(activeFile, true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [activeFile, loadDoc]);

  const toc = useMemo(() => extractToc(markdown), [markdown]);
  const htmlContent = useMemo(() => DOMPurify.sanitize(highlightSearch(markdownToHtml(markdown), search)), [markdown, search]);

  const anchorItems = useMemo(
    () => toc.filter(t => t.level === 2).map(t => {
      const h2Idx = toc.indexOf(t);
      const nextH2Idx = toc.findIndex((x, i) => i > h2Idx && x.level === 2);
      return {
        key: t.id, href: `#${t.id}`, title: t.title,
        children: toc
          .filter((sub, si) => sub.level === 3 && si > h2Idx && (nextH2Idx === -1 || si < nextH2Idx))
          .map(sub => ({ key: sub.id, href: `#${sub.id}`, title: sub.title })),
      };
    }),
    [toc],
  );

  const tabItems = docList.map(d => ({
    key: d.filename,
    label: docLabel(d.filename),
  }));

  if (loading && !markdown) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  if (docList.length === 0 && !loading) {
    return <><PageHeader title="시스템 문서" /><Empty description="docs/ 폴더에 .md 파일이 없습니다." /></>;
  }

  return (
    <>
      <style>{STYLES}</style>
      <PageHeader
        title="시스템 문서"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {updatedAt && (
              <Tag icon={<SyncOutlined />} color="default" style={{ fontSize: 12 }}>
                {dayjs(updatedAt).format('YYYY-MM-DD HH:mm')} 수정
              </Tag>
            )}
            <Input
              placeholder="문서 내 검색..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          </div>
        }
      />
      <Tabs
        activeKey={activeFile}
        onChange={key => { setActiveFile(key); setSearch(''); }}
        items={tabItems}
        style={{ marginBottom: 16 }}
      />
      <div className="md-doc-container">
        <div
          ref={contentRef}
          className="md-doc-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
        <div className="md-doc-toc">
          <Anchor
            affix={false}
            offsetTop={80}
            items={anchorItems}
            getContainer={() => contentRef.current || window as any}
          />
        </div>
      </div>
    </>
  );
}
