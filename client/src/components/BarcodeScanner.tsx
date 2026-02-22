import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button, Select, Space, message } from 'antd';
import { CameraOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  active?: boolean;
  height?: number;
}

export default function BarcodeScanner({ onScan, active = true, height = 260 }: BarcodeScannerProps) {
  const containerId = 'barcode-scanner-container';
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [running, setRunning] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);

  // 카메라 목록 로드
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        const cams = devices.map((d) => ({ id: d.id, label: d.label || `카메라 ${d.id.slice(0, 8)}` }));
        setCameras(cams);
        // 후면 카메라 우선 선택
        const back = cams.find((c) => /back|rear|환경/i.test(c.label));
        setSelectedCamera(back?.id || cams[0]?.id || '');
      })
      .catch(() => {
        message.error('카메라 접근 권한이 필요합니다.');
      });
  }, []);

  const startScanner = async () => {
    if (!selectedCamera) {
      message.warning('카메라를 선택해주세요.');
      return;
    }
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        selectedCamera,
        { fps: 10, qrbox: { width: 280, height: 120 } },
        (decodedText) => {
          const now = Date.now();
          // 같은 코드 1.5초 내 중복 방지
          if (decodedText === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
          lastCodeRef.current = decodedText;
          lastTimeRef.current = now;
          onScan(decodedText);
        },
        () => {},
      );
      setRunning(true);
    } catch (e: any) {
      message.error('카메라 시작 실패: ' + (e.message || e));
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current?.clear();
    } catch { /* ignore */ }
    scannerRef.current = null;
    setRunning(false);
  };

  // active가 false가 되면 정지
  useEffect(() => {
    if (!active && running) stopScanner();
  }, [active]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  if (!active) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <Space style={{ marginBottom: 8 }} wrap>
        {cameras.length > 1 && (
          <Select
            value={selectedCamera}
            onChange={(v) => { setSelectedCamera(v); if (running) stopScanner(); }}
            style={{ width: 200 }}
            size="small"
            options={cameras.map((c) => ({ label: c.label, value: c.id }))}
            disabled={running}
          />
        )}
        {!running ? (
          <Button type="primary" icon={<CameraOutlined />} onClick={startScanner} disabled={!selectedCamera}>
            카메라 시작
          </Button>
        ) : (
          <Button danger icon={<StopOutlined />} onClick={stopScanner}>
            카메라 정지
          </Button>
        )}
        {cameras.length === 0 && (
          <span style={{ color: '#999', fontSize: 12 }}>카메라를 찾을 수 없습니다</span>
        )}
      </Space>

      <div
        id={containerId}
        style={{
          width: '100%',
          height: running ? height : 0,
          overflow: 'hidden',
          borderRadius: 8,
          background: running ? '#000' : 'transparent',
          transition: 'height 0.3s',
        }}
      />
    </div>
  );
}
