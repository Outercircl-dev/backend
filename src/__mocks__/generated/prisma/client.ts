export class PrismaClientKnownRequestError extends Error {
  code: string;
  clientVersion: string;
  meta?: Record<string, unknown>;

  constructor(message: string, options: { code: string; clientVersion: string; meta?: Record<string, unknown> }) {
    super(message);
    this.code = options.code;
    this.clientVersion = options.clientVersion;
    this.meta = options.meta;
  }
}

export const Prisma = {
  PrismaClientKnownRequestError,
};

export class PrismaClient {
  interest = { findMany: jest.fn() };
  $disconnect = jest.fn();
  $connect = jest.fn();
}
