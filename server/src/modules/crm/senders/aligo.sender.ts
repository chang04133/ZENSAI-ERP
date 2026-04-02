import { MessageSender, SendResult } from './sender.interface';

/**
 * 알리고(Aligo) SMS 발송
 * API 문서: https://smartsms.aligo.in/admin/api/spec.html
 */
export class AligoSender implements MessageSender {
  private apiKey: string;
  private userId: string;
  private from: string;

  constructor(apiKey: string, userId: string, fromNumber: string) {
    this.apiKey = apiKey;
    this.userId = userId;
    this.from = fromNumber.replace(/-/g, '');
  }

  async send(to: string, content: string): Promise<SendResult> {
    try {
      const params = new URLSearchParams();
      params.append('key', this.apiKey);
      params.append('user_id', this.userId);
      params.append('sender', this.from);
      params.append('receiver', to.replace(/-/g, ''));
      params.append('msg', content);
      // msg_type 미지정 → 90byte 초과 시 자동 LMS 전환

      const res = await fetch('https://apis.aligo.in/send/', {
        method: 'POST',
        body: params,
      });

      const data: any = await res.json();

      if (data.result_code === 1) {
        return { success: true };
      } else {
        return { success: false, error: data.message || `알리고 오류 (code: ${data.result_code})` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '알리고 발송 실패' };
    }
  }
}
