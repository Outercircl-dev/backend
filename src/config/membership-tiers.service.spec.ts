import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { MembershipTiersService } from './membership-tiers.service';

const validConfigRow = {
  id: 1,
  version: '1.0',
  last_updated: '2026-01-29',
  default_tier_key: 'FREEMIUM',
  tiers: {
    FREEMIUM: {
      metadata: { tierClass: 'freemium', displayName: 'Freemium' },
      hosting: {
        maxParticipantsPerActivity: 4,
        maxHostsPerMonth: 2,
        enforceExactMaxParticipants: true,
      },
      groups: { enabled: false, maxMembers: 15 },
      ads: { showsAds: true },
      verification: { requiresVerifiedHostForHosting: true },
      messaging: { groupChatEnabled: true, automatedMessagesEnabled: true },
    },
    PREMIUM: {
      metadata: { tierClass: 'premium', displayName: 'Premium' },
      hosting: {
        maxParticipantsPerActivity: null,
        maxHostsPerMonth: null,
        enforceExactMaxParticipants: false,
      },
      groups: { enabled: true, maxMembers: 15 },
      ads: { showsAds: false },
      verification: { requiresVerifiedHostForHosting: true },
      messaging: { groupChatEnabled: true, automatedMessagesEnabled: true },
    },
  },
  logic_differences: [
    'Freemium hosts must set max participants to 4; premium has no enforced cap.',
    'Freemium users see ads; premium users do not.',
  ],
};

describe('MembershipTiersService', () => {
  let service: MembershipTiersService;
  const mockPrismaService = {
    membershipTiersConfig: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.membershipTiersConfig.findFirst.mockResolvedValue(validConfigRow);
  });

  describe('when config is loaded from database', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MembershipTiersService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
        ],
      }).compile();

      service = module.get(MembershipTiersService);
      await service.onModuleInit();
    });

    it('loads model via findFirst with id 1', async () => {
      expect(mockPrismaService.membershipTiersConfig.findFirst).toHaveBeenCalledWith({
        where: { id: 1 },
        orderBy: { id: 'asc' },
      });
    });

    it('getModel returns the loaded model', () => {
      const model = service.getModel();
      expect(model.version).toBe('1.0');
      expect(model.lastUpdated).toBe('2026-01-29');
      expect(model.defaultTier).toBe('FREEMIUM');
      expect(Object.keys(model.tiers)).toEqual(['FREEMIUM', 'PREMIUM']);
      expect(model.logic.differences).toHaveLength(2);
    });

    it('getTierRules returns rules for a tier', () => {
      const freemium = service.getTierRules('FREEMIUM');
      expect(freemium.hosting.maxParticipantsPerActivity).toBe(4);
      expect(freemium.ads.showsAds).toBe(true);

      const premium = service.getTierRules('PREMIUM');
      expect(premium.hosting.maxParticipantsPerActivity).toBeNull();
      expect(premium.ads.showsAds).toBe(false);
    });

    it('getTierNames returns tier keys', () => {
      expect(service.getTierNames()).toEqual(['FREEMIUM', 'PREMIUM']);
    });

    it('getDefaultTier returns default tier', () => {
      expect(service.getDefaultTier()).toBe('FREEMIUM');
    });

    it('resolveTierKey normalizes and resolves tier key', () => {
      expect(service.resolveTierKey('freemium')).toBe('FREEMIUM');
      expect(service.resolveTierKey('  PREMIUM  ')).toBe('PREMIUM');
      expect(service.resolveTierKey('unknown')).toBeUndefined();
      expect(service.resolveTierKey('')).toBeUndefined();
      expect(service.resolveTierKey(undefined)).toBeUndefined();
    });

    it('getTierClass returns tier class from metadata', () => {
      expect(service.getTierClass('FREEMIUM')).toBe('freemium');
      expect(service.getTierClass('PREMIUM')).toBe('premium');
      expect(service.getTierClass(undefined)).toBeUndefined();
      expect(service.getTierClass('UNKNOWN')).toBeUndefined();
    });

    it('getLogicDifferences returns logic differences array', () => {
      expect(service.getLogicDifferences()).toEqual(validConfigRow.logic_differences);
    });
  });

  describe('when config row is missing', () => {
    it('onModuleInit throws with message to run migration', async () => {
      mockPrismaService.membershipTiersConfig.findFirst.mockResolvedValue(null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MembershipTiersService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
        ],
      }).compile();

      service = module.get(MembershipTiersService);
      await expect(service.onModuleInit()).rejects.toThrow(
        /Membership tiers config not found.*008_membership_tiers_config/,
      );
    });
  });

  describe('when config is invalid (missing tiers)', () => {
    it('onModuleInit throws', async () => {
      mockPrismaService.membershipTiersConfig.findFirst.mockResolvedValue({
        ...validConfigRow,
        tiers: null,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MembershipTiersService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
        ],
      }).compile();

      service = module.get(MembershipTiersService);
      await expect(service.onModuleInit()).rejects.toThrow(/missing tiers object/);
    });
  });

  describe('getModel before init', () => {
    it('throws if model not yet loaded', () => {
      const neverResolvingPrisma = {
        membershipTiersConfig: {
          findFirst: () => new Promise<null>(() => {}),
        },
      };
      const svc = new MembershipTiersService(neverResolvingPrisma as unknown as PrismaService);
      expect(() => svc.getModel()).toThrow(/not yet loaded/);
    });
  });
});
