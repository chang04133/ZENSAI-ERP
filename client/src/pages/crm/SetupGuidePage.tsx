import { useEffect, useState } from 'react';
import {
  Card, Steps, Alert, Typography, Collapse, Form, Input, Switch, Button,
  Select, Space, Tag, Descriptions, message, Divider,
} from 'antd';
import {
  MessageOutlined, MailOutlined, RocketOutlined, SaveOutlined,
  CheckCircleOutlined, UserOutlined, SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { senderSettingsApi } from '../../modules/crm/crm.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const { Text, Paragraph } = Typography;

export default function SetupGuidePage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isHQ = ([ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER] as string[]).includes(user?.role || '');

  const [smsForm] = Form.useForm();
  const [emailForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<string>(user?.partnerCode || '');
  const [partners, setPartners] = useState<any[]>([]);
  const [currentSettings, setCurrentSettings] = useState<any>(null);

  useEffect(() => {
    if (isHQ) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isHQ]);

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
            sms_api_secret: '',
            sms_from_number: data.sms_from_number || '',
            sms_enabled: data.sms_enabled || false,
          });
          emailForm.setFieldsValue({
            email_user: data.email_user || '',
            email_password: '',
            email_enabled: data.email_enabled || false,
          });
        } else {
          smsForm.resetFields();
          emailForm.resetFields();
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
        sms_from_number: values.sms_from_number || null,
        sms_enabled: values.sms_enabled || false,
      };
      if (values.sms_api_secret) payload.sms_api_secret = values.sms_api_secret;
      const res = await senderSettingsApi.save(payload);
      if (res.success) {
        message.success('SMS 설정이 저장되었습니다.');
        setCurrentSettings(res.data);
        smsForm.setFieldValue('sms_api_secret', '');
      } else {
        message.error(res.message || '저장 실패');
      }
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
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
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleTestSms = async () => {
    const pc = isStore ? user?.partnerCode : selectedPartner;
    if (!pc) { message.warning('매장을 선택해주세요.'); return; }
    if (!testPhone) { message.warning('수신 번호를 입력해주세요.'); return; }
    setTesting(true);
    try {
      const res = await senderSettingsApi.testSend({ partner_code: pc, type: 'sms', to: testPhone });
      if (res.success) {
        message.success(res.message);
      } else {
        message.error(res.error || '테스트 발송 실패');
      }
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
      if (res.success) {
        message.success(res.message);
      } else {
        message.error(res.error || '테스트 발송 실패');
      }
    } catch (e: any) { message.error(e.message); }
    finally { setTesting(false); }
  };

  const partnerCode = isStore ? user?.partnerCode : selectedPartner;

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={{ marginTop: 0 }}><RocketOutlined /> CRM 발송 설정 가이드</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        SMS(알리고)와 이메일(Gmail) 발송을 위한 가입 및 설정 방법입니다.
      </p>

      {/* 매장 선택 (본사 사용자) */}
      {isHQ && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <span>매장 선택:</span>
            <Select
              style={{ width: 240 }}
              placeholder="설정할 매장을 선택하세요"
              value={selectedPartner || undefined}
              onChange={setSelectedPartner}
              showSearch
              optionFilterProp="label"
              options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))}
            />
          </Space>
        </Card>
      )}

      {/* 현재 상태 */}
      {partnerCode && currentSettings && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions title="현재 발송 상태" size="small" column={2}>
            <Descriptions.Item label="SMS">
              {currentSettings.sms_enabled
                ? <Tag icon={<CheckCircleOutlined />} color="green">활성</Tag>
                : <Tag>비활성</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="이메일">
              {currentSettings.email_enabled
                ? <Tag icon={<CheckCircleOutlined />} color="green">활성</Tag>
                : <Tag>비활성</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="수정자">
              {currentSettings.updated_by
                ? <Tag icon={<UserOutlined />}>{currentSettings.updated_by}</Tag>
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="수정일시">
              {currentSettings.updated_at
                ? dayjs(currentSettings.updated_at).format('YYYY-MM-DD HH:mm')
                : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* ═══ SMS (알리고) ═══ */}
      <Card size="small" title={<><MessageOutlined /> SMS 발송 — 알리고(Aligo) 가입 가이드</>} style={{ marginBottom: 24 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: '1. 회원가입',
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
              title: '2. 요금 충전',
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
              title: '3. 발신번호 등록',
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
              title: '4. API 키 확인',
              description: (
                <div>
                  <Paragraph>
                    <Text strong>문자API &gt; API Key 인증키</Text> 메뉴에서 API 키를 확인합니다.
                  </Paragraph>
                  <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                    <li><Text code>API Key</Text> — 인증키</li>
                    <li><Text code>사용자 ID</Text> — 알리고 로그인 ID</li>
                  </ul>
                </div>
              ),
            },
          ]}
        />

        {/* SMS 입력 폼 */}
        <Divider style={{ margin: '16px 0' }}>5. 아래에 입력 후 저장</Divider>
        {!partnerCode ? (
          <Alert type="info" message="매장을 선택하면 설정을 입력할 수 있습니다." showIcon />
        ) : (
          <Form form={smsForm} layout="vertical" onFinish={handleSaveSms} style={{ maxWidth: 400 }}>
            <Form.Item name="sms_api_key" label="API Key">
              <Input placeholder="알리고 API 인증키" />
            </Form.Item>
            <Form.Item name="sms_api_secret" label="사용자 ID (User ID)">
              <Input placeholder={currentSettings?.sms_api_key ? '변경 시에만 입력' : '알리고 로그인 ID'} />
            </Form.Item>
            <Form.Item name="sms_from_number" label="발신번호">
              <Input placeholder="01012345678 (등록된 발신번호)" />
            </Form.Item>
            <Form.Item name="sms_enabled" label="SMS 활성화" valuePropName="checked">
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
              SMS 설정 저장
            </Button>
          </Form>
        )}

        {/* SMS 테스트 발송 */}
        {partnerCode && currentSettings?.sms_enabled && (
          <>
            <Divider style={{ margin: '16px 0' }}>6. 테스트 발송</Divider>
            <Space.Compact style={{ maxWidth: 400, width: '100%' }}>
              <Input
                placeholder="수신 번호 (예: 01012345678)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={testing}
                onClick={handleTestSms}
              >
                테스트 문자 보내기
              </Button>
            </Space.Compact>
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
              본인 휴대폰 번호를 입력하면 실제 문자가 발송됩니다. (1건 차감)
            </div>
          </>
        )}
      </Card>

      {/* ═══ 이메일 (Gmail) ═══ */}
      <Card size="small" title={<><MailOutlined /> 이메일 발송 — Gmail 앱 비밀번호 설정 가이드</>} style={{ marginBottom: 24 }}>
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
              title: '1. Google 계정 2단계 인증 활성화',
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
              title: '2. 앱 비밀번호 생성',
              description: (
                <div>
                  <Paragraph>
                    2단계 인증 활성화 후, 다시 <Text strong>보안</Text> 탭으로 이동합니다.
                  </Paragraph>
                  <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                    <li>검색창에 <Text strong>"앱 비밀번호"</Text> 검색 또는 2단계 인증 설정 내 <Text strong>앱 비밀번호</Text> 클릭</li>
                    <li>앱 이름 입력 (예: <Text code>ZENSAI ERP</Text>) → <Text strong>만들기</Text></li>
                  </ul>
                </div>
              ),
            },
            {
              title: '3. 비밀번호 복사',
              description: (
                <div>
                  <Paragraph>16자리 앱 비밀번호가 생성됩니다.</Paragraph>
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 8 }}
                    message="이 비밀번호는 한 번만 표시됩니다. 반드시 복사해 두세요!"
                  />
                  <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                    <li>형식: <Text code>abcd efgh ijkl mnop</Text> (공백 포함 16자리)</li>
                  </ul>
                </div>
              ),
            },
          ]}
        />

        {/* 이메일 입력 폼 */}
        <Divider style={{ margin: '16px 0' }}>4. 아래에 입력 후 저장</Divider>
        {!partnerCode ? (
          <Alert type="info" message="매장을 선택하면 설정을 입력할 수 있습니다." showIcon />
        ) : (
          <Form form={emailForm} layout="vertical" onFinish={handleSaveEmail} style={{ maxWidth: 400 }}>
            <Form.Item name="email_user" label="Gmail 주소">
              <Input placeholder="example@gmail.com" />
            </Form.Item>
            <Form.Item name="email_password" label="앱 비밀번호">
              <Input.Password placeholder={currentSettings?.email_user ? '변경 시에만 입력' : 'Gmail 앱 비밀번호 (16자리)'} />
            </Form.Item>
            <Form.Item name="email_enabled" label="이메일 활성화" valuePropName="checked">
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
              이메일 설정 저장
            </Button>
          </Form>
        )}

        {/* 이메일 테스트 발송 */}
        {partnerCode && currentSettings?.email_enabled && (
          <>
            <Divider style={{ margin: '16px 0' }}>5. 테스트 발송</Divider>
            <Space.Compact style={{ maxWidth: 400, width: '100%' }}>
              <Input
                placeholder="수신 이메일 (예: test@gmail.com)"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={testing}
                onClick={handleTestEmail}
              >
                테스트 이메일 보내기
              </Button>
            </Space.Compact>
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
              본인 이메일을 입력하면 실제 이메일이 발송됩니다.
            </div>
          </>
        )}

        <Collapse
          size="small"
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'cost',
              label: '이메일 발송 비용 안내',
              children: (
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Gmail SMTP는 <Text strong>무료</Text>입니다</li>
                  <li>일일 발송 한도: 약 500건 (일반 Gmail) / 2,000건 (Google Workspace)</li>
                  <li>한도 초과 시 발송이 일시 차단될 수 있습니다</li>
                </ul>
              ),
            },
            {
              key: 'trouble',
              label: '문제 해결',
              children: (
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li><Text strong>"인증 실패"</Text> — 앱 비밀번호가 정확한지 확인. 일반 로그인 비밀번호 아님</li>
                  <li><Text strong>"보안 수준이 낮은 앱"</Text> — 2단계 인증 활성화 확인</li>
                  <li><Text strong>"발송 한도 초과"</Text> — 24시간 후 자동 해제</li>
                </ul>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
