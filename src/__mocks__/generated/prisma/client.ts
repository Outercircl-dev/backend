export class PrismaClient {
  interest = { findMany: jest.fn() };
  $disconnect = jest.fn();
  $connect = jest.fn();
}
