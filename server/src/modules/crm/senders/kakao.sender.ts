import { MessageSender, SendResult } from './sender.interface';

/**
 * 알리고(Aligo) 카카오 알림톡 발송
 * API 문서: https://smartsms.aligo.in/admin/api/kakao.html
 */
export class KakaoSender implements MessageSender {
  private apiKey: string;
  private userId: string;
  private senderKey: string;

  constructor(apiKey: string, userId: string, senderKey: string) {
    this.apiKey = apiKey;
    this.userId = userId;
    this.senderKey = senderKey;
  }

  async send(to: string, content: string, subject?: string): Promise<SendResult> {
    try {
      const params = new URLSearchParams();
      params.append('apikey', this.apiKey);
      params.append('userid', this.userId);
      params.append('senderkey', this.senderKey);
      params.append('tpl_code', 'ZENSAI_DEFAULT');
      params.append('sender', to.replace(/-/g, ''));
      params.append('receiver_1', to.replace(/-/g, ''));
      params.append('subject_1', subject || '안내');
      params.append('message_1', content);

      const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
        method: 'POST',
        body: params,
      });

      const data: any = await res.json();

      if (data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: data.message || `카카오 발송 오류 (code: ${data.code})` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '카카오 알림톡 발송 실패' };
    }
  }
}
