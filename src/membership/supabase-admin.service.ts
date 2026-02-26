import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name, { timestamp: true });
  private readonly client: SupabaseClient;

  constructor() {
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;

    if (!projectRef || !serviceKey) {
      throw new Error('Supabase admin configuration missing for membership sync');
    }

    const supabaseUrl = `https://${projectRef}.supabase.co`;
    this.client = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async updateSubscriptionTier(userId: string, tier: string): Promise<void> {
    const { data: existing, error: fetchError } = await this.client.auth.admin.getUserById(userId);
    if (fetchError) {
      this.logger.error(`Supabase admin getUserById failed: ${fetchError.message}`);
      throw fetchError;
    }

    const existingMetadata = existing?.user?.app_metadata ?? {};
    const nextMetadata = {
      ...existingMetadata,
      subscription_tier: tier,
    };

    const { error } = await this.client.auth.admin.updateUserById(userId, {
      app_metadata: nextMetadata,
    });

    if (error) {
      this.logger.error(`Supabase admin updateUserById failed: ${error.message}`);
      throw error;
    }
  }

  async getUserEmailById(userId: string): Promise<string | null> {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error) {
      this.logger.warn(`Supabase admin getUserById (email lookup) failed: ${error.message}`);
      return null;
    }
    return data?.user?.email ?? null;
  }
}
