import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import { MembershipSubscriptionsService } from 'src/membership/membership-subscriptions.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivitiesController } from 'src/v1/activities/activities.controller';
import { ActivitiesService } from 'src/v1/activities/activities.service';
import { ActivityMessagesService } from 'src/v1/activities/messages/activity-messages.service';
import { NotificationsService } from 'src/v1/notifications/notifications.service';

describe('Activities create integration', () => {
  let app: INestApplication;

  const mockPrismaService = {
    activity: {
      create: jest.fn(),
      count: jest.fn(),
    },
    interest: {
      findMany: jest.fn(),
    },
    activityParticipant: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    activityGroup: {
      findUnique: jest.fn(),
    },
    activityGroupMember: {
      findUnique: jest.fn(),
    },
    activitySeries: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    user_profiles: {
      findUnique: jest.fn(),
    },
  };

  const mockMessagesService = {
    createSystemMessage: jest.fn(),
  };

  const mockMembershipTiersService = {
    getTierRules: jest.fn(),
  };

  const mockMembershipSubscriptionsService = {
    resolveTierForUserId: jest.fn(),
  };

  const mockNotificationsService = {
    createForRecipients: jest.fn(),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ActivityMessagesService,
          useValue: mockMessagesService,
        },
        {
          provide: MembershipTiersService,
          useValue: mockMembershipTiersService,
        },
        {
          provide: MembershipSubscriptionsService,
          useValue: mockMembershipSubscriptionsService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    });

    moduleBuilder.overrideGuard(SupabaseAuthGuard).useValue({
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        req.user = {
          supabaseUserId: 'host-123',
          role: 'authenticated',
          type: 'FREEMIUM',
          tierClass: 'freemium',
        };
        return true;
      },
    });

    const moduleFixture: TestingModule = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jest.clearAllMocks();
    mockMembershipSubscriptionsService.resolveTierForUserId.mockResolvedValue(
      'FREEMIUM',
    );
    mockMembershipTiersService.getTierRules.mockReturnValue({
      hosting: {
        maxParticipantsPerActivity: 4,
        maxHostsPerMonth: 2,
        enforceExactMaxParticipants: true,
      },
      groups: {
        enabled: false,
        maxMembers: 15,
      },
      ads: {
        showsAds: true,
      },
      verification: {
        requiresVerifiedHostForHosting: true,
      },
      messaging: {
        groupChatEnabled: true,
        automatedMessagesEnabled: true,
      },
    });

    mockPrismaService.activityParticipant.count.mockResolvedValue(0);
    mockPrismaService.activityParticipant.findUnique.mockResolvedValue(null);
    mockPrismaService.activityParticipant.findMany.mockResolvedValue([]);
    mockPrismaService.activityGroup.findUnique.mockResolvedValue(null);
    mockPrismaService.activityGroupMember.findUnique.mockResolvedValue(null);
    mockPrismaService.activitySeries.findUnique.mockResolvedValue(null);
    mockPrismaService.user_profiles.findUnique.mockResolvedValue({
      id: 'profile-1',
    });
    mockPrismaService.activity.count.mockResolvedValue(0);
    mockMessagesService.createSystemMessage.mockResolvedValue(undefined);
    mockNotificationsService.createForRecipients.mockResolvedValue(0);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects invalid address format with HTTP 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/activities')
      .send({
        title: 'Evening Run',
        category: 'Sports',
        interests: ['running'],
        location: {
          address: '123456',
          latitude: 37.7749,
          longitude: -122.4194,
          placeId: 'mock_place_123',
        },
        activityDate: '2099-12-31',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
        maxParticipants: 4,
      });

    expect(response.status).toBe(400);
    expect(mockPrismaService.activity.create).not.toHaveBeenCalled();
  });

  it('rejects past activity start datetime with HTTP 400', async () => {
    mockPrismaService.interest.findMany.mockResolvedValue([
      { slug: 'running' },
    ]);

    const response = await request(app.getHttpServer())
      .post('/api/activities')
      .send({
        title: 'Early Ride',
        category: 'Sports',
        interests: ['running'],
        location: {
          address: '221B Baker Street',
          latitude: 37.7749,
          longitude: -122.4194,
          placeId: 'mock_place_123',
        },
        activityDate: '2000-01-01',
        startTime: '00:00',
        endTime: '01:00',
        timezone: 'UTC',
        maxParticipants: 4,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      'Activity start date/time must be in the future',
    );
    expect(mockPrismaService.activity.create).not.toHaveBeenCalled();
  });

  it('creates activity successfully for valid future payload', async () => {
    mockPrismaService.interest.findMany.mockResolvedValue([
      { slug: 'running' },
    ]);
    mockPrismaService.activity.create.mockResolvedValue({
      id: 'activity-123',
      host_id: 'host-123',
      title: 'Sunrise Ride',
      description: null,
      category: 'Sports',
      interests: ['running'],
      location: {
        address: '221B Baker Street',
        latitude: 37.7749,
        longitude: -122.4194,
        placeId: 'mock_place_123',
      },
      activity_date: new Date('2099-12-31'),
      start_time: '10:00:00',
      end_time: '11:00:00',
      max_participants: 4,
      current_participants: 0,
      status: 'published',
      is_public: true,
      group_id: null,
      series_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const response = await request(app.getHttpServer())
      .post('/api/activities')
      .send({
        title: 'Sunrise Ride',
        category: 'Sports',
        interests: ['running'],
        location: {
          address: '221B Baker Street',
          latitude: 37.7749,
          longitude: -122.4194,
          placeId: 'mock_place_123',
        },
        activityDate: '2099-12-31',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
        maxParticipants: 4,
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('activity-123');
    expect(mockPrismaService.activity.create).toHaveBeenCalled();
    expect(mockPrismaService.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: expect.objectContaining({
            placeId: 'mock_place_123',
          }),
        }),
      }),
    );
  });

  it('rejects invalid placeId format with HTTP 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/activities')
      .send({
        title: 'Evening Run',
        category: 'Sports',
        interests: ['running'],
        location: {
          address: '221B Baker Street',
          latitude: 37.7749,
          longitude: -122.4194,
          placeId: 'invalid place id!',
        },
        activityDate: '2099-12-31',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
        maxParticipants: 4,
      });

    expect(response.status).toBe(400);
    expect(mockPrismaService.activity.create).not.toHaveBeenCalled();
  });
});
