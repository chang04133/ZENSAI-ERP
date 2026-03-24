export interface SendResult {
  success: boolean;
  error?: string;
}

export interface MessageSender {
  send(to: string, content: string, subject?: string): Promise<SendResult>;
}
