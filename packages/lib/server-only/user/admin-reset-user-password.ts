import { prisma } from '@documenso/prisma';
import { hash } from '@node-rs/bcrypt';

import { SALT_ROUNDS } from '../../constants/auth';
import { AppError, AppErrorCode } from '../../errors/app-error';

export interface AdminResetUserPasswordOptions {
  email: string;
  password: string;
  /**
   * When true, ensures the account's email is marked as verified so it is
   * immediately usable (able to sign in). Never downgrades an already-verified
   * account.
   */
  enabled?: boolean;
}

/**
 * Resets an existing user's password using the privileged master-API-key flow.
 *
 * Unlike the public token-based reset, this is intended for trusted
 * server-to-server use: a backend can re-provision an account it previously
 * disconnected (its API tokens revoked) by resetting the password and then
 * signing in to generate a fresh token.
 */
export const adminResetUserPassword = async ({ email, password, enabled = false }: AdminResetUserPasswordOptions) => {
  const normalisedEmail = email.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      email: normalisedEmail,
    },
  });

  if (!user) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'No account exists for this email',
    });
  }

  const hashedPassword = await hash(password, SALT_ROUNDS);

  return prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: hashedPassword, // Todo: (RR7) Drop password.
      emailVerified: enabled ? (user.emailVerified ?? new Date()) : user.emailVerified,
    },
  });
};
