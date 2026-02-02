import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityMessagesService } from './activity-messages.service';

describe('ActivityMessagesService', () => {
  let service: ActivityMessagesService;
  let prisma: {
    activity: any;
    activityParticipant: any;
    activityMessage: any;
    activityMessageReport: any;
    user_profiles: any;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      activity: {
        findUnique: jest.fn(),
      },
      activityParticipant: {
        findUnique: jest.fn(),
      },
      activityMessage: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      activityMessageReport: {
        create: jest.fn(),
      },
      user_profiles: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) =>
        cb({
          activityMessage: prisma.activityMessage,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityMessagesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ActivityMessagesService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('allows host to create a pinned announcement', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.activity.findUnique.mockResolvedValue({ id: 'activity-1', host_id: 'user-1' });
    prisma.activityMessage.create.mockResolvedValue({
      id: 'message-1',
      activity_id: 'activity-1',
      author_profile_id: 'profile-1',
      content: 'Hello',
      message_type: 'announcement',
      is_pinned: true,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
      author: { id: 'profile-1', full_name: 'Host', profile_picture_url: null },
    });

    const result = await service.createMessage(
      'activity-1',
      { supabaseUserId: 'user-1', type: 'PREMIUM', tierClass: 'premium', isVerified: true } as any,
      { content: 'Hello', messageType: 'announcement', isPinned: true },
    );

    expect(result.isPinned).toBe(true);
    expect(prisma.activityMessage.updateMany).toHaveBeenCalled();
  });

  it('rejects non-host announcement', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.activity.findUnique.mockResolvedValue({ id: 'activity-1', host_id: 'host-1' });
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'confirmed' });

    await expect(
      service.createMessage(
        'activity-1',
        { supabaseUserId: 'user-1', type: 'FREE', isVerified: true } as any,
        { content: 'Hello', messageType: 'announcement' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks duplicate reports', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1' });
    prisma.activity.findUnique.mockResolvedValue({ id: 'activity-1', host_id: 'host-1' });
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'confirmed' });
    prisma.activityMessage.findUnique.mockResolvedValue({ id: 'message-1', activity_id: 'activity-1' });
    prisma.activityMessageReport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.reportMessage(
        'activity-1',
        'message-1',
        { supabaseUserId: 'user-1', type: 'FREE', isVerified: true } as any,
        { reason: 'spam' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

