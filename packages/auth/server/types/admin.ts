import { ZNameSchema } from '@documenso/lib/constants/auth';
import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

import { ZPasswordSchema } from './email-password';

/**
 * Payload for creating a user via the master API key.
 *
 * Mirrors the public signup schema but adds the `enabled` flag, which - when
 * true - marks the account's email as verified immediately and skips the
 * confirmation email flow.
 */
export const ZAdminCreateUserSchema = z.object({
  name: ZNameSchema,
  email: zEmail(),
  password: ZPasswordSchema,
  signature: z.string().nullish(),
  enabled: z.boolean().optional().default(false),
});

export type TAdminCreateUserSchema = z.infer<typeof ZAdminCreateUserSchema>;
