import { ActivityNotificationsService } from './activity-notifications.service';

describe('ActivityNotificationsService', () => {
  let service: ActivityNotificationsService;
  let prisma: { activity: { findUnique: jest.Mock } };
  let notificationsService: { createNotification: jest.Mock };

  beforeEach(() => {
    prisma = {
      activity: {
        findUnique: jest.fn(),
      },
    };
    notificationsService = {
      createNotification: jest.fn(),
    };
    service = new ActivityNotificationsService(
      prisma as any,
      notificationsService as any,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sends both host and participant notifications for private join requests', async () => {
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      host_id: 'host-1',
      title: 'Coffee meetup',
    });

    await service.emit({
      activityId: 'activity-1',
      participantId: 'participant-1',
      userId: 'participant-user-1',
      type: 'activity.approval_pending',
    });

    expect(notificationsService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationsService.createNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        recipientUserId: 'host-1',
        type: 'participant_joined',
      }),
    );
    expect(notificationsService.createNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        recipientUserId: 'participant-user-1',
        type: 'host_update',
      }),
    );
  });
});
