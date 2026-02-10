import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { MembershipTiersService } from 'src/config/membership-tiers.service';

const mockMembershipTiersService = {
  getTierRules: jest.fn(),
  getDefaultTier: jest.fn(),
  resolveTierKey: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: MembershipTiersService,
          useValue: mockMembershipTiersService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
