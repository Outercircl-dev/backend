import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { MembershipTierKey, MembershipTierModel, MembershipTierRules } from './membership-tiers.model';

const CONFIG_SOURCE = 'membership_tiers_config (database)';

@Injectable()
export class MembershipTiersService implements OnModuleInit {
  private model: MembershipTierModel | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const row = await this.prisma.membershipTiersConfig.findFirst({
      where: { id: 1 },
      orderBy: { id: 'asc' },
    });

    if (!row) {
      throw new Error(
        `Membership tiers config not found. Run migration 008_membership_tiers_config.sql to seed ${CONFIG_SOURCE}.`,
      );
    }

    const parsed: MembershipTierModel = {
      version: row.version,
      lastUpdated: row.last_updated,
      defaultTier: row.default_tier_key,
      tiers: row.tiers as unknown as Record<MembershipTierKey, MembershipTierRules>,
      logic: {
        differences: Array.isArray(row.logic_differences)
          ? (row.logic_differences as string[])
          : [],
      },
    };

    this.assertValidModel(parsed, CONFIG_SOURCE);
    this.model = parsed;
  }

  getModel(): MembershipTierModel {
    if (this.model === null) {
      throw new Error('Membership tiers not yet loaded. Ensure onModuleInit has completed.');
    }
    return this.model;
  }

  getTierRules(tier: MembershipTierKey): MembershipTierRules {
    return this.getModel().tiers[tier];
  }

  getTierNames(): MembershipTierKey[] {
    return Object.keys(this.getModel().tiers);
  }

  getDefaultTier(): MembershipTierKey {
    const model = this.getModel();
    if (model.defaultTier && model.tiers[model.defaultTier]) {
      return model.defaultTier;
    }

    const [firstTier] = this.getTierNames();
    return firstTier;
  }

  resolveTierKey(rawTier: string | undefined): MembershipTierKey | undefined {
    if (!rawTier || typeof rawTier !== 'string') {
      return undefined;
    }

    const normalized = rawTier.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    return this.getTierNames().find((tier) => tier.toLowerCase() === normalized);
  }

  getTierClass(tier: MembershipTierKey | undefined): string | undefined {
    if (!tier) {
      return undefined;
    }

    return this.getModel().tiers[tier]?.metadata?.tierClass;
  }

  getLogicDifferences(): string[] {
    return this.getModel().logic?.differences ?? [];
  }

  private assertValidModel(model: MembershipTierModel, source: string): void {
    if (!model || typeof model !== 'object') {
      throw new Error(`Invalid membership tiers model in ${source}.`);
    }

    if (!model.tiers || typeof model.tiers !== 'object') {
      throw new Error(`Membership tiers model missing tiers object in ${source}.`);
    }

    const tierKeys = Object.keys(model.tiers);
    if (tierKeys.length === 0) {
      throw new Error(`Membership tiers model must define at least one tier in ${source}.`);
    }

    if (model.defaultTier && !model.tiers[model.defaultTier]) {
      throw new Error(`Membership tiers model defaultTier is not defined in tiers in ${source}.`);
    }

    if (!Array.isArray(model.logic?.differences)) {
      throw new Error(`Membership tiers model is missing logic differences in ${source}.`);
    }
  }
}
