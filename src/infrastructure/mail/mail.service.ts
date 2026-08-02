import { BrevoClient } from '@getbrevo/brevo';

import { env } from '../../config/env.config.js';
import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../logger/logger.js';
import type {
  MailService,
  SendAuthCodeInput,
  SendSupportNotificationInput,
} from './mail.interface.js';

interface MailSender {
  email: string;
  name?: string;
}

interface AuthEmailContent {
  subject: string;
  textContent: string;
  htmlContent: string;
}

class BrevoMailService implements MailService {
  private client: BrevoClient | undefined;

  async sendAuthCode(input: SendAuthCodeInput): Promise<void> {
    if (env.NODE_ENV !== 'production' && !env.BREVO_API_KEY) {
      logger.info(
        { email: input.to, purpose: input.purpose, devCode: input.code },
        'Development auth code created',
      );
      return;
    }

    const content = buildAuthEmailContent(input);

    try {
      const result = await this.getClient().transactionalEmails.sendTransacEmail({
        sender: this.getSender(),
        to: [{ email: input.to }],
        subject: content.subject,
        textContent: content.textContent,
        htmlContent: content.htmlContent,
      });

      logger.info({ email: input.to, purpose: input.purpose, messageId: result.messageId }, 'Brevo auth email sent');
    } catch (error) {
      logger.error({ err: error, email: input.to, purpose: input.purpose }, 'Brevo email send failed');
      throw new AppError('Email could not be sent.', 502, {
        code: 'EMAIL_SEND_FAILED',
        details: error,
      });
    }
  }

  async sendSupportNotification(input: SendSupportNotificationInput): Promise<void> {
    if (!env.BREVO_API_KEY || !env.MAIL_FROM) {
      logger.warn(
        { email: input.to, subject: input.subject },
        'Support email skipped because mail provider is not configured',
      );
      return;
    }

    const content = buildSupportEmailContent(input);

    try {
      const result = await this.getClient().transactionalEmails.sendTransacEmail({
        sender: this.getSender(),
        to: [{ email: input.to }],
        subject: content.subject,
        textContent: content.textContent,
        htmlContent: content.htmlContent,
      });

      logger.info({ email: input.to, messageId: result.messageId }, 'Brevo support email sent');
    } catch (error) {
      logger.error({ err: error, email: input.to, subject: input.subject }, 'Brevo support email send failed');
      throw new AppError('Support email could not be sent.', 502, {
        code: 'SUPPORT_EMAIL_SEND_FAILED',
        details: error,
      });
    }
  }

  private getClient(): BrevoClient {
    if (!env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is required to send email.');
    }

    this.client ??= new BrevoClient({
      apiKey: env.BREVO_API_KEY,
      timeoutInSeconds: env.BREVO_TIMEOUT_SECONDS,
      maxRetries: env.BREVO_MAX_RETRIES,
    });

    return this.client;
  }

  private getSender(): MailSender {
    if (!env.MAIL_FROM) {
      throw new Error('MAIL_FROM is required to send email.');
    }

    return parseMailFromAddress(env.MAIL_FROM);
  }
}

function parseMailFromAddress(value: string): MailSender {
  const displayNameMatch = value.match(/^(.+)<([^<>]+)>$/);

  if (!displayNameMatch) {
    return { email: value.trim() };
  }

  const name = displayNameMatch[1]?.trim().replace(/^"|"$/g, '');
  const email = displayNameMatch[2]?.trim();

  if (!email) {
    return { email: value.trim() };
  }

  return {
    email,
    ...(name ? { name } : {}),
  };
}

function buildAuthEmailContent(input: SendAuthCodeInput): AuthEmailContent {
  const isVerification = input.purpose === 'email_verification';
  const subject = isVerification
    ? `${input.code} is your Jesusname7 verification code`
    : `${input.code} is your Jesusname7 password reset code`;
  const eyebrow = isVerification ? 'EMAIL VERIFICATION' : 'PASSWORD RECOVERY';
  const title = isVerification ? 'Confirm your email address' : 'Reset your password';
  const intro = isVerification
    ? 'Enter the one-time code below to verify your email and finish creating your account.'
    : 'Enter the one-time code below to securely continue with your password reset.';
  const footer = isVerification
    ? 'If you did not create a Jesusname7 account, no action is needed.'
    : 'If you did not request a password reset, no action is needed and your password remains unchanged.';
  const preheader = `${input.code} is your one-time code. It expires in ${input.expiresInMinutes} minutes.`;
  const textContent = `${title}\n\n${intro}\n\nYour one-time code: ${input.code}\n\nThis code expires in ${input.expiresInMinutes} minutes. Never share this code with anyone.\n\n${footer}\n\nJesusname7 Account Security`;

  return {
    subject,
    textContent,
    htmlContent: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <title>${escapeHtml(subject)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { padding: 20px 12px !important; }
        .email-panel { width: 100% !important; }
        .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
        .code-text { font-size: 32px !important; letter-spacing: 7px !important; }
      }
    </style>
  </head>
  <body style="width:100%;margin:0;padding:0;background-color:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeHtml(preheader)}&#847; &#847; &#847; &#847; &#847;
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;background-color:#050505;">
      <tr>
        <td class="email-shell" align="center" style="padding:40px 16px;">
          <table class="email-panel" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#0b0b0b;border:1px solid #252525;border-radius:8px;">
            <tr>
              <td class="content-pad" style="padding:26px 36px;border-bottom:1px solid #252525;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="44" valign="middle">
                      <table role="presentation" width="40" cellspacing="0" cellpadding="0" border="0" style="width:40px;height:40px;background-color:#a3e635;background-color:rgba(163, 230, 53, 1);border-radius:8px;">
                        <tr>
                          <td align="center" valign="middle" style="color:#050505;font-size:17px;line-height:40px;font-weight:800;">J7</td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle" style="padding-left:12px;color:#ffffff;font-size:18px;line-height:24px;font-weight:700;">
                      Jesusname7
                    </td>
                    <td align="right" valign="middle" style="color:#777777;font-size:12px;line-height:18px;">
                      Account Security
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="content-pad" style="padding:40px 36px 16px;">
                <p style="margin:0 0 12px;color:#a3e635;color:rgba(163, 230, 53, 1);font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:0 0 14px;color:#ffffff;font-size:28px;line-height:36px;font-weight:700;letter-spacing:0;">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin:0;color:#b7b7b7;font-size:16px;line-height:26px;">
                  ${escapeHtml(intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td class="content-pad" style="padding:20px 36px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#141414;border:1px solid #303030;border-radius:8px;">
                  <tr>
                    <td align="center" style="padding:28px 20px;">
                      <p style="margin:0 0 12px;color:#8e8e8e;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;">
                        YOUR ONE-TIME CODE
                      </p>
                      <div class="code-text" style="color:#a3e635;color:rgba(163, 230, 53, 1);font-family:'Courier New',Courier,monospace;font-size:38px;line-height:46px;font-weight:700;letter-spacing:10px;white-space:nowrap;">
                        ${escapeHtml(input.code)}
                      </div>
                      <p style="margin:14px 0 0;color:#b7b7b7;font-size:13px;line-height:20px;">
                        Expires in <strong style="color:#ffffff;">${input.expiresInMinutes} minutes</strong>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="content-pad" style="padding:16px 36px 40px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#10140b;border-left:3px solid #a3e635;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <p style="margin:0;color:#d2d2d2;font-size:13px;line-height:21px;">
                        <strong style="color:#ffffff;">Keep your account secure.</strong><br>
                        Jesusname7 staff will never ask you to share this code.
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;color:#8f8f8f;font-size:13px;line-height:21px;">
                  ${escapeHtml(footer)}
                </p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td align="center" style="padding:20px 24px 0;color:#666666;font-size:12px;line-height:19px;">
                This is an automated security message from Jesusname7.<br>
                Please do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function buildSupportEmailContent(input: SendSupportNotificationInput): AuthEmailContent {
  const fieldText = input.fields.map((field) => `${field.label}: ${field.value}`).join('\n');
  const textContent = `${input.title}\n\n${input.intro}\n\n${fieldText}\n\nJesusname7 Support`;

  const fieldRows = input.fields
    .map(
      (field) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #242424;color:#8f8f8f;font-size:13px;line-height:20px;width:150px;vertical-align:top;">
            ${escapeHtml(field.label)}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #242424;color:#ffffff;font-size:14px;line-height:22px;vertical-align:top;">
            ${escapeHtml(field.value).replaceAll('\n', '<br>')}
          </td>
        </tr>`,
    )
    .join('');

  return {
    subject: input.subject,
    textContent,
    htmlContent: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="width:100%;margin:0;padding:0;background-color:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#050505;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#0b0b0b;border:1px solid #252525;border-radius:8px;">
            <tr>
              <td style="padding:26px 36px;border-bottom:1px solid #252525;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="44">
                      <table role="presentation" width="40" cellspacing="0" cellpadding="0" border="0" style="width:40px;height:40px;background-color:#a3e635;border-radius:8px;">
                        <tr>
                          <td align="center" style="color:#050505;font-size:17px;line-height:40px;font-weight:800;">J7</td>
                        </tr>
                      </table>
                    </td>
                    <td style="padding-left:12px;color:#ffffff;font-size:18px;line-height:24px;font-weight:700;">Jesusname7</td>
                    <td align="right" style="color:#777777;font-size:12px;line-height:18px;">Support</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 18px;">
                <p style="margin:0 0 12px;color:#a3e635;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;">
                  ${escapeHtml(input.actionLabel ?? 'SUPPORT REQUEST')}
                </p>
                <h1 style="margin:0 0 14px;color:#ffffff;font-size:26px;line-height:34px;font-weight:700;">
                  ${escapeHtml(input.title)}
                </h1>
                <p style="margin:0;color:#b7b7b7;font-size:15px;line-height:25px;">
                  ${escapeHtml(input.intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 36px 40px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#141414;border:1px solid #303030;border-radius:8px;padding:10px 18px;">
                  ${fieldRows}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const mailService: MailService = new BrevoMailService();
