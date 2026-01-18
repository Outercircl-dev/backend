import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    activity: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    interest: {
      findMany: jest.fn(),
    },
    activityParticipant: {
      count: jest.fn(),
      findUnique: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    mockPrismaService.activityParticipant.count.mockResolvedValue(0);
    mockPrismaService.activityParticipant.findUnique.mockResolvedValue(null);
    mockPrismaService.activityGroup.findUnique.mockResolvedValue(null);
    mockPrismaService.activityGroupMember.findUnique.mockResolvedValue(null);
    mockPrismaService.activitySeries.findUnique.mockResolvedValue(null);
    mockPrismaService.user_profiles.findUnique.mockResolvedValue({ id: 'profile-1' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const hostId = 'host-123';
    const hostUser = { supabaseUserId: hostId, role: 'authenticated', type: 'FREEMIUM' as const };
    const createDto: CreateActivityDto = {
      title: 'Test Activity',
      description: 'Test Description',
      category: 'Sports',
      interests: ['basketball', 'football'],
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      },
      activityDate: '2025-12-31',
      startTime: '10:00',
      endTime: '12:00',
      maxParticipants: 4,
      isPublic: true,
    };

    it('should create an activity successfully', async () => {
      const mockInterests = [
        { slug: 'basketball' },
        { slug: 'football' },
      ];
      const mockActivity = {
        id: 'activity-123',
        host_id: hostId,
        title: createDto.title,
        description: createDto.description,
        category: createDto.category,
        interests: createDto.interests,
        location: createDto.location,
        activity_date: new Date(createDto.activityDate),
        start_time: createDto.startTime,
        end_time: createDto.endTime,
        max_participants: createDto.maxParticipants,
        current_participants: 0,
        status: 'draft',
        is_public: createDto.isPublic,
        group_id: null,
        series_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.interest.findMany.mockResolvedValue(mockInterests);
      mockPrismaService.activity.create.mockResolvedValue(mockActivity);

      const result = await service.create(hostUser, createDto);

      expect(mockPrismaService.interest.findMany).toHaveBeenCalledWith({
        where: { slug: { in: createDto.interests } },
        select: { slug: true },
      });
      expect(mockPrismaService.activity.create).toHaveBeenCalled();
      expect(result.id).toBe('activity-123');
      expect(result.status).toBe('draft');
    });

    it('should throw BadRequestException for invalid interests', async () => {
      mockPrismaService.interest.findMany.mockResolvedValue([{ slug: 'basketball' }]);

      await expect(service.create(hostUser, createDto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.activity.create).not.toHaveBeenCalled();
    });

    it('should reject non-verified hosts', async () => {
      const unverifiedUser = { supabaseUserId: hostId, role: 'anonymous', type: 'FREEMIUM' as const };
      await expect(service.create(unverifiedUser, createDto)).rejects.toThrow(ForbiddenException);
    });

    it('should enforce free-tier participant cap', async () => {
      const invalidDto = { ...createDto, maxParticipants: 6 };
      await expect(service.create(hostUser, invalidDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid location', async () => {
      const invalidDto = { ...createDto, location: { latitude: 37.7749 } };
      await expect(service.create(hostUser, invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when end time is before start time', async () => {
      const invalidDto = { ...createDto, startTime: '12:00', endTime: '10:00' };
      mockPrismaService.interest.findMany.mockResolvedValue([
        { slug: 'basketball' },
        { slug: 'football' },
      ]);

      await expect(service.create(hostUser, invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated activities', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          host_id: 'host-1',
          title: 'Activity 1',
          description: 'Desc 1',
          category: 'Sports',
          interests: ['basketball'],
          location: { latitude: 37.7749, longitude: -122.4194 },
          activity_date: new Date('2025-12-31'),
          start_time: '10:00',
          end_time: '12:00',
          max_participants: 10,
          current_participants: 5,
          status: 'published',
          is_public: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockPrismaService.activity.findMany.mockResolvedValue(mockActivities);
      mockPrismaService.activity.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status', async () => {
      mockPrismaService.activity.findMany.mockResolvedValue([]);
      mockPrismaService.activity.count.mockResolvedValue(0);

      await service.findAll({ status: 'published' });

      expect(mockPrismaService.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'published' },
        }),
      );
    });

    it('should filter by hostId', async () => {
      mockPrismaService.activity.findMany.mockResolvedValue([]);
      mockPrismaService.activity.count.mockResolvedValue(0);

      await service.findAll({ hostId: 'host-123' });

      expect(mockPrismaService.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { host_id: 'host-123' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an activity by id', async () => {
      const mockActivity = {
        id: 'activity-123',
        host_id: 'host-1',
        title: 'Test Activity',
        description: 'Test',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2099-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 10,
        current_participants: 5,
        status: 'published',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(mockActivity);

      const result = await service.findOne('activity-123');

      expect(result.id).toBe('activity-123');
      expect(mockPrismaService.activity.findUnique).toHaveBeenCalledWith({
        where: { id: 'activity-123' },
      });
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const activityId = 'activity-123';
    const hostId = 'host-123';
    const hostUser = { supabaseUserId: hostId, role: 'authenticated', type: 'FREEMIUM' as const };
    const updateDto: UpdateActivityDto = {
      title: 'Updated Title',
      description: 'Updated Description',
      category: 'Sports',
      interests: ['basketball'],
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      },
      activityDate: '2099-12-31',
      startTime: '10:00',
      endTime: '12:00',
      maxParticipants: 4,
      isPublic: true,
    };

    it('should update activity when user is host', async () => {
      const existingActivity = {
        id: activityId,
        host_id: hostId,
        title: 'Original Title',
        description: 'Original',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2099-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 4,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        group_id: null,
        series_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedActivity = { ...existingActivity, title: 'Updated Title' };

      mockPrismaService.interest.findMany.mockResolvedValue([{ slug: 'basketball' }]);
      mockPrismaService.activity.findUnique.mockResolvedValue(existingActivity);
      mockPrismaService.activity.update.mockResolvedValue(updatedActivity);

      const result = await service.update(activityId, hostUser, updateDto);

      expect(result.title).toBe('Updated Title');
      expect(mockPrismaService.activity.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not host', async () => {
      const existingActivity = {
        id: activityId,
        host_id: 'different-host',
        title: 'Original Title',
        description: 'Original',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 4,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        group_id: null,
        series_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(existingActivity);

      await expect(service.update(activityId, hostUser, updateDto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.activity.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.update(activityId, hostUser, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    const activityId = 'activity-123';
    const hostId = 'host-123';
    const hostUser = { supabaseUserId: hostId, role: 'authenticated', type: 'FREEMIUM' as const };

    it('should delete activity when user is host', async () => {
      const existingActivity = {
        id: activityId,
        host_id: hostId,
        title: 'Test Activity',
        description: 'Test',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 4,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        group_id: null,
        series_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(existingActivity);
      mockPrismaService.activity.delete.mockResolvedValue(existingActivity);

      await service.remove(activityId, hostUser);

      expect(mockPrismaService.activity.delete).toHaveBeenCalledWith({
        where: { id: activityId },
      });
    });

    it('should throw ForbiddenException when user is not host', async () => {
      const existingActivity = {
        id: activityId,
        host_id: 'different-host',
        title: 'Test Activity',
        description: 'Test',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 4,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        group_id: null,
        series_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activity.findUnique.mockResolvedValue(existingActivity);

      await expect(service.remove(activityId, hostUser)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.activity.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activity.findUnique.mockResolvedValue(null);

      await expect(service.remove(activityId, hostUser)).rejects.toThrow(NotFoundException);
    });
  });

  // Legacy participant increment/decrement functionality moved to ParticipantsService tests.
});

