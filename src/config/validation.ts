import * as Joi from 'joi';

export function validate(config: Record<string, unknown>) {
    const schema = Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('production'),
        PORT: Joi.number().default(3000),

        DATABASE_URL: Joi.string().uri().required(),
        DIRECT_URL: Joi.string().uri().optional(),
        JWT_EXPIRES_IN: Joi.string().optional(),

        SUPABASE_PROJECT_REF: Joi.string().required(),
        SUPABASE_SECRET_KEY: Joi.string().required(),

        STRIPE_SECRET_KEY: Joi.string().required(),
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),
        STRIPE_PREMIUM_PRICE_ID: Joi.string().required(),
        FRONTEND_BASE_URL: Joi.string().uri().required(),
        STRIPE_SUCCESS_PATH: Joi.string().required(),
        STRIPE_CANCEL_PATH: Joi.string().required(),

        EMAIL_PROVIDER_MODE: Joi.string().valid('log', 'webhook').default('log'),
        EMAIL_FROM: Joi.string().email().optional(),
        EMAIL_WEBHOOK_URL: Joi.string().uri().optional(),
    });

    const { error, value } = schema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: true,
    });

    if (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/dc96d955-be98-435e-8ebf-9e8110e8a442', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'pre-fix', hypothesisId: 'H3', location: 'src/config/validation.ts:31', message: 'Config validation error details', data: { messages: error.details?.map((d: Joi.ValidationErrorItem) => d.message) }, timestamp: Date.now() }) }).catch(() => { });
        // #endregion agent log
        throw new Error(
            `Config validation error:\n${error.details
                .map((d: Joi.ValidationErrorItem) => `- ${d.message}`)
                .join('\n')}`,
        );
    }

    return value;
}
