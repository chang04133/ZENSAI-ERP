import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = '/api/consent';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) },
  });
  return res.json();
}

/* ═══════════════ 스타일 ═══════════════ */
const S = {
  page: {
    maxWidth: 480, margin: '0 auto', padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minHeight: '100vh', background: '#f5f5f5',
  } as React.CSSProperties,
  card: {
    background: '#fff', borderRadius: 12, padding: '24px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, textAlign: 'center' as const, marginBottom: 4, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#888', textAlign: 'center' as const, marginBottom: 24 },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12,
    paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
  },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' as const },
  labelOpt: { fontSize: 11, color: '#aaa', fontWeight: 400, marginLeft: 4 },
  input: {
    width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #d9d9d9',
    borderRadius: 8, boxSizing: 'border-box' as const, outline: 'none',
  } as React.CSSProperties,
  divider: { height: 1, background: '#f0f0f0', margin: '20px 0' },
  checkbox: {
    display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14,
    fontSize: 14, lineHeight: '1.5',
  } as React.CSSProperties,
  chkInput: { marginTop: 3, width: 20, height: 20, flexShrink: 0, accentColor: '#1677ff' } as React.CSSProperties,
  tag: { fontWeight: 700, fontSize: 11, marginRight: 4 },
  btn: {
    width: '100%', padding: '14px', fontSize: 16, fontWeight: 700,
    border: 'none', borderRadius: 10, cursor: 'pointer', color: '#fff', background: '#1677ff',
    marginTop: 8,
  } as React.CSSProperties,
  btnOff: { opacity: 0.5, cursor: 'not-allowed' },
  err: { background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#cf1322', marginBottom: 16 },
  info: { background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0958d9', marginBottom: 16 },
  ok: { textAlign: 'center' as const, padding: '32px 20px' } as React.CSSProperties,
  okIcon: { width: 64, height: 64, borderRadius: '50%', background: '#f6ffed', border: '2px solid #52c41a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32, color: '#52c41a' } as React.CSSProperties,
  privacy: {
    background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8,
    padding: '12px 14px', fontSize: 12, color: '#666', lineHeight: 1.7,
    maxHeight: 140, overflowY: 'auto' as const, marginBottom: 14, marginTop: -4,
  } as React.CSSProperties,
  footer: { textAlign: 'center' as const, marginTop: 16, fontSize: 11, color: '#bbb' } as React.CSSProperties,
};

export default function ConsentPage() {
  const { partnerCode } = useParams<{ partnerCode: string }>();

  const [storeName, setStoreName] = useState('');
  const [storeError, setStoreError] = useState('');

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [existingMsg, setExistingMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [isNew, setIsNew] = useState(true);

  // 매장 정보 로드
  useEffect(() => {
    if (!partnerCode) return;
    api(`${API_BASE}/${partnerCode}/info`).then((res) => {
      if (res.success) setStoreName(res.data.partner_name);
      else setStoreError(res.message || '매장을 찾을 수 없습니다.');
    }).catch(() => setStoreError('서버에 연결할 수 없습니다.'));
  }, [partnerCode]);

  // 전화번호 blur 시 기존 고객 자동 조회
  const handlePhoneBlur = async () => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length < 10) return;
    try {
      const res = await api(`${API_BASE}/${partnerCode}/check`, {
        method: 'POST', body: JSON.stringify({ phone: cleaned }),
      });
      if (res.success && !res.isNew && res.data) {
        setIsNew(false);
        setName(res.data.customer_name || '');
        setEmail(res.data.email || '');
        setAddress(res.data.address || '');
        setPrivacyConsent(res.data.privacy_consent || false);
        setSmsConsent(res.data.sms_consent || false);
        setEmailConsent(res.data.email_consent || false);
        setExistingMsg(`${res.data.customer_name}님의 기존 정보를 불러왔습니다.`);
      } else {
        setIsNew(true);
        setExistingMsg('');
      }
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (!cleaned || cleaned.length < 10) { setError('올바른 전화번호를 입력해주세요.'); return; }
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (!privacyConsent) { setError('개인정보 수집·이용 동의는 필수입니다.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api(`${API_BASE}/${partnerCode}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          phone: cleaned,
          customer_name: name.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          privacy_consent: privacyConsent,
          sms_consent: smsConsent,
          email_consent: emailConsent,
        }),
      });
      if (!res.success) { setError(res.message); setLoading(false); return; }
      setDone(true);
    } catch { setError('서버에 연결할 수 없습니다.'); }
    finally { setLoading(false); }
  };

  if (!partnerCode) {
    return <div style={S.page}><div style={S.card}><p>잘못된 접근입니다.</p></div></div>;
  }
  if (storeError) {
    return <div style={S.page}><div style={S.card}><div style={S.err}>{storeError}</div></div></div>;
  }
  if (done) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.ok}>
            <div style={S.okIcon}>&#10003;</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>
              {isNew ? '등록이 완료되었습니다' : '변경이 완료되었습니다'}
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
              {smsConsent && emailConsent ? 'SMS 및 이메일 수신에 동의하셨습니다.'
                : smsConsent ? 'SMS 수신에 동의하셨습니다.'
                : emailConsent ? '이메일 수신에 동의하셨습니다.'
                : '마케팅 수신에 동의하지 않으셨습니다.'}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              수신동의는 언제든 이 페이지에서 변경하실 수 있습니다.
            </div>
          </div>
        </div>
        <div style={S.footer}>{storeName} | 개인정보 처리를 위한 페이지입니다</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>{storeName || '고객 수신동의'}</div>
        <div style={S.sub}>마케팅 정보 수신동의를 등록합니다</div>

        {error && <div style={S.err}>{error}</div>}
        {existingMsg && <div style={S.info}>{existingMsg}</div>}

        {/* ── 고객 정보 ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={S.sectionTitle}>고객 정보</div>

          <div style={S.field}>
            <label style={S.label}>이름<span style={{ color: '#ff4d4f' }}> *</span></label>
            <input type="text" style={S.input} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div style={S.field}>
            <label style={S.label}>전화번호<span style={{ color: '#ff4d4f' }}> *</span></label>
            <input
              type="tel" style={S.input} placeholder="01012345678"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneBlur}
            />
          </div>

          <div style={S.field}>
            <label style={S.label}>이메일<span style={S.labelOpt}>(선택)</span></label>
            <input type="email" style={S.input} placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div style={S.field}>
            <label style={S.label}>주소<span style={S.labelOpt}>(선택)</span></label>
            <input type="text" style={S.input} placeholder="주소를 입력해주세요" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        {/* ── 수신동의 ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={S.sectionTitle}>수신동의</div>

          {/* 모두 동의 */}
          <div style={{ ...S.checkbox, background: '#f8f9fa', margin: '0 -4px 16px', padding: '12px 14px', borderRadius: 8, border: '1px solid #e8e8e8' }}>
            <input
              type="checkbox"
              checked={privacyConsent && smsConsent && emailConsent}
              onChange={(e) => { setPrivacyConsent(e.target.checked); setSmsConsent(e.target.checked); setEmailConsent(e.target.checked); }}
              style={S.chkInput}
            />
            <div style={{ fontWeight: 700, fontSize: 15 }}>모두 동의</div>
          </div>

          <div style={S.checkbox}>
            <input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} style={S.chkInput} />
            <div>
              <span style={{ ...S.tag, color: '#ff4d4f' }}>[필수]</span>
              개인정보 수집·이용 동의{' '}
              <span style={{ color: '#1677ff', cursor: 'pointer', fontSize: 12 }} onClick={() => setShowPrivacy(!showPrivacy)}>
                {showPrivacy ? '접기' : '상세보기'}
              </span>
            </div>
          </div>
          {showPrivacy && (
            <div style={S.privacy}>
              <strong>[개인정보 수집·이용 동의]</strong><br /><br />
              <strong>1. 수집 항목:</strong> 이름, 전화번호, 이메일(선택), 주소(선택)<br />
              <strong>2. 수집·이용 목적:</strong> 고객 관리, 마케팅 메시지 발송, 프로모션 안내<br />
              <strong>3. 보유 기간:</strong> 동의 철회 시 또는 목적 달성 후 지체 없이 파기<br />
              <strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으며, 거부 시 마케팅 안내를 받으실 수 없습니다.<br />
              <strong>5. 운영 주체:</strong> {storeName}<br /><br />
              동의를 철회하시려면 언제든 동일 페이지에서 변경하실 수 있습니다.
            </div>
          )}

          <div style={S.checkbox}>
            <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} style={S.chkInput} />
            <div><span style={{ ...S.tag, color: '#1677ff' }}>[선택]</span>SMS 마케팅 수신 동의</div>
          </div>

          <div style={S.checkbox}>
            <input type="checkbox" checked={emailConsent} onChange={(e) => setEmailConsent(e.target.checked)} style={S.chkInput} />
            <div><span style={{ ...S.tag, color: '#1677ff' }}>[선택]</span>이메일 마케팅 수신 동의</div>
          </div>
        </div>

        {/* ── 제출 ── */}
        <button
          style={{ ...S.btn, ...(loading ? S.btnOff : {}) }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '처리 중...' : (isNew ? '동의하고 등록' : '변경사항 저장')}
        </button>
      </div>

      <div style={S.footer}>{storeName && `${storeName} | `}개인정보 처리를 위한 페이지입니다</div>
    </div>
  );
}
