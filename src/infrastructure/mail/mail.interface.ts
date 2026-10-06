export type AuthMailPurpose = 'email_verification' | 'password_reset';

export interface SendAuthCodeInput {
  to: string;
  code: string;
  purpose: AuthMailPurpose;
  expiresInMinutes: number;
}

export interface SendSupportNotificationInput {
  to: string;
  subject: string;
  title: string;
  intro: string;
  actionLabel?: string;
  fields: Array<{
    label: string;
    value: string;
  }>;
}

export interface MailService {
  sendAuthCode(input: SendAuthCodeInput): Promise<void>;
  sendSupportNotification(input: SendSupportNotificationInput): Promise<void>;
}
