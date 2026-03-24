import { MessageSender, SendResult } from './sender.interface';

export class MockSender implements MessageSender {
  async send(to: string, content: string, subject?: string): Promise<SendResult> {
    console.log(`[MockSender] → ${to} | subject: ${subject || '(none)'} | content: ${content.substring(0, 60)}...`);
    return { success: true };
  }
}
