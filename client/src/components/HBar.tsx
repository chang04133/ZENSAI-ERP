import { COLORS } from '../utils/constants';

interface HBarProps {
  data: Array<{ label: string; value: number; sub?: string }>;
  colorKey?: Record<string, string>;
  /** 값 포맷 함수 (기본: toLocaleString() + '개') */
  formatValue?: (v: number) => string;
  onBarClick?: (label: string) => void;
}

export default function HBar({ data, colorKey, formatValue, onBarClick }: HBarProps) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const fmtVal = formatValue || ((v: number) => `${v.toLocaleString()}개`);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const c = colorKey?.[d.label] || COLORS[i % COLORS.length];
        const clickable = !!onBarClick;
        return (
          <div key={d.label} onClick={() => onBarClick?.(d.label)}
            style={{ cursor: clickable ? 'pointer' : 'default', borderRadius: 8, padding: '2px 4px', transition: 'background 0.15s' }}
            onMouseEnter={(e) => clickable && (e.currentTarget.style.background = '#f0f1f3')}
            onMouseLeave={(e) => clickable && (e.currentTarget.style.background = 'transparent')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                {fmtVal(d.value)}
                {d.sub && <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{d.sub}</span>}
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${c}, ${c}aa)`,
                borderRadius: 6, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
