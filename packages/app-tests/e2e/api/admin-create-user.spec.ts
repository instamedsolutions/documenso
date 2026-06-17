import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { nanoid } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';
import { expect, test } from '@playwright/test';

const WEBAPP_BASE_URL = NEXT_PUBLIC_WEBAPP_URL();
const ENDPOINT = `${WEBAPP_BASE_URL}/api/auth/admin/create-user`;
const RESET_ENDPOINT = `${WEBAPP_BASE_URL}/api/auth/admin/reset-password`;

const MASTER_API_KEY = process.env.NEXT_PRIVATE_MASTER_API_KEY ?? '';

const PASSWORD = 'Password123#';

const uniqueEmail = () => `master-${nanoid()}@test.documenso.com`.toLowerCase();

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Master Created User',
  email: uniqueEmail(),
  password: PASSWORD,
  ...overrides,
});

test.describe.configure({ mode: 'parallel' });

test.describe('Admin master-key user creation', () => {
  // The endpoint reads NEXT_PRIVATE_MASTER_API_KEY from the server environment.
  // Skip the suite if it is not configured (both server and test load it from .env).
  test.skip(!MASTER_API_KEY, 'NEXT_PRIVATE_MASTER_API_KEY is not configured');

  test('rejects requests without an Authorization header', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: validBody(),
    });

    expect(res.status()).toBe(401);
  });

  test('rejects requests with an invalid master API key', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}-wrong` },
      data: validBody(),
    });

    expect(res.status()).toBe(401);
  });

  test('creates an enabled user and skips the verification email flow', async ({ request }) => {
    const email = uniqueEmail();

    const res = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email, enabled: true }),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.email).toBe(email);
    expect(body.emailVerified).not.toBeNull();

    const user = await prisma.user.findFirst({
      where: { email },
      include: { verificationTokens: true },
    });

    expect(user).not.toBeNull();
    // Enabled => email is verified immediately so the account can sign in.
    expect(user?.emailVerified).not.toBeNull();
    // Enabled => no confirmation email / verification token is created.
    expect(user?.verificationTokens.length).toBe(0);
  });

  test('creates a pending user and triggers the verification email flow', async ({ request }) => {
    const email = uniqueEmail();

    const res = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email, enabled: false }),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.email).toBe(email);
    expect(body.emailVerified).toBeNull();

    const user = await prisma.user.findFirst({ where: { email } });
    expect(user).not.toBeNull();
    // Not enabled => email is unverified (standard signup behaviour).
    expect(user?.emailVerified).toBeNull();

    // The confirmation email job runs asynchronously and creates a verification token.
    await expect
      .poll(
        async () => {
          const count = await prisma.verificationToken.count({
            where: { userId: user?.id },
          });

          return count;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });

  test('defaults to a pending user when enabled is omitted', async ({ request }) => {
    const email = uniqueEmail();

    const res = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email }),
    });

    expect(res.status()).toBe(201);

    const user = await prisma.user.findFirst({ where: { email } });
    expect(user?.emailVerified).toBeNull();
  });

  test('rejects creating a user that already exists', async ({ request }) => {
    const email = uniqueEmail();

    const first = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email, enabled: true }),
    });
    expect(first.status()).toBe(201);

    const second = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email, enabled: true }),
    });

    expect(second.ok()).toBeFalsy();
    expect(second.status()).toBeGreaterThanOrEqual(400);
  });

  test('reset-password rejects requests without an Authorization header', async ({ request }) => {
    const res = await request.post(RESET_ENDPOINT, {
      data: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(res.status()).toBe(401);
  });

  test('reset-password returns 404 for a non-existent account', async ({ request }) => {
    const res = await request.post(RESET_ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(res.status()).toBe(404);
  });

  test('reset-password resets an existing account password and keeps it verified', async ({ request }) => {
    const email = uniqueEmail();

    const created = await request.post(ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: validBody({ email, enabled: true }),
    });
    expect(created.status()).toBe(201);

    const before = await prisma.user.findFirst({ where: { email } });
    expect(before).not.toBeNull();

    const res = await request.post(RESET_ENDPOINT, {
      headers: { Authorization: `Bearer ${MASTER_API_KEY}` },
      data: { email, password: `${PASSWORD}New`, enabled: true },
    });

    expect(res.status()).toBe(200);

    const after = await prisma.user.findFirst({ where: { email } });
    // The password hash changed and the account is still verified (usable).
    expect(after?.password).not.toBe(before?.password);
    expect(after?.emailVerified).not.toBeNull();
  });
});
