import { AppError } from '@documenso/lib/errors/app-error';
import { jobsClient } from '@documenso/lib/jobs/client';
import { verifyMasterApiKey } from '@documenso/lib/server-only/auth/verify-master-api-key';
import { createUser } from '@documenso/lib/server-only/user/create-user';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import { AuthenticationErrorCode } from '../lib/errors/error-codes';
import { ZAdminCreateUserSchema } from '../types/admin';
import type { HonoAuthContext } from '../types/context';

/**
 * Admin routes authenticated via the master API key (`NEXT_PRIVATE_MASTER_API_KEY`).
 *
 * These endpoints are intended for trusted server-to-server use only. They are
 * deliberately not gated by `NEXT_PUBLIC_DISABLE_SIGNUP` or the per-provider
 * signup flags, so a backend holding the master key can always provision users.
 */
export const adminRoute = new Hono<HonoAuthContext>()
  /**
   * Require a valid master API key for every admin route. Runs before request
   * body validation so unauthenticated callers cannot probe the endpoints.
   */
  .use('*', async (c, next) => {
    const authorization = c.req.header('Authorization') ?? '';

    // Support for both "Authorization: Bearer xxx" and "Authorization: xxx".
    const [providedKey] = authorization.split('Bearer ').filter((s) => s.length > 0);

    if (!verifyMasterApiKey(providedKey)) {
      throw new AppError(AuthenticationErrorCode.Unauthorized, {
        message: 'Invalid master API key',
        statusCode: 401,
      });
    }

    await next();
  })
  /**
   * Create a user account.
   *
   * When `enabled` is true the account's email is marked as verified
   * immediately and the confirmation email flow is skipped, so the user can
   * sign in right away. Otherwise the standard confirmation email is sent.
   */
  .post('/create-user', sValidator('json', ZAdminCreateUserSchema), async (c) => {
    const { name, email, password, signature, enabled } = c.req.valid('json');

    const user = await createUser({
      name,
      email,
      password,
      signature,
      emailVerified: enabled ? new Date() : null,
    });

    // Only trigger the confirmation email when the account is not pre-enabled.
    if (!enabled) {
      await jobsClient.triggerJob({
        name: 'send.signup.confirmation.email',
        payload: {
          email: user.email,
        },
      });
    }

    return c.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
      201,
    );
  });
