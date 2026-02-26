export default () => ({
    nodeEnv: process.env.NODE_ENV,
    port: Number(process.env.PORT || 3000),

    database: {
        url: process.env.DATABASE_URL,
        directUrl: process.env.DIRECT_URL,
    },

    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },

    notifications: {
        emailProviderMode: process.env.EMAIL_PROVIDER_MODE ?? 'log',
        emailFrom: process.env.EMAIL_FROM ?? 'no-reply@outercircl.local',
        emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL,
    },
});
