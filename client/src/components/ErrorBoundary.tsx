import { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Result
            status="error"
            title="오류가 발생했습니다"
            subTitle={this.state.error?.message || '예기치 않은 오류가 발생했습니다.'}
            extra={<Button type="primary" onClick={this.handleReset}>홈으로 돌아가기</Button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
