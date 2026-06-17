import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaUserFindFirstMock, prismaUserUpdateMock, hashMock } = vi.hoisted(() => ({
  prismaUserFindFirstMock: vi.fn(),
  prismaUserUpdateMock: vi.fn(),
  hashMock: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    user: {
      findFirst: prismaUserFindFirstMock,
      update: prismaUserUpdateMock,
    },
  },
}));

vi.mock('@node-rs/bcrypt', () => ({
  hash: hashMock,
}));

import { adminResetUserPassword } from './admin-reset-user-password';

describe('adminResetUserPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hashMock.mockResolvedValue('hashed-password');
    prismaUserUpdateMock.mockImplementation(async ({ data }) => ({
      id: 7,
      email: 'test@example.com',
      name: 'Test User',
      ...data,
    }));
  });

  it('throws when no account exists for the email', async () => {
    prismaUserFindFirstMock.mockResolvedValue(null);

    await expect(adminResetUserPassword({ email: 'missing@example.com', password: 'new-password' })).rejects.toThrow();

    expect(prismaUserUpdateMock).not.toHaveBeenCalled();
  });

  it('resets the (hashed) password for an existing user and lowercases the email lookup', async () => {
    prismaUserFindFirstMock.mockResolvedValue({ id: 7, email: 'test@example.com', emailVerified: null });

    await adminResetUserPassword({ email: 'Test@Example.com', password: 'new-password' });

    expect(prismaUserFindFirstMock).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    expect(hashMock).toHaveBeenCalledWith('new-password', expect.anything());
    expect(prismaUserUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ password: 'hashed-password', emailVerified: null }),
      }),
    );
  });

  it('re-verifies the account when enabled and it was unverified', async () => {
    prismaUserFindFirstMock.mockResolvedValue({ id: 7, email: 'test@example.com', emailVerified: null });

    const user = await adminResetUserPassword({
      email: 'test@example.com',
      password: 'new-password',
      enabled: true,
    });

    const call = prismaUserUpdateMock.mock.calls[0][0];
    expect(call.data.emailVerified).toBeInstanceOf(Date);
    expect(user.emailVerified).toBeInstanceOf(Date);
  });

  it('keeps the existing verification date when already verified', async () => {
    const verifiedAt = new Date('2024-01-01T00:00:00.000Z');
    prismaUserFindFirstMock.mockResolvedValue({ id: 7, email: 'test@example.com', emailVerified: verifiedAt });

    await adminResetUserPassword({
      email: 'test@example.com',
      password: 'new-password',
      enabled: true,
    });

    const call = prismaUserUpdateMock.mock.calls[0][0];
    expect(call.data.emailVerified).toEqual(verifiedAt);
  });
});
