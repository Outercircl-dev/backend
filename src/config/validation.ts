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
    });

    const { error, value } = schema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: true,
    });

    if (error) {
        throw new Error(
            `Config validation error:\n${error.details
                .map((d: Joi.ValidationErrorItem) => `- ${d.message}`)
                .join('\n')}`,
        );
    }

    return value;
}
