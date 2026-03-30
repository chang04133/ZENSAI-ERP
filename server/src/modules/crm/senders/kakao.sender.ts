import { MessageSender, SendResult } from './sender.interface';

/**
 * 카카오 알림톡 발송 (CoolSMS API 사용)
 * CoolSMS는 알림톡도 지원하며, 실패 시 SMS 폴백
 */
export class KakaoSender implements MessageSender {
  private apiKey: string;
  private apiSecret: string;
  private senderKey: string;

  constructor(apiKey: string, apiSecret: string, senderKey: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.senderKey = senderKey;
  }

  async send(to: string, content: string, subject?: string): Promise<SendResult> {
    try {
      // CoolSMS SDK를 통한 알림톡 발송
      const CoolSMS = (await import('coolsms-node-sdk')).default;
      const client = new CoolSMS(this.apiKey, this.apiSecret);

      // 알림톡 시도
      try {
        await (client as any).sendOne({
          to: to.replace(/-/g, ''),
          from: this.senderKey,
          kakaoOptions: {
            pfId: this.senderKey,
            templateId: subject || undefined,
          },
          text: content,
          type: 'ATA', // 알림톡
        });
        return { success: true };
      } catch {
        // 알림톡 실패 시 SMS 폴백
        await (client as any).sendOne({
          to: to.replace(/-/g, ''),
          from: this.senderKey,
          text: content,
          autoTypeDetect: true,
        });
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message || '알림톡/SMS 발송 실패' };
    }
  }
}
