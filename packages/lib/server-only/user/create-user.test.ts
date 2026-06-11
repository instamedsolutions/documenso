import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaUserFindFirstMock,
  prismaUserCreateMock,
  prismaTransactionMock,
  createPersonalOrganisationMock,
  hashMock,
} = vi.hoisted(() => ({
  prismaUserFindFirstMock: vi.fn(),
  prismaUserCreateMock: vi.fn(),
  prismaTransactionMock: vi.fn(),
  createPersonalOrganisationMock: vi.fn(),
  hashMock: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    user: {
      findFirst: prismaUserFindFirstMock,
    },
    $transaction: prismaTransactionMock,
  },
}));

vi.mock('@node-rs/bcrypt', () => ({
  hash: hashMock,
}));

vi.mock('../organisation/create-organisation', () => ({
  createPersonalOrganisation: createPersonalOrganisationMock,
}));

import { createUser } from './create-user';

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hashMock.mockResolvedValue('hashed-password');
    prismaUserFindFirstMock.mockResolvedValue(null);
    createPersonalOrganisationMock.mockResolvedValue(undefined);

    // Run the transaction callback with a tx exposing user.create.
    prismaTransactionMock.mockImplementation(async (callback) => callback({ user: { create: prismaUserCreateMock } }));

    prismaUserCreateMock.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
  });

  it('creates an unverified user by default (emailVerified null)', async () => {
    await createUser({ name: 'Test User', email: 'Test@Example.com', password: 'password' });

    expect(prismaUserCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Test User',
          email: 'test@example.com',
          password: 'hashed-password',
          emailVerified: null,
        }),
      }),
    );
  });

  it('creates an enabled (verified) user when emailVerified is provided', async () => {
    const verifiedAt = new Date('2024-01-01T00:00:00.000Z');

    const user = await createUser({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password',
      emailVerified: verifiedAt,
    });

    expect(prismaUserCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailVerified: verifiedAt,
        }),
      }),
    );
    expect(user.emailVerified).toEqual(verifiedAt);
  });

  it('throws when the email is already taken', async () => {
    prismaUserFindFirstMock.mockResolvedValue({ id: 99, email: 'test@example.com' });

    await expect(createUser({ name: 'Test User', email: 'test@example.com', password: 'password' })).rejects.toThrow();

    expect(prismaUserCreateMock).not.toHaveBeenCalled();
  });
});
