import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityFeedbackService } from './activity-feedback.service';
import { MembershipSubscriptionsService } from 'src/membership/membership-subscriptions.service';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import { NotificationsService } from 'src/v1/notifications/notifications.service';

describe('ActivityFeedbackService', () => {
  let service: ActivityFeedbackService;
  let prisma: any;
  let membershipSubscriptionsService: { resolveTierForUserId: jest.Mock };
  let membershipTiersService: { getTierClass: jest.Mock };
  let notificationsService: {
    createNotification: jest.Mock;
  };

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
    membershipSubscriptionsService = {
      resolveTierForUserId: jest.fn().mockResolvedValue('FREEMIUM'),
    };
    membershipTiersService = {
      getTierClass: jest
        .fn()
        .mockImplementation((tier) =>
          tier === 'PREMIUM' ? 'premium' : 'freemium',
        ),
    };
    notificationsService = {
      createNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedbackService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: MembershipSubscriptionsService,
          useValue: membershipSubscriptionsService,
        },
        {
          provide: MembershipTiersService,
          useValue: membershipTiersService,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    service = module.get(ActivityFeedbackService);
    notificationsService.createNotification.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('rejects feedback submission before activity ends', async () => {
    membershipSubscriptionsService.resolveTierForUserId.mockResolvedValue(
      'FREEMIUM',
    );
    prisma.user_profiles.findUnique.mockResolvedValue({
      id: 'profile-1',
      user_id: 'user-1',
    });
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      status: 'published',
      activity_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({
      status: 'confirmed',
    });

    await expect(
      service.submitFeedback(
        'activity-1',
        {
          supabaseUserId: 'user-1',
          type: 'FREEMIUM',
          tierClass: 'freemium',
        } as any,
        { rating: 4, consentToAnalysis: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('flags low ratings after repeated misconduct', async () => {
    membershipSubscriptionsService.resolveTierForUserId.mockResolvedValue(
      'PREMIUM',
    );
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
      title: 'Test activity',
      status: 'completed',
      activity_date: new Date(),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({
      status: 'confirmed',
    });
    prisma.activityFeedback.findUnique.mockResolvedValue(null);
    prisma.activityParticipant.findMany.mockResolvedValue([
      { profile_id: 'profile-2' },
    ]);

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
    prisma.user_profiles.findMany = jest.fn().mockResolvedValue([
      { id: 'profile-2', user_id: 'user-2' },
    ]);

    await service.submitFeedback(
      'activity-1',
      {
        supabaseUserId: 'user-1',
        type: 'PREMIUM',
        tierClass: 'premium',
      } as any,
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
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'host-1',
        type: 'host_update',
      }),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'user-2',
        title: 'You received a participant rating',
      }),
    );
  });

  it('blocks non-premium users from viewing rating summaries', async () => {
    membershipSubscriptionsService.resolveTierForUserId.mockResolvedValue(
      'FREEMIUM',
    );
    await expect(
      service.getUserRatingSummary('activity-1', 'profile-2', {
        supabaseUserId: 'user-1',
        type: 'FREEMIUM',
        tierClass: 'freemium',
        tierClass: 'freemium',
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires consent to submit feedback', async () => {
    membershipSubscriptionsService.resolveTierForUserId.mockResolvedValue(
      'PREMIUM',
    );
    prisma.user_profiles.findUnique.mockResolvedValue({
      id: 'profile-1',
      user_id: 'user-1',
    });
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      title: 'Test activity',
      status: 'completed',
      activity_date: new Date(),
      start_time: new Date(),
      end_time: new Date(),
    });
    prisma.activityParticipant.findUnique.mockResolvedValue({
      status: 'confirmed',
    });

    await expect(
      service.submitFeedback(
        'activity-1',
        {
          supabaseUserId: 'user-1',
          type: 'PREMIUM',
          tierClass: 'premium',
        } as any,
        { rating: 4, consentToAnalysis: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
