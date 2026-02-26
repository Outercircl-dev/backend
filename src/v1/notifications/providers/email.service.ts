import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from 'src/membership/supabase-admin.service';

export interface EmailSendResult {
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  errorMessage?: string;
}

@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name, { timestamp: true });

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
  ) {}

  async sendNotificationEmail(recipientUserId: string, subject: string, body: string): Promise<EmailSendResult> {
    const email = await this.supabaseAdminService.getUserEmailById(recipientUserId);
    if (!email) {
      return { status: 'skipped', errorMessage: 'Recipient email not found in auth provider' };
    }

    const providerMode = this.configService.get<string>('notifications.emailProviderMode') ?? 'log';
    const from = this.configService.get<string>('notifications.emailFrom') ?? 'no-reply@outercircl.local';

    if (providerMode === 'webhook') {
      const webhookUrl = this.configService.get<string>('notifications.emailWebhookUrl');
      if (!webhookUrl) {
        return { status: 'failed', errorMessage: 'EMAIL_WEBHOOK_URL not configured for webhook provider' };
      }

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: email,
            subject,
            text: body,
          }),
        });

        if (!response.ok) {
          const payload = await response.text();
          return {
            status: 'failed',
            errorMessage: payload || `Webhook provider responded with ${response.status}`,
          };
        }

        return {
          status: 'sent',
          providerMessageId: `webhook-${Date.now()}`,
        };
      } catch (error) {
        return {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Webhook email send failed',
        };
      }
    }

    this.logger.log(`Email notification [log provider] to=${email} from=${from} subject="${subject}"`);
    return {
      status: 'sent',
      providerMessageId: `log-${Date.now()}`,
    };
  }
}

