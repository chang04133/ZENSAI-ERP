import CoolSMS from 'coolsms-node-sdk';
import { MessageSender, SendResult } from './sender.interface';

export class CoolSmsSender implements MessageSender {
  private client: InstanceType<typeof CoolSMS>;
  private from: string;

  constructor(apiKey: string, apiSecret: string, fromNumber: string) {
    this.client = new CoolSMS(apiKey, apiSecret);
    this.from = fromNumber;
  }

  async send(to: string, content: string): Promise<SendResult> {
    try {
      await this.client.sendOne({
        to: to.replace(/-/g, ''),
        from: this.from,
        text: content,
        autoTypeDetect: true,
      } as any);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'CoolSMS 발송 실패' };
    }
  }
}
