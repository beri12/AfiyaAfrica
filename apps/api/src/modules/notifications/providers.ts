import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/config.module';

export interface DeliveryResult {
  ok: boolean;
  /** Set when the channel is not configured — the notification is marked SKIPPED, never faked as SENT. */
  skipped?: boolean;
  error?: string;
}

export abstract class EmailProvider {
  abstract readonly configured: boolean;
  abstract send(to: string, subject: string, text: string): Promise<DeliveryResult>;
}

export abstract class SmsProvider {
  abstract readonly configured: boolean;
  abstract send(to: string, message: string): Promise<DeliveryResult>;
}

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transport?: Transporter;
  readonly configured: boolean;

  constructor(private readonly config: AppConfig) {
    super();
    const host = config.get('SMTP_HOST');
    this.configured = !!host;
    if (host) {
      this.transport = createTransport({
        host,
        port: config.get('SMTP_PORT'),
        secure: config.get('SMTP_PORT') === 465,
        auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASSWORD') } : undefined,
      });
    }
  }

  async send(to: string, subject: string, text: string): Promise<DeliveryResult> {
    if (!this.transport) return { ok: false, skipped: true, error: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
    try {
      await this.transport.sendMail({ from: this.config.get('SMTP_FROM'), to, subject, text });
      return { ok: true };
    } catch (e) {
      this.logger.warn(`Email delivery failed: ${(e as Error).message}`);
      return { ok: false, error: 'EMAIL_DELIVERY_FAILED' };
    }
  }
}

/**
 * Africa's Talking SMS adapter (widely used in East Africa). Requires SMS_PROVIDER=africastalking, SMS_API_KEY,
 * SMS_USERNAME and optionally SMS_SENDER_ID. Must be verified against the provider sandbox before pilot use.
 */
@Injectable()
export class AfricasTalkingSmsProvider extends SmsProvider {
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);
  readonly configured: boolean;

  constructor(private readonly config: AppConfig) {
    super();
    this.configured =
      config.get('SMS_PROVIDER') === 'africastalking' && !!config.get('SMS_API_KEY') && !!config.get('SMS_USERNAME');
  }

  async send(to: string, message: string): Promise<DeliveryResult> {
    if (!this.configured) return { ok: false, skipped: true, error: 'SMS_PROVIDER_NOT_CONFIGURED' };
    const username = this.config.get('SMS_USERNAME')!;
    const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const form = new URLSearchParams({ username, to, message });
    const sender = this.config.get('SMS_SENDER_ID');
    if (sender) form.set('from', sender);
    try {
      const res = await fetch(`https://${host}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey: this.config.get('SMS_API_KEY')!,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: `SMS_HTTP_${res.status}` };
      const body = (await res.json()) as { SMSMessageData?: { Recipients?: { status?: string }[] } };
      const status = body.SMSMessageData?.Recipients?.[0]?.status;
      return status === 'Success' ? { ok: true } : { ok: false, error: `SMS_REJECTED_${status ?? 'UNKNOWN'}` };
    } catch (e) {
      this.logger.warn(`SMS delivery failed: ${(e as Error).message}`);
      return { ok: false, error: 'SMS_DELIVERY_FAILED' };
    }
  }
}
