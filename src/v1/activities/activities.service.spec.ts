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
    activities: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    interests: {
      findMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
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

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const hostId = 'host-123';
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
      maxParticipants: 10,
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.interests.findMany.mockResolvedValue(mockInterests);
      mockPrismaService.activities.create.mockResolvedValue(mockActivity);

      const result = await service.create(hostId, createDto);

      expect(mockPrismaService.interests.findMany).toHaveBeenCalledWith({
        where: { slug: { in: createDto.interests } },
        select: { slug: true },
      });
      expect(mockPrismaService.activities.create).toHaveBeenCalled();
      expect(result.id).toBe('activity-123');
      expect(result.status).toBe('draft');
    });

    it('should throw BadRequestException for invalid interests', async () => {
      mockPrismaService.interests.findMany.mockResolvedValue([{ slug: 'basketball' }]);

      await expect(service.create(hostId, createDto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.activities.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid location', async () => {
      const invalidDto = { ...createDto, location: { latitude: 37.7749 } };
      await expect(service.create(hostId, invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when end time is before start time', async () => {
      const invalidDto = { ...createDto, startTime: '12:00', endTime: '10:00' };
      mockPrismaService.interests.findMany.mockResolvedValue([
        { slug: 'basketball' },
        { slug: 'football' },
      ]);

      await expect(service.create(hostId, invalidDto)).rejects.toThrow(BadRequestException);
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

      mockPrismaService.activities.findMany.mockResolvedValue(mockActivities);
      mockPrismaService.activities.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status', async () => {
      mockPrismaService.activities.findMany.mockResolvedValue([]);
      mockPrismaService.activities.count.mockResolvedValue(0);

      await service.findAll({ status: 'published' });

      expect(mockPrismaService.activities.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'published' },
        }),
      );
    });

    it('should filter by hostId', async () => {
      mockPrismaService.activities.findMany.mockResolvedValue([]);
      mockPrismaService.activities.count.mockResolvedValue(0);

      await service.findAll({ hostId: 'host-123' });

      expect(mockPrismaService.activities.findMany).toHaveBeenCalledWith(
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
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 10,
        current_participants: 5,
        status: 'published',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(mockActivity);

      const result = await service.findOne('activity-123');

      expect(result.id).toBe('activity-123');
      expect(mockPrismaService.activities.findUnique).toHaveBeenCalledWith({
        where: { id: 'activity-123' },
      });
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activities.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const activityId = 'activity-123';
    const hostId = 'host-123';
    const updateDto: UpdateActivityDto = {
      title: 'Updated Title',
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
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 10,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedActivity = { ...existingActivity, title: 'Updated Title' };

      mockPrismaService.activities.findUnique.mockResolvedValue(existingActivity);
      mockPrismaService.activities.update.mockResolvedValue(updatedActivity);

      const result = await service.update(activityId, hostId, updateDto);

      expect(result.title).toBe('Updated Title');
      expect(mockPrismaService.activities.update).toHaveBeenCalled();
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
        max_participants: 10,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(existingActivity);

      await expect(service.update(activityId, hostId, updateDto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.activities.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activities.findUnique.mockResolvedValue(null);

      await expect(service.update(activityId, hostId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    const activityId = 'activity-123';
    const hostId = 'host-123';

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
        max_participants: 10,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(existingActivity);
      mockPrismaService.activities.delete.mockResolvedValue(existingActivity);

      await service.remove(activityId, hostId);

      expect(mockPrismaService.activities.delete).toHaveBeenCalledWith({
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
        max_participants: 10,
        current_participants: 5,
        status: 'draft',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(existingActivity);

      await expect(service.remove(activityId, hostId)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.activities.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when activity not found', async () => {
      mockPrismaService.activities.findUnique.mockResolvedValue(null);

      await expect(service.remove(activityId, hostId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('incrementParticipants', () => {
    it('should increment participants when under capacity', async () => {
      const activity = {
        id: 'activity-123',
        host_id: 'host-1',
        title: 'Test',
        description: 'Test',
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
      };

      const updated = { ...activity, current_participants: 6 };

      mockPrismaService.activities.findUnique
        .mockResolvedValueOnce(activity) // First call: verify activity exists
        .mockResolvedValueOnce(updated); // Second call: fetch updated activity
      mockPrismaService.$executeRaw.mockResolvedValue(1); // 1 row updated

      const result = await service.incrementParticipants('activity-123');

      expect(result.currentParticipants).toBe(6);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('should throw BadRequestException when at capacity', async () => {
      const activity = {
        id: 'activity-123',
        host_id: 'host-1',
        title: 'Test',
        description: 'Test',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 10,
        current_participants: 10,
        status: 'published',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(activity);
      mockPrismaService.$executeRaw.mockResolvedValue(0); // 0 rows updated (at capacity)

      await expect(service.incrementParticipants('activity-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('decrementParticipants', () => {
    it('should decrement participants when > 0', async () => {
      const activity = {
        id: 'activity-123',
        host_id: 'host-1',
        title: 'Test',
        description: 'Test',
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
      };

      const updated = { ...activity, current_participants: 4 };

      mockPrismaService.activities.findUnique
        .mockResolvedValueOnce(activity) // First call: verify activity exists
        .mockResolvedValueOnce(updated); // Second call: fetch updated activity
      mockPrismaService.$executeRaw.mockResolvedValue(1); // 1 row updated

      const result = await service.decrementParticipants('activity-123');

      expect(result.currentParticipants).toBe(4);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('should throw BadRequestException when already at 0', async () => {
      const activity = {
        id: 'activity-123',
        host_id: 'host-1',
        title: 'Test',
        description: 'Test',
        category: 'Sports',
        interests: ['basketball'],
        location: { latitude: 37.7749, longitude: -122.4194 },
        activity_date: new Date('2025-12-31'),
        start_time: '10:00',
        end_time: '12:00',
        max_participants: 10,
        current_participants: 0,
        status: 'published',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrismaService.activities.findUnique.mockResolvedValue(activity);
      mockPrismaService.$executeRaw.mockResolvedValue(0); // 0 rows updated (already at 0)

      await expect(service.decrementParticipants('activity-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });
  });
});

