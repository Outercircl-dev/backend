import { Test, TestingModule } from '@nestjs/testing';
import { InterestsController } from './interests.controller';
import { InterestsService } from './interests.service';

jest.mock('src/generated/prisma/client');

describe('InterestsController', () => {
  let controller: InterestsController;
  let service: InterestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterestsController],
      providers: [
        {
          provide: InterestsService,
          useValue: {
            // mock methods here as needed
          },
        },
      ],
    }).compile();

    service = module.get<InterestsService>(InterestsService);
    controller = new InterestsController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
