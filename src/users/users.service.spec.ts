import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { MembershipTiersService } from 'src/config/membership-tiers.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, MembershipTiersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
