export type AuthMailPurpose = 'email_verification' | 'password_reset';

export interface SendAuthCodeInput {
  to: string;
  code: string;
  purpose: AuthMailPurpose;
  expiresInMinutes: number;
}

export interface MailService {
  sendAuthCode(input: SendAuthCodeInput): Promise<void>;
}
