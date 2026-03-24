import nodemailer from 'nodemailer';
import { MessageSender, SendResult } from './sender.interface';

export class GmailSender implements MessageSender {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(user: string, appPassword: string) {
    this.from = user;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
    });
  }

  async send(to: string, content: string, subject?: string): Promise<SendResult> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: subject || 'ZENSAI 안내',
        html: content,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Gmail 발송 실패' };
    }
  }
}
