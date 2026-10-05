export const MESSENGER_CLIENT = Symbol('MESSENGER_CLIENT');

export interface SendTextMessageInput {
  metaPageId: string;
  recipientPsid: string;
  text: string;
}

export interface SendTextMessageResult {
  recipientId: string;
  messageId: string;
}

export interface MessengerClient {
  sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult>;
}
