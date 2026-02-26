import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let emailService: any;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      notificationPreference: {
        upsert: jest.fn(),
      },
      notificationDelivery: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    emailService = {
      sendNotificationEmail: jest.fn(),
    };

    service = new NotificationsService(prisma, emailService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('skips creation when preference is disabled for notification type', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({
      recommended_activities: false,
      upcoming_activity_reminders: true,
      host_join_cancel_updates: true,
      time_location_change_alerts: true,
      safety_alerts: true,
      channel_in_app: true,
      channel_email: true,
      channel_browser: true,
    });

    const created = await service.createNotification({
      recipientUserId: 'user-1',
      type: 'recommendation_match' as any,
      title: 'Recommended',
      body: 'Try this activity',
    });

    expect(created).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates notification and marks in-app delivery as sent', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({
      recommended_activities: true,
      upcoming_activity_reminders: true,
      host_join_cancel_updates: true,
      time_location_change_alerts: true,
      safety_alerts: true,
      channel_in_app: true,
      channel_email: false,
      channel_browser: false,
    });
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      type: 'upcoming_activity',
      title: 'Reminder',
      body: 'Starting soon',
      payload: {},
      is_read: false,
      read_at: null,
      created_at: new Date(),
      deliver_in_app: true,
      deliver_email: false,
      deliver_browser: false,
    });

    await service.createNotification({
      recipientUserId: 'user-1',
      type: 'upcoming_activity' as any,
      title: 'Reminder',
      body: 'Starting soon',
    });

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(prisma.notificationDelivery.createMany).toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notification_id: 'notif-1',
        }),
      }),
    );
    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('marks all user notifications as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });

    const result = await service.markAllRead('user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipient_user_id: 'user-1', is_read: false },
      }),
    );
    expect(result.updatedCount).toBe(4);
  });
});

