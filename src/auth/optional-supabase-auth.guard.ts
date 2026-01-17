import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Allows public routes to optionally attach the Supabase user context when a valid
 * bearer token is provided. Unlike SupabaseAuthGuard, authentication failures are
 * ignored so anonymous users can still access the endpoint.
 */
@Injectable()
export class OptionalSupabaseAuthGuard extends AuthGuard('supabase-jwt') {
  handleRequest(err: unknown, user: any, info: unknown, context: ExecutionContext) {
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}

