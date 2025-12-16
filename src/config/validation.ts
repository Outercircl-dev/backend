import * as Joi from 'joi';

export function validate(config: Record<string, unknown>) {
    const schema = Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
        PORT: Joi.number().default(3000),

        DATABASE_URL: Joi.string().uri().required(),
        DIRECT_URL: Joi.string().uri().optional(),

        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().optional(),
    });

    const { error, value } = schema.validate(config, {
        abortEarly: false,
    });

    if (error) {
        throw new Error(
            `Config validation error:\n${error.details
                .map(d => `- ${d.message}`)
                .join('\n')}`,
        );
    }

    return value;
}
