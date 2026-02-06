import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { MembershipTierKey, MembershipTierModel, MembershipTierRules } from './membership-tiers.model';

@Injectable()
export class MembershipTiersService {
  private readonly model: MembershipTierModel;

  constructor() {
    this.model = this.loadModel();
  }

  getModel(): MembershipTierModel {
    return this.model;
  }

  getTierRules(tier: MembershipTierKey): MembershipTierRules {
    return this.model.tiers[tier];
  }

  getTierNames(): MembershipTierKey[] {
    return Object.keys(this.model.tiers);
  }

  getDefaultTier(): MembershipTierKey {
    if (this.model.defaultTier && this.model.tiers[this.model.defaultTier]) {
      return this.model.defaultTier;
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

    return this.model.tiers[tier]?.metadata?.tierClass;
  }

  getLogicDifferences(): string[] {
    return this.model.logic?.differences ?? [];
  }

  private loadModel(): MembershipTierModel {
    const modelPath = this.resolveModelPath();
    const raw = readFileSync(modelPath, 'utf-8');
    const parsed = JSON.parse(raw) as MembershipTierModel;

    this.assertValidModel(parsed, modelPath);
    return parsed;
  }

  private resolveModelPath(): string {
    const cwd = process.cwd();
    const candidates = [
      resolve(__dirname, 'membership-tiers.json'),
      resolve(cwd, 'src/config/membership-tiers.json'),
      resolve(cwd, 'config/membership-tiers.json'),
      resolve(cwd, '../src/config/membership-tiers.json'),
      resolve(cwd, 'src/backend/src/config/membership-tiers.json'),
      resolve(cwd, 'src/backend/dist/config/membership-tiers.json'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Membership tiers model not found in expected locations.');
  }

  private assertValidModel(model: MembershipTierModel, modelPath: string) {
    if (!model || typeof model !== 'object') {
      throw new Error(`Invalid membership tiers model at ${modelPath}.`);
    }

    if (!model.tiers || typeof model.tiers !== 'object') {
      throw new Error(`Membership tiers model missing tiers object at ${modelPath}.`);
    }

    const tierKeys = Object.keys(model.tiers);
    if (tierKeys.length === 0) {
      throw new Error(`Membership tiers model must define at least one tier at ${modelPath}.`);
    }

    if (model.defaultTier && !model.tiers[model.defaultTier]) {
      throw new Error(`Membership tiers model defaultTier is not defined in tiers at ${modelPath}.`);
    }

    if (!Array.isArray(model.logic?.differences)) {
      throw new Error(`Membership tiers model is missing logic differences at ${modelPath}.`);
    }
  }
}
