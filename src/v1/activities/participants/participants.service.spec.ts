import { Test, TestingModule } from '@nestjs/testing';
import { ParticipantsService } from './participants.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityNotificationsService } from '../activity-notifications.service';
import { participation_status } from 'src/generated/prisma/client';

describe('ParticipantsService', () => {
  let service: ParticipantsService;
  let prisma: {
    activity: any;
    activityParticipant: any;
    user_profiles: any;
    $transaction: jest.Mock;
  };
  let notifications: ActivityNotificationsService;

  beforeEach(async () => {
    prisma = {
      activity: {
        findUnique: jest.fn(),
      },
      activityParticipant: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      user_profiles: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) =>
        cb({
          activity: prisma.activity,
          activityParticipant: prisma.activityParticipant,
          user_profiles: prisma.user_profiles,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipantsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ActivityNotificationsService,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ParticipantsService);
    notifications = module.get(ActivityNotificationsService);
    prisma.activityParticipant.count.mockResolvedValue(0);
    prisma.activityParticipant.findMany.mockResolvedValue([]);
    prisma.activityParticipant.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('join', () => {
    it('creates a confirmed participant when slots are available', async () => {
      prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1', user_id: 'user-1' });
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        host_id: 'host-1',
        status: 'published',
        is_public: true,
        max_participants: 10,
      });
      prisma.activityParticipant.findUnique
        .mockResolvedValueOnce(null) // Existing participation
        .mockResolvedValueOnce({
          id: 'participant-1',
          profile: {
            id: 'profile-1',
            user_id: 'user-1',
            full_name: 'Jane',
            profile_picture_url: null,
          },
          status: 'confirmed',
          waitlist_position: null,
          approval_message: null,
          joined_at: new Date(),
          approved_at: new Date(),
          cancelled_at: null,
        });
      prisma.activityParticipant.count.mockResolvedValue(0);
      prisma.activityParticipant.create.mockResolvedValue({
        id: 'participant-1',
        profile_id: 'profile-1',
        status: 'confirmed' as participation_status,
      });

      const result = await service.join('activity-1', 'user-1', { message: 'Hi' });

      expect(result.status).toBe('confirmed');
      expect(prisma.activityParticipant.create).toHaveBeenCalled();
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activity.joined',
        }),
      );
    });

    it('places user on waitlist when activity is full', async () => {
      prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1', user_id: 'user-1' });
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        host_id: 'host-1',
        status: 'published',
        is_public: true,
        max_participants: 1,
      });
      prisma.activityParticipant.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'participant-1',
          profile: {
            id: 'profile-1',
            user_id: 'user-1',
            full_name: 'Jane',
            profile_picture_url: null,
          },
          status: 'waitlisted',
          waitlist_position: 1,
          approval_message: null,
          joined_at: new Date(),
          approved_at: null,
          cancelled_at: null,
        });
      prisma.activityParticipant.count
        .mockResolvedValueOnce(1) // confirmed count
        .mockResolvedValueOnce(0) // waitlist count
        .mockResolvedValue(0);
      prisma.activityParticipant.create.mockResolvedValue({
        id: 'participant-1',
        profile_id: 'profile-1',
        status: 'waitlisted' as participation_status,
        waitlist_position: 1,
      });

      const result = await service.join('activity-1', 'user-1', {});

      expect(result.status).toBe('waitlisted');
      expect(result.waitlistPosition).toBe(1);
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activity.waitlisted',
        }),
      );
    });
  });

  describe('cancelParticipation', () => {
    it('allows a participant to cancel themselves', async () => {
      const participationRecord = {
        id: 'participant-1',
        activity_id: 'activity-1',
        status: 'confirmed' as participation_status,
        waitlist_position: null,
        activity: { id: 'activity-1', host_id: 'host-2', max_participants: 10 },
        profile: {
          id: 'profile-1',
          user_id: 'user-1',
          full_name: 'Jane',
          profile_picture_url: null,
        },
        approval_message: null,
        joined_at: new Date(),
        approved_at: new Date(),
        cancelled_at: null,
      };

      prisma.activityParticipant.findUnique.mockResolvedValueOnce(participationRecord);
      prisma.activityParticipant.update.mockResolvedValue({
        ...participationRecord,
        status: 'cancelled',
        cancelled_at: new Date(),
      });
      prisma.activityParticipant.count.mockResolvedValue(0);

      const result = await service.cancelParticipation('activity-1', 'participant-1', 'user-1');

      expect(result.status).toBe('cancelled');
      expect(prisma.activityParticipant.update).toHaveBeenCalled();
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activity.cancelled',
        }),
      );
    });
  });
});

