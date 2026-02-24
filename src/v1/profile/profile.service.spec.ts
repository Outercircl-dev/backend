import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProfileService, type ProfileInput } from './profile.service';

describe('ProfileService username reservations', () => {
  let service: ProfileService;
  let prisma: {
    user_profiles: any;
    usernames: any;
    activity: any;
    $transaction: jest.Mock;
  };

  const buildInput = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
    supabaseUserId: 'user-1',
    username: 'fresh_name',
    fullName: 'Jane Doe',
    dateOfBirth: '1995-02-14',
    gender: 'female',
    interests: ['running', 'coffee', 'hiking'],
    acceptedTos: true,
    acceptedGuidelines: true,
    confirmedAge: true,
    confirmedPlatonic: true,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      user_profiles: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      usernames: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      activity: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.all(arg);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('rejects invalid username format', async () => {
    await expect(
      service.upsertProfile(buildInput({ username: 'Bad Name' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.usernames.findUnique).not.toHaveBeenCalled();
    expect(prisma.user_profiles.upsert).not.toHaveBeenCalled();
  });

  it('rejects duplicate username claimed by another user', async () => {
    prisma.usernames.findUnique.mockResolvedValue({
      username: 'taken_name',
      claimed_by_user_id: 'someone-else',
    });

    await expect(
      service.upsertProfile(buildInput({ username: 'taken_name' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.usernames.create).not.toHaveBeenCalled();
    expect(prisma.user_profiles.upsert).not.toHaveBeenCalled();
  });

  it('allows idempotent submit when username is already claimed by same user', async () => {
    prisma.usernames.findUnique.mockResolvedValue({
      username: 'same_name',
      claimed_by_user_id: 'user-1',
    });
    prisma.user_profiles.upsert.mockResolvedValue({
      id: 'profile-1',
      user_id: 'user-1',
      username: 'same_name',
    });

    const result = await service.upsertProfile(
      buildInput({ username: 'same_name' }),
    );

    expect(prisma.usernames.create).not.toHaveBeenCalled();
    expect(prisma.user_profiles.upsert).toHaveBeenCalled();
    expect(result.username).toBe('same_name');
  });

  it('keeps usernames permanently reserved after profile deletion', async () => {
    prisma.usernames.findUnique.mockResolvedValue({
      username: 'legacy_name',
      claimed_by_user_id: 'deleted-user',
    });

    await expect(
      service.updateProfile('new-user', { username: 'legacy_name' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user_profiles.update).not.toHaveBeenCalled();
  });
});
