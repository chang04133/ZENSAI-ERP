import { useEffect, useState } from 'react';
import {
  Card, Form, Input, Switch, Button, message, Modal, Space, Select, Alert, Descriptions, Tag,
  Collapse, Steps, Typography, Tabs,
} from 'antd';
import {
  MessageOutlined, MailOutlined, SaveOutlined, QuestionCircleOutlined,
  BookOutlined, QrcodeOutlined, CopyOutlined, PrinterOutlined,
  CheckCircleOutlined, UserOutlined, SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { senderSettingsApi, consentQrApi } from '../../modules/crm/crm.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const { Text, Paragraph, Title } = Typography;

/* ════════════════════════════════════════════
   가이드 컴포넌트
   ════════════════════════════════════════════ */

function SmsGuide() {
  return (
    <div style={{ padding: '8px 0' }}>
      <Title level={5} style={{ marginTop: 0 }}>알리고(Aligo) 가입 및 API 키 발급 가이드</Title>

      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={[
          {
            title: '회원가입',
            description: (
              <div>
                <Paragraph>
                  <Text strong>smartsms.aligo.in</Text> 에 접속하여 회원가입합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li>사업자 / 개인 모두 가입 가능</li>
                  <li>가입 시 무료 테스트 20건 제공</li>
                </ul>
              </div>
            ),
          },
          {
            title: '요금 충전',
            description: (
              <div>
                <Paragraph>
                  로그인 후 <Text strong>충전하기</Text> 메뉴에서 선불 충전합니다.
                </Paragraph>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 8 }}
                  message="SMS 요금 안내 (VAT 별도)"
                  description={
                    <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                      <li>SMS (단문, 90byte 이하): 약 9.9원/건</li>
                      <li>LMS (장문, 2,000byte 이하): 약 25원/건</li>
                      <li>MMS (이미지 포함): 약 100원/건</li>
                      <li>발송 실패 건은 자동 환급됩니다</li>
                    </ul>
                  }
                />
              </div>
            ),
          },
          {
            title: '발신번호 등록',
            description: (
              <div>
                <Paragraph>
                  <Text strong>문자보내기 &gt; 발신번호 관리</Text> 메뉴에서 발신번호를 등록합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li>본인 소유 휴대폰 번호 또는 사업장 전화번호 등록</li>
                  <li>통신사 본인인증 또는 서류 인증 필요</li>
                </ul>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 4 }}
                  message="발신번호가 등록되어야 SMS 발송이 가능합니다."
                />
              </div>
            ),
          },
          {
            title: 'API 키 발급',
            description: (
              <div>
                <Paragraph>
                  <Text strong>문자API &gt; API Key 인증키</Text> 메뉴에서 API 키를 확인합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li><Text code>API Key</Text> — 인증키 (아래 설정에 입력)</li>
                  <li><Text code>사용자 ID</Text> — 알리고 로그인 ID</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'ERP에 입력',
            description: (
              <div>
                <Paragraph>
                  아래 SMS 설정 폼에 발급받은 정보를 입력합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li><Text strong>API Key</Text> — 발급받은 인증키</li>
                  <li><Text strong>사용자 ID</Text> — 알리고 로그인 ID</li>
                  <li><Text strong>발신번호</Text> — 알리고에 등록한 발신번호 (하이픈 없이 입력)</li>
                  <li><Text strong>SMS 활성화</Text> — ON으로 변경 후 저장</li>
                </ul>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function EmailGuide() {
  return (
    <div style={{ padding: '8px 0' }}>
      <Title level={5} style={{ marginTop: 0 }}>Gmail 앱 비밀번호 발급 가이드</Title>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Gmail 앱 비밀번호는 2단계 인증이 활성화된 계정에서만 사용할 수 있습니다."
      />

      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={[
          {
            title: 'Google 계정 2단계 인증 활성화',
            description: (
              <div>
                <Paragraph>
                  <Text strong>myaccount.google.com</Text> 접속 후 로그인합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li><Text strong>보안</Text> 탭 클릭</li>
                  <li><Text strong>2단계 인증</Text> 항목을 찾아 활성화</li>
                  <li>이미 활성화되어 있다면 다음 단계로</li>
                </ul>
              </div>
            ),
          },
          {
            title: '앱 비밀번호 생성',
            description: (
              <div>
                <Paragraph>
                  2단계 인증 활성화 후, 다시 <Text strong>보안</Text> 탭으로 이동합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li>검색창에 <Text strong>"앱 비밀번호"</Text> 를 검색하거나, 2단계 인증 설정 내 <Text strong>앱 비밀번호</Text> 메뉴 클릭</li>
                  <li>앱 이름을 입력 (예: <Text code>ZENSAI ERP</Text>)</li>
                  <li><Text strong>만들기</Text> 클릭</li>
                </ul>
              </div>
            ),
          },
          {
            title: '비밀번호 복사',
            description: (
              <div>
                <Paragraph>
                  16자리 앱 비밀번호가 생성됩니다.
                </Paragraph>
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 8 }}
                  message="이 비밀번호는 한 번만 표시됩니다. 반드시 복사해 두세요!"
                />
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li>형식: <Text code>abcd efgh ijkl mnop</Text> (공백 포함 16자리)</li>
                  <li>입력 시 공백은 포함해도, 제거해도 동일하게 동작합니다</li>
                </ul>
              </div>
            ),
          },
          {
            title: 'ERP에 입력',
            description: (
              <div>
                <Paragraph>
                  아래 이메일 설정 폼에 정보를 입력합니다.
                </Paragraph>
                <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                  <li><Text strong>Gmail 주소</Text> — 본인 Gmail 주소 (예: store@gmail.com)</li>
                  <li><Text strong>앱 비밀번호</Text> — 위에서 복사한 16자리 비밀번호</li>
                  <li><Text strong>이메일 활성화</Text> — ON으로 변경 후 저장</li>
                </ul>
              </div>
            ),
          },
        ]}
      />

      <Collapse
        size="small"
        style={{ marginTop: 12 }}
        items={[{
          key: 'cost',
          label: '이메일 발송 비용 안내',
          children: (
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>Gmail SMTP는 <Text strong>무료</Text>입니다</li>
              <li>일일 발송 한도: 약 500건 (일반 Gmail) / 2,000건 (Google Workspace)</li>
              <li>한도 초과 시 발송이 일시 차단될 수 있습니다</li>
              <li>대량 발송이 필요한 경우 본사에 문의해주세요</li>
            </ul>
          ),
        }, {
          key: 'trouble',
          label: '문제 해결',
          children: (
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li><Text strong>"인증 실패"</Text> — 앱 비밀번호가 정확한지 확인. 일반 로그인 비밀번호가 아닌 앱 비밀번호를 입력해야 합니다</li>
              <li><Text strong>"보안 수준이 낮은 앱"</Text> — 2단계 인증이 활성화되어 있는지 확인</li>
              <li><Text strong>"발송 한도 초과"</Text> — 24시간 후 자동 해제됩니다</li>
            </ul>
          ),
        }]}
      />
    </div>
  );
}

/* ════════════════════════════════════════════
   메인 페이지
   ════════════════════════════════════════════ */

export default function SenderSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isHQ = ([ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER] as string[]).includes(user?.role || '');

  const [smsForm] = Form.useForm();
  const [emailForm] = Form.useForm();
  const [kakaoForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<string>(user?.partnerCode || '');
  const [partners, setPartners] = useState<any[]>([]);
  const [currentSettings, setCurrentSettings] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('settings');
  const [qrData, setQrData] = useState<{ qrDataUrl: string; consentUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testKakaoPhone, setTestKakaoPhone] = useState('');

  // HQ+: 매장 목록 로드
  useEffect(() => {
    if (isHQ) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isHQ]);

  // 매장 코드 결정되면 설정 로드
  useEffect(() => {
    const code = isStore ? user?.partnerCode : selectedPartner;
    if (!code) return;
    setLoading(true);
    senderSettingsApi.get(isStore ? undefined : code)
      .then((data: any) => {
        setCurrentSettings(data);
        if (data) {
          smsForm.setFieldsValue({
            sms_api_key: data.sms_api_key || '',
            sms_api_secret: data.sms_api_secret || '',
            sms_from_number: data.sms_from_number || '',
            sms_enabled: data.sms_enabled || false,
          });
          emailForm.setFieldsValue({
            email_user: data.email_user || '',
            email_password: '',
            email_enabled: data.email_enabled || false,
          });
          kakaoForm.setFieldsValue({
            kakao_sender_key: data.kakao_sender_key || '',
            kakao_enabled: data.kakao_enabled || false,
          });
        } else {
          smsForm.resetFields();
          emailForm.resetFields();
          kakaoForm.resetFields();
        }
      })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [selectedPartner, user?.partnerCode, isStore]); // eslint-disable-line

  const handleSaveSms = async (values: any) => {
    const partnerCode = isStore ? user?.partnerCode : selectedPartner;
    if (!partnerCode) { message.warning('매장을 선택해주세요.'); return; }
    setSaving(true);
    try {
      const payload: any = {
        partner_code: partnerCode,
        sms_api_key: values.sms_api_key || null,
        sms_api_secret: values.sms_api_secret || null,
        sms_from_number: values.sms_from_number || null,
        sms_enabled: values.sms_enabled || false,
      };
      const res = await senderSettingsApi.save(payload);
      if (res.success) {
        message.success('SMS 설정이 저장되었습니다.');
        setCurrentSettings(res.data);
        smsForm.setFieldValue('sms_api_secret', '');
      } else {
        message.error(res.message || '저장 실패');
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async (values: any) => {
    const partnerCode = isStore ? user?.partnerCode : selectedPartner;
    if (!partnerCode) { message.warning('매장을 선택해주세요.'); return; }
    setSaving(true);
    try {
      const payload: any = {
        partner_code: partnerCode,
        email_user: values.email_user || null,
        email_enabled: values.email_enabled || false,
      };
      if (values.email_password) payload.email_password = values.email_password;
      const res = await senderSettingsApi.save(payload);
      if (res.success) {
        message.success('이메일 설정이 저장되었습니다.');
        setCurrentSettings(res.data);
        emailForm.setFieldValue('email_password', '');
      } else {
        message.error(res.message || '저장 실패');
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKakao = async (values: any) => {
    const partnerCode = isStore ? user?.partnerCode : selectedPartner;
    if (!partnerCode) { message.warning('매장을 선택해주세요.'); return; }
    setSaving(true);
    try {
      const payload: any = {
        partner_code: partnerCode,
        kakao_sender_key: values.kakao_sender_key || null,
        kakao_enabled: values.kakao_enabled || false,
      };
      const res = await senderSettingsApi.save(payload);
      if (res.success) {
        message.success('카카오 설정이 저장되었습니다.');
        setCurrentSettings(res.data);
      } else {
        message.error(res.message || '저장 실패');
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestKakao = async () => {
    const pc = isStore ? user?.partnerCode : selectedPartner;
    if (!pc) { message.warning('매장을 선택해주세요.'); return; }
    if (!testKakaoPhone) { message.warning('수신 번호를 입력해주세요.'); return; }
    setTesting(true);
    try {
      const res = await senderSettingsApi.testSend({ partner_code: pc, type: 'kakao' as any, to: testKakaoPhone });
      if (res.success) message.success(res.message);
      else message.error(res.error || '테스트 발송 실패');
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  const loadQr = async () => {
    const code = isStore ? user?.partnerCode : selectedPartner;
    if (!code) { message.warning('매장을 선택해주세요.'); return; }
    setQrLoading(true);
    try {
      const data = await consentQrApi.get(isStore ? undefined : code);
      setQrData(data);
    } catch (e: any) { message.error(e.message); }
    finally { setQrLoading(false); }
  };

  const handleCopyUrl = () => {
    if (!qrData) return;
    navigator.clipboard.writeText(qrData.consentUrl)
      .then(() => message.success('URL이 복사되었습니다.'))
      .catch(() => message.error('복사에 실패했습니다.'));
  };

  const handlePrintQr = () => {
    if (!qrData) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const partnerCode = isStore ? user?.partnerCode : selectedPartner;
    const partnerName = isStore
      ? (partners.find(p => p.partner_code === user?.partnerCode)?.partner_name || partnerCode)
      : (partners.find(p => p.partner_code === selectedPartner)?.partner_name || selectedPartner);
    win.document.write(`
      <html><head><title>수신동의 QR코드</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;}
      img{width:300px;height:300px;} h2{margin-bottom:8px;} p{color:#666;font-size:14px;}</style></head>
      <body><h2>${partnerName}</h2><p>스마트폰으로 QR코드를 스캔하여<br/>마케팅 수신동의를 등록해주세요.</p>
      <img src="${qrData.qrDataUrl}" /><p style="font-size:11px;margin-top:16px;">${qrData.consentUrl}</p>
      <script>window.onload=()=>{window.print();}</script></body></html>`);
    win.document.close();
  };

  const handleTestSms = async () => {
    const pc = isStore ? user?.partnerCode : selectedPartner;
    if (!pc) { message.warning('매장을 선택해주세요.'); return; }
    if (!testPhone) { message.warning('수신 번호를 입력해주세요.'); return; }
    setTesting(true);
    try {
      const res = await senderSettingsApi.testSend({ partner_code: pc, type: 'sms', to: testPhone });
      if (res.success) message.success(res.message);
      else message.error(res.error || '테스트 발송 실패');
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  const handleTestEmail = async () => {
    const pc = isStore ? user?.partnerCode : selectedPartner;
    if (!pc) { message.warning('매장을 선택해주세요.'); return; }
    if (!testEmail) { message.warning('수신 이메일을 입력해주세요.'); return; }
    setTesting(true);
    try {
      const res = await senderSettingsApi.testSend({ partner_code: pc, type: 'email', to: testEmail });
      if (res.success) message.success(res.message);
      else message.error(res.error || '테스트 발송 실패');
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      {isHQ && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <span>매장 선택:</span>
            <Select
              style={{ width: 240 }}
              placeholder="매장을 선택하세요"
              value={selectedPartner || undefined}
              onChange={(v) => { setSelectedPartner(v); setQrData(null); }}
              showSearch
              optionFilterProp="label"
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
            />
          </Space>
        </Card>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'settings', label: <><SaveOutlined /> 발송 설정</>, children: null },
          { key: 'qr', label: <><QrcodeOutlined /> 수신동의 QR</>, children: null },
          { key: 'guide', label: <><BookOutlined /> 설정 가이드</>, children: null },
        ]}
      />

      {activeTab === 'qr' ? (
        /* ────── 수신동의 QR 탭 ────── */
        <>
          {(!isStore && !selectedPartner) ? (
            <Alert type="info" message="매장을 선택하면 QR코드를 확인할 수 있습니다." showIcon />
          ) : (
            <Card
              size="small"
              title={<><QrcodeOutlined /> 수신동의 QR코드</>}
            >
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="고객이 QR코드를 스캔하면 수신동의 페이지로 이동합니다."
                description="매장에 QR코드를 비치하여 고객이 직접 동의할 수 있도록 안내해주세요. 정보통신망법에 따라 고객 본인의 동의가 필요합니다."
              />
              {qrData ? (
                <div style={{ textAlign: 'center' }}>
                  <img src={qrData.qrDataUrl} alt="수신동의 QR코드" style={{ width: 250, height: 250 }} />
                  <div style={{ marginTop: 12 }}>
                    <Paragraph copyable={{ text: qrData.consentUrl }} style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{qrData.consentUrl}</Text>
                    </Paragraph>
                  </div>
                  <Space style={{ marginTop: 8 }}>
                    <Button icon={<CopyOutlined />} onClick={handleCopyUrl}>URL 복사</Button>
                    <Button icon={<PrinterOutlined />} onClick={handlePrintQr}>인쇄</Button>
                  </Space>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <Button type="primary" icon={<QrcodeOutlined />} onClick={loadQr} loading={qrLoading} size="large">
                    QR코드 생성
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      ) : activeTab === 'guide' ? (
        /* ────── 가이드 탭 ────── */
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Card size="small" title={<><MessageOutlined /> SMS (알리고) 가입 가이드</>}>
            <SmsGuide />
          </Card>
          <Card size="small" title={<><MailOutlined /> 이메일 (Gmail) 설정 가이드</>}>
            <EmailGuide />
          </Card>
          <Card size="small" title={<><MessageOutlined /> 카카오 알림톡 설정 가이드</>}>
            <div style={{ padding: '8px 0' }}>
              <Title level={5} style={{ marginTop: 0 }}>알리고 카카오 알림톡 설정 가이드</Title>
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: '알리고 SMS 설정 완료',
                    description: <Paragraph>먼저 위의 SMS(알리고) 가이드를 따라 API Key와 사용자 ID를 설정합니다. 카카오 알림톡은 알리고 계정을 통해 발송됩니다.</Paragraph>,
                  },
                  {
                    title: '카카오 비즈니스 채널 등록',
                    description: (
                      <div>
                        <Paragraph><Text strong>알리고 관리자 페이지</Text>에서 카카오 알림톡 메뉴로 이동합니다.</Paragraph>
                        <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                          <li>카카오톡 채널(비즈니스 채널)을 등록합니다</li>
                          <li>카카오 비즈니스 계정이 필요합니다</li>
                        </ul>
                      </div>
                    ),
                  },
                  {
                    title: '발신프로필 키 확인',
                    description: (
                      <div>
                        <Paragraph>채널 등록 후 <Text strong>발신프로필 키(Sender Key)</Text>를 확인합니다.</Paragraph>
                        <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                          <li>알리고 &gt; 카카오 알림톡 &gt; 발신프로필 관리에서 확인</li>
                          <li>영문+숫자 조합의 키 값</li>
                        </ul>
                      </div>
                    ),
                  },
                  {
                    title: 'ERP에 입력',
                    description: (
                      <div>
                        <Paragraph>카카오 알림톡 설정 폼에 발신프로필 키를 입력하고 활성화합니다.</Paragraph>
                        <Alert type="info" showIcon style={{ marginTop: 4 }}
                          message="알림톡 발송 비용은 건당 약 7~8원입니다 (알리고 요금 기준)." />
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </Space>
      ) : (
        /* ────── 설정 탭 ────── */
        <>
          {(!isStore && !selectedPartner) ? (
            <Alert type="info" message="매장을 선택하면 발송 설정을 확인/수정할 수 있습니다." showIcon />
          ) : (
            <>
              {/* 현재 상태 요약 */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Descriptions title="현재 발송 상태" size="small" column={3}>
                  <Descriptions.Item label="SMS">
                    {currentSettings?.sms_enabled
                      ? <Tag icon={<CheckCircleOutlined />} color="green">활성</Tag>
                      : <Tag>비활성</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="이메일">
                    {currentSettings?.email_enabled
                      ? <Tag icon={<CheckCircleOutlined />} color="green">활성</Tag>
                      : <Tag>비활성</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="카카오">
                    {currentSettings?.kakao_enabled
                      ? <Tag icon={<CheckCircleOutlined />} color="green">활성</Tag>
                      : <Tag>비활성</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="수정자">
                    {currentSettings?.updated_by
                      ? <Tag icon={<UserOutlined />}>{currentSettings.updated_by}</Tag>
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="수정일시">
                    {currentSettings?.updated_at
                      ? dayjs(currentSettings.updated_at).format('YYYY-MM-DD HH:mm')
                      : '-'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {!currentSettings && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="발송 설정이 아직 등록되지 않았습니다."
                  description={
                    <span>
                      처음이시라면 상단의 <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setActiveTab('guide')}>
                        설정 가이드
                      </Button>를 먼저 확인해주세요.
                    </span>
                  }
                />
              )}

              {/* SMS 설정 */}
              <Card
                size="small"
                title={<><MessageOutlined /> SMS 설정 (알리고)</>}
                style={{ marginBottom: 16 }}
                loading={loading}
                extra={
                  <Button type="link" size="small" icon={<QuestionCircleOutlined />} onClick={() => setActiveTab('guide')}>
                    가이드 보기
                  </Button>
                }
              >
                <Form form={smsForm} layout="vertical" onFinish={handleSaveSms}>
                  <Form.Item name="sms_api_key" label="API Key">
                    <Input placeholder="알리고 API 인증키" />
                  </Form.Item>
                  <Form.Item name="sms_api_secret" label="사용자 ID (User ID)">
                    <Input placeholder="알리고 로그인 ID" />
                  </Form.Item>
                  <Form.Item name="sms_from_number" label="발신번호">
                    <Input placeholder="01012345678 (등록된 발신번호)" />
                  </Form.Item>
                  <Form.Item name="sms_enabled" label="SMS 활성화" valuePropName="checked">
                    <Switch checkedChildren="ON" unCheckedChildren="OFF" onChange={(checked) => {
                      if (!checked && currentSettings?.sms_enabled) {
                        Modal.confirm({
                          title: 'SMS 비활성화',
                          content: 'SMS를 비활성화하면 마케팅 문자 및 택배 알림 발송이 중단됩니다. 계속하시겠습니까?',
                          okText: '비활성화',
                          okType: 'danger',
                          cancelText: '취소',
                          onCancel: () => smsForm.setFieldValue('sms_enabled', true),
                        });
                      }
                    }} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                    SMS 설정 저장
                  </Button>
                </Form>
                {currentSettings?.sms_enabled && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #e8e8e8' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>테스트 발송</Text>
                    <Space.Compact style={{ maxWidth: 400, width: '100%' }}>
                      <Input
                        placeholder="수신 번호 (예: 01012345678)"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={testing} onClick={handleTestSms}>
                        테스트 문자
                      </Button>
                    </Space.Compact>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      본인 번호를 입력하면 실제 문자가 발송됩니다. (1건 차감)
                    </div>
                  </div>
                )}
              </Card>

              {/* 이메일 설정 */}
              <Card
                size="small"
                title={<><MailOutlined /> 이메일 설정 (Gmail SMTP)</>}
                loading={loading}
                style={{ marginBottom: 16 }}
                extra={
                  <Button type="link" size="small" icon={<QuestionCircleOutlined />} onClick={() => setActiveTab('guide')}>
                    가이드 보기
                  </Button>
                }
              >
                <Form form={emailForm} layout="vertical" onFinish={handleSaveEmail}>
                  <Form.Item name="email_user" label="Gmail 주소">
                    <Input placeholder="example@gmail.com" />
                  </Form.Item>
                  <Form.Item name="email_password" label="앱 비밀번호">
                    <Input.Password
                      placeholder={currentSettings?.email_user ? '변경 시에만 입력' : 'Gmail 앱 비밀번호 (16자리)'}
                    />
                  </Form.Item>
                  <Form.Item name="email_enabled" label="이메일 활성화" valuePropName="checked">
                    <Switch checkedChildren="ON" unCheckedChildren="OFF" onChange={(checked) => {
                      if (!checked && currentSettings?.email_enabled) {
                        Modal.confirm({
                          title: '이메일 비활성화',
                          content: '이메일을 비활성화하면 마케팅 이메일 발송이 중단됩니다. 계속하시겠습니까?',
                          okText: '비활성화',
                          okType: 'danger',
                          cancelText: '취소',
                          onCancel: () => emailForm.setFieldValue('email_enabled', true),
                        });
                      }
                    }} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                    이메일 설정 저장
                  </Button>
                </Form>
                {currentSettings?.email_enabled && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #e8e8e8' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>테스트 발송</Text>
                    <Space.Compact style={{ maxWidth: 400, width: '100%' }}>
                      <Input
                        placeholder="수신 이메일 (예: test@gmail.com)"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={testing} onClick={handleTestEmail}>
                        테스트 이메일
                      </Button>
                    </Space.Compact>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      본인 이메일을 입력하면 실제 이메일이 발송됩니다.
                    </div>
                  </div>
                )}
              </Card>

              {/* 카카오 알림톡 설정 */}
              <Card
                size="small"
                title={<><MessageOutlined /> 카카오 알림톡 설정</>}
                loading={loading}
                style={{ marginBottom: 16 }}
                extra={
                  <Button type="link" size="small" icon={<QuestionCircleOutlined />} onClick={() => setActiveTab('guide')}>
                    가이드 보기
                  </Button>
                }
              >
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="카카오 알림톡은 알리고 SMS 계정으로 발송합니다."
                  description="알리고에서 카카오 비즈니스 채널을 등록하고 발신프로필 키를 발급받아야 합니다. SMS API 키가 먼저 설정되어 있어야 합니다."
                />
                <Form form={kakaoForm} layout="vertical" onFinish={handleSaveKakao}>
                  <Form.Item name="kakao_sender_key" label="발신프로필 키 (Sender Key)">
                    <Input placeholder="알리고에서 발급받은 카카오 발신프로필 키" />
                  </Form.Item>
                  <Form.Item name="kakao_enabled" label="카카오 알림톡 활성화" valuePropName="checked">
                    <Switch checkedChildren="ON" unCheckedChildren="OFF" onChange={(checked) => {
                      if (checked && !currentSettings?.sms_api_key) {
                        message.warning('SMS API 키가 먼저 설정되어야 합니다.');
                        kakaoForm.setFieldValue('kakao_enabled', false);
                      }
                      if (!checked && currentSettings?.kakao_enabled) {
                        Modal.confirm({
                          title: '카카오 알림톡 비활성화',
                          content: '카카오 알림톡을 비활성화하면 알림톡 발송이 중단됩니다. 계속하시겠습니까?',
                          okText: '비활성화',
                          okType: 'danger',
                          cancelText: '취소',
                          onCancel: () => kakaoForm.setFieldValue('kakao_enabled', true),
                        });
                      }
                    }} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                    카카오 설정 저장
                  </Button>
                </Form>
                {currentSettings?.kakao_enabled && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #e8e8e8' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>테스트 발송</Text>
                    <Space.Compact style={{ maxWidth: 400, width: '100%' }}>
                      <Input
                        placeholder="수신 번호 (예: 01012345678)"
                        value={testKakaoPhone}
                        onChange={(e) => setTestKakaoPhone(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Button type="primary" icon={<SendOutlined />} loading={testing} onClick={handleTestKakao}>
                        테스트 알림톡
                      </Button>
                    </Space.Compact>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      카카오톡에 등록된 번호를 입력하면 실제 알림톡이 발송됩니다.
                    </div>
                  </div>
                )}
              </Card>

            </>
          )}
        </>
      )}
    </div>
  );
}
