import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscriptionTier } from 'src/common/enums/subscription-tier.enum';
import { ActivityFeedbackService } from './activity-feedback.service';

describe('ActivityFeedbackService', () => {
  let service: ActivityFeedbackService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      activity: {
        findUnique: jest.fn(),
      },
      activityParticipant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      activityFeedback: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      activityParticipantRating: {
        count: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      user_profiles: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedbackService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ActivityFeedbackService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('rejects feedback submission before activity ends', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1', user_id: 'user-1' });
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      status: 'published',
      activity_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'confirmed' });

    await expect(
      service.submitFeedback(
        'activity-1',
        { supabaseUserId: 'user-1', type: SubscriptionTier.FREEMIUM } as any,
        { rating: 4, consentToAnalysis: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('flags low ratings after repeated misconduct', async () => {
    prisma.user_profiles.findUnique.mockImplementation(({ where }: any) => {
      if (where.user_id === 'user-1') {
        return { id: 'profile-1', user_id: 'user-1' };
      }
      if (where.user_id === 'host-1') {
        return { id: 'profile-host', user_id: 'host-1' };
      }
      return null;
    });
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      status: 'completed',
      activity_date: new Date(),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'confirmed' });
    prisma.activityFeedback.findUnique.mockResolvedValue(null);
    prisma.activityParticipant.findMany.mockResolvedValue([{ profile_id: 'profile-2' }]);

    const tx = {
      activityFeedback: {
        create: jest.fn().mockResolvedValue({
          id: 'feedback-1',
          rating: 3,
          comment: null,
          consent_to_analysis: true,
        }),
      },
      activityParticipantRating: {
        count: jest.fn().mockResolvedValue(3),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await service.submitFeedback(
      'activity-1',
      { supabaseUserId: 'user-1', type: SubscriptionTier.PREMIUM } as any,
      {
        rating: 3,
        comment: null,
        consentToAnalysis: true,
        participantRatings: [{ profileId: 'profile-2', rating: 2 }],
      },
    );

    expect(tx.activityParticipantRating.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          target_profile_id: 'profile-2',
          flagged_for_review: false,
        }),
      ],
    });
    expect(tx.activityParticipantRating.updateMany).toHaveBeenCalledWith({
      where: {
        feedback_id: 'feedback-1',
        target_profile_id: 'profile-2',
        rating: { lte: 2 },
      },
      data: { flagged_for_review: true },
    });
  });

  it('blocks non-premium users from viewing rating summaries', async () => {
    await expect(
      service.getUserRatingSummary('activity-1', 'profile-2', {
        supabaseUserId: 'user-1',
        type: SubscriptionTier.FREEMIUM,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires consent to submit feedback', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1', user_id: 'user-1' });
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      status: 'completed',
      activity_date: new Date(),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'confirmed' });

    await expect(
      service.submitFeedback(
        'activity-1',
        { supabaseUserId: 'user-1', type: SubscriptionTier.PREMIUM } as any,
        { rating: 4, consentToAnalysis: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

