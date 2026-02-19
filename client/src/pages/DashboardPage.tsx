import { Card, Col, Row, Typography } from 'antd';
import { ShopOutlined, TagsOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/auth.store';
import { ROLE_LABELS } from '../constants/roles';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <Typography.Title level={4}>
        안녕하세요, {user?.userName}님
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        권한: {user ? ROLE_LABELS[user.role] || user.role : ''}
      </Typography.Text>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Card.Meta
              avatar={<ShopOutlined style={{ fontSize: 32, color: '#1890ff' }} />}
              title="거래처 관리"
              description="매장 등록 및 조회"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Card.Meta
              avatar={<TagsOutlined style={{ fontSize: 32, color: '#52c41a' }} />}
              title="상품 관리"
              description="상품 및 변형 관리"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Card.Meta
              avatar={<UserOutlined style={{ fontSize: 32, color: '#faad14' }} />}
              title="사용자 관리"
              description="계정 및 권한 관리"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
