import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProfileService, type ProfileInput } from './profile.service';

describe('ProfileService usernames', () => {
  let service: ProfileService;
  let prisma: {
    user_profiles: any;
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

    expect(prisma.user_profiles.upsert).not.toHaveBeenCalled();
  });

  it('rejects duplicate username when unique constraint conflicts', async () => {
    prisma.user_profiles.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['username'] },
      }),
    );

    await expect(
      service.upsertProfile(buildInput({ username: 'taken_name' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows reused username after previous profile deletion', async () => {
    prisma.user_profiles.upsert.mockResolvedValue({
      id: 'profile-2',
      user_id: 'user-2',
      username: 'reusable_name',
    });

    const result = await service.upsertProfile(
      buildInput({
        supabaseUserId: 'user-2',
        username: 'reusable_name',
      }),
    );

    expect(result.username).toBe('reusable_name');
  });

  it('reports username availability as false when claimed by another user', async () => {
    prisma.user_profiles.findUnique.mockResolvedValue({ user_id: 'someone-else' });

    const result = await service.checkUsernameAvailability('taken_name', 'user-1');

    expect(result.available).toBe(false);
  });
});
